import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVisitaById } from "@/lib/db/queries/visite";
import {
  getRisposteByVisita,
  estraiNominativi,
  estraiLavoratori,
} from "@/lib/db/queries/risposte";
import {
  getImpreseByVisita,
  getRisposteImpreseByVisita,
} from "@/lib/db/queries/imprese";
import { BUCKET_VERBALI } from "@/lib/db/queries/verbali";
import {
  generaVerbale,
  type VerbaleData,
  type IntestazioneExtraHaccp,
} from "@/lib/pdf/generaVerbale";
import {
  sezioneCollassata,
  domandaGateAttiva,
  completezzaImpreseSezioneOtto,
  completezzaFormazione,
} from "@/lib/checklist/completa";
import { isSnapshotHaccp } from "@/lib/checklist/haccpSnapshot";
import { istanzeFormazione, genericheFormazione } from "@/lib/checklist/formazione";
import { ricalcolaEsitiAutomatici } from "@/lib/scadenze/ricalcolo";
import {
  derivaScadenzeMaterializzabili,
  type RispostaConId,
} from "@/lib/scadenze/materializza";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Autenticazione server-side
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // 2. Carica la visita (RLS: solo proprietario o admin)
  const visita = await getVisitaById(id);
  if (!visita) {
    return NextResponse.json({ error: "Visita non trovata" }, { status: 404 });
  }

  // 3. Deve essere in bozza
  if (visita.stato !== "bozza") {
    return NextResponse.json(
      { error: "La visita non è in bozza: verbale già generato o non modificabile." },
      { status: 409 }
    );
  }

  // 4. Validazione completezza (fonte di verità server-side):
  //    a) nessuna domanda obbligatoria senza esito
  //    b) nessuna risposta NC/PC/NV/NA con campo testo obbligatorio vuoto
  //       (azione correttiva per NC/PC, motivazione per NV/NA)
  const risposte = await getRisposteByVisita(id);
  const rispostaPer = new Map(risposte.map((r) => [r.domanda_id, r]));

  // 4-bis. SAFETY NET (Sprint 12.4): ricalcola gli esiti a calcolo automatico
  //   contro la data del sopralluogo PRIMA di validare/congelare. Copre le
  //   chiusure che non passano dalla checklist (es. bottone dal riepilogo), dove
  //   il valore in `risposte.valore` potrebbe essere stale (bozza duplicata con
  //   nuova data_visita). Stessa funzione del ricalcolo client, non duplicata.
  //   NA/NV manuali non toccati; periodicità dallo snapshot immutabile. La
  //   validazione completezza sotto opera sui valori aggiornati (un C→NC senza
  //   azione correttiva viene quindi correttamente bloccato).
  const dataVerificaDi = (r: (typeof risposte)[number]) =>
    r.campo_extra && typeof r.campo_extra === "object"
      ? (r.campo_extra as { data_verifica?: string }).data_verifica ?? null
      : null;
  // Sprint 14: per la formazione lavoratori (D-03-001) la data è nell'anagrafica
  // del lavoratore in SEZ-01 — passata al ricalcolo.
  const lavoratori = estraiLavoratori(risposte);
  const diffs = ricalcolaEsitiAutomatici(
    visita.template_snapshot,
    risposte.map((r) => ({ domandaId: r.domanda_id, valore: r.valore, dataVerifica: dataVerificaDi(r) })),
    visita.data_visita,
    lavoratori
  );
  for (const d of diffs) {
    if (d.base.formazione_lavoratori) {
      // Riga composita lavoratore (D-03-001::<lavId>): upsert (può non esistere
      // ancora), sezione SEZ-03. Nessun campo testo (esito puro calcolato).
      const { error: ins } = await supabase.from("risposte").upsert(
        {
          visita_id: visita.id,
          domanda_id: d.domandaId,
          sezione_id: "SEZ-03",
          valore: d.nuovoValore,
          aggiornata_il: new Date().toISOString(),
        },
        { onConflict: "visita_id,domanda_id" }
      );
      if (ins) {
        return NextResponse.json(
          { error: `Ricalcolo formazione lavoratori fallito: ${ins.message}` },
          { status: 500 }
        );
      }
    } else {
      const { error: upd } = await supabase
        .from("risposte")
        .update({ valore: d.nuovoValore, aggiornata_il: new Date().toISOString() })
        .eq("visita_id", visita.id)
        .eq("domanda_id", d.domandaId);
      if (upd) {
        return NextResponse.json(
          { error: `Ricalcolo scadenza fallito: ${upd.message}` },
          { status: 500 }
        );
      }
    }
    const rr = rispostaPer.get(d.domandaId); // stesso oggetto usato da validazione/PDF
    if (rr) rr.valore = d.nuovoValore;
  }

  const nominativi = estraiNominativi(risposte); // strutturati (Sprint 12)
  // SEZ-08 multi-impresa: imprese + risposte per impresa (vuote per legacy v1).
  const imprese = await getImpreseByVisita(id);
  const risposteImprese = await getRisposteImpreseByVisita(id);
  const rispostaImpresaPer = new Map(
    risposteImprese.map((r) => [`${r.impresaId}:${r.domandaId}`, r])
  );
  // Il modello obblighi differisce per modulo: HACCP → PC/NC richiedono
  // osservazione (osservazione_evidenza), NV richiede motivazione; sicurezza →
  // PC/NC richiedono azione correttiva, NV/NA motivazione. (Sprint HACCP 2, C3/C4)
  const haccp = isSnapshotHaccp(visita.template_snapshot);
  let obbligatorieMancanti = 0;
  let campiTestoMancanti = 0;
  for (const sez of visita.template_snapshot.sezioni) {
    // Sezione condizionale collassata (filtro = NA): conta solo la domanda filtro.
    const valoreFiltro = sez.domanda_filtro
      ? rispostaPer.get(sez.domanda_filtro)?.valore ?? null
      : null;
    const collassata = sezioneCollassata(sez, valoreFiltro);
    const multiEspansa = Boolean(sez.multi_impresa) && !collassata;
    const formazione = Boolean(sez.formazione_per_nominativo);
    const genFormIds = formazione
      ? new Set(genericheFormazione(sez, nominativi).map((d) => d.id))
      : null;
    for (const d of sez.domande) {
      if (collassata && d.id !== sez.domanda_filtro) continue;
      // Multi-impresa: le D-08-002..009 sono validate sotto per impresa.
      if (multiEspansa && d.id !== sez.domanda_filtro) continue;
      // Formazione: solo le generiche dirette attive sono validate qui (le
      // istanze per-nominativo, fusione DL/RSPP inclusa, sotto).
      if (genFormIds && !genFormIds.has(d.id)) continue;
      // Gate condizionale (es. sorveglianza sanitaria): salta se non attiva.
      if (d.gated_by && !domandaGateAttiva(d, rispostaPer.get(d.gated_by)?.valore ?? null)) continue;
      const r = rispostaPer.get(d.id);
      const v = r?.valore ?? null;
      if (!v) {
        if (d.obbligatoria) obbligatorieMancanti += 1;
        continue;
      }
      if (haccp) {
        // HACCP: PC/NC → osservazione obbligatoria; NV → motivazione; C/NA liberi.
        if (v === "NC" || v === "PC") {
          if (!(r?.osservazione_evidenza ?? "").trim()) campiTestoMancanti += 1;
        } else if (v === "NV") {
          if (!(r?.osservazioni ?? "").trim()) campiTestoMancanti += 1;
        }
      } else if (v === "NC" || v === "PC") {
        if (!(r?.azione_correttiva ?? "").trim()) campiTestoMancanti += 1;
      } else if (v === "NV" || v === "NA") {
        if (!(r?.osservazioni ?? "").trim()) campiTestoMancanti += 1;
      }
    }
    // Multi-impresa espansa: serve ≥1 impresa con tutte le 8 domande risposte.
    if (multiEspansa) {
      const dids = sez.domande
        .filter((d) => d.id !== sez.domanda_filtro)
        .map((d) => d.id);
      const { mancanti } = completezzaImpreseSezioneOtto(
        dids,
        imprese.map((i) => i.id),
        (impId, did) => rispostaImpresaPer.get(`${impId}:${did}`) ?? null
      );
      obbligatorieMancanti += mancanti;
    }
    // Formazione per-nominativo: ogni istanza (fusione DL/RSPP applicata) deve
    // avere una risposta completa (esito + azione per NC/PC, motivazione NV/NA).
    if (formazione) {
      const { mancanti } = completezzaFormazione(
        istanzeFormazione(sez, nominativi).map((i) => i.compositeId),
        (cid) => {
          const r = rispostaPer.get(cid);
          return r
            ? { esito: r.valore, azioneCorrettiva: r.azione_correttiva, osservazione: r.osservazioni }
            : null;
        }
      );
      obbligatorieMancanti += mancanti;
    }
  }
  if (obbligatorieMancanti > 0) {
    return NextResponse.json(
      {
        error: `${obbligatorieMancanti} domande obbligatorie senza risposta: impossibile generare il verbale.`,
      },
      { status: 422 }
    );
  }
  if (campiTestoMancanti > 0) {
    return NextResponse.json(
      {
        error: `${campiTestoMancanti} domande con campo obbligatorio non compilato (azione correttiva o motivazione)`,
      },
      { status: 422 }
    );
  }

  // 5. Numero verbale SC-YYYY-NNNN — RPC atomica (SECURITY DEFINER):
  //    assegna e persiste `numero_verbale` sulla visita in un'unica operazione.
  const { data: numeroVerbale, error: numErr } = await supabase.rpc(
    "assegna_numero_verbale",
    { p_visita_id: visita.id }
  );
  if (numErr || !numeroVerbale) {
    return NextResponse.json(
      {
        error: `Numerazione verbale fallita: ${numErr?.message ?? "nessun numero assegnato"}`,
      },
      { status: 500 }
    );
  }

  // 6. Dati per il PDF
  const dati: VerbaleData = {
    visita: {
      id: visita.id,
      data_visita: visita.data_visita,
      ora_inizio: visita.ora_inizio,
      note_preliminari: visita.note_preliminari,
      note_finali_visita: visita.note_conclusive,
      numero_verbale: numeroVerbale,
    },
    cliente: { ragione_sociale: visita.cliente_nome },
    sede: {
      nome: visita.sede_nome,
      indirizzo: visita.sede_indirizzo,
      citta: visita.sede_citta,
    },
    specialist: {
      nome_completo: visita.specialist_nome,
      qualifica: visita.qualifica_tecnico,
    },
    referente_cliente: visita.referente_cliente,
    nominativi,
    template: visita.template_snapshot,
    intestazioneExtra: visita.intestazione_extra as IntestazioneExtraHaccp,
    lavoratori,
    impreseAppalto: imprese,
    risposteImprese,
    risposte: Object.fromEntries(
      risposte.map((r) => [
        r.domanda_id,
        {
          esito: r.valore,
          azione_correttiva: r.azione_correttiva,
          osservazione_evidenza: r.osservazione_evidenza,
          osservazioni: r.osservazioni,
          data_verifica:
            r.campo_extra && typeof r.campo_extra === "object"
              ? (r.campo_extra as { data_verifica?: string }).data_verifica ?? null
              : null,
        },
      ])
    ),
  };

  const admin = createAdminClient();
  const storagePath = `${visita.id}/${numeroVerbale}.pdf`;
  let uploaded = false;

  try {
    // 7. Genera il PDF
    const buffer = await generaVerbale(dati);

    // 8. SHA256
    const sha256 = createHash("sha256").update(buffer).digest("hex");

    // 9. Upload su bucket privato
    const { error: upErr } = await admin.storage
      .from(BUCKET_VERBALI)
      .upload(storagePath, buffer, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upErr) {
      throw new Error(`Upload storage fallito: ${upErr.message}`);
    }
    uploaded = true;

    // 10. Record in verbali_pdf
    const { error: insErr } = await admin.from("verbali_pdf").insert({
      visita_id: visita.id,
      storage_path: storagePath,
      sha256_hash: sha256,
      numero_versione: 1,
      dimensione_bytes: buffer.length,
      generato_da: user.id,
    });
    if (insErr) {
      throw new Error(`Inserimento verbali_pdf fallito: ${insErr.message}`);
    }

    // 11. Chiusura verbale: stati + timestamp (numero già assegnato dalla RPC)
    const ora = new Date().toISOString();
    const { error: updErr } = await admin
      .from("visite")
      .update({
        stato: "verbale_generato",
        stato_verbale: "chiuso",
        completata_il: ora,
        verbale_generato_il: ora,
      })
      .eq("id", visita.id);
    if (updErr) {
      // rollback record verbali_pdf
      await admin.from("verbali_pdf").delete().eq("storage_path", storagePath);
      throw new Error(`Chiusura visita fallita: ${updErr.message}`);
    }

    // Audit (best-effort, non bloccante, fuori dalla transazione di business):
    // pdf generato + verbale chiuso. entity = il verbale (id = visita).
    await logAuditEvent({
      entityType: "verbale",
      entityId: visita.id,
      eventType: "verbale.pdf_generato",
      actorUserId: user.id,
      payload: { numero_verbale: numeroVerbale },
    });
    await logAuditEvent({
      entityType: "verbale",
      entityId: visita.id,
      eventType: "verbale.chiuso",
      actorUserId: user.id,
      payload: { numero_verbale: numeroVerbale },
    });

    // 11-ter. Materializzazione scadenze (proiezione read-only per /scadenze).
    //   Best-effort NON BLOCCANTE (come audit e slot): gira DOPO la chiusura
    //   committata, a valle del ricalcolo safety-net (i valori in `risposte`
    //   sono già aggiornati → mai stale), con service role e riconciliazione
    //   atomica via RPC `materializza_scadenze` (upsert latest-wins per
    //   sede+modulo+domanda + DELETE delle righe stale dello stesso modulo).
    //   PERIMETRO DICHIARATO: un attestato SENZA data (es. NC per assenza) NON
    //   viene materializzato — /scadenze è un registro di DATE; la visibilità
    //   delle NC senza data è dominio futuro di Criticità 2.0. Non è un bug.
    //   Un errore qui non deve MAI far fallire la chiusura del verbale.
    try {
      const { data: vRow } = await admin
        .from("visite")
        .select("modulo_id")
        .eq("id", visita.id)
        .single();
      const { data: righeScad, error: scadQErr } = await admin
        .from("risposte")
        .select(
          "id, domanda_id, sezione_id, valore, azione_correttiva, osservazione_evidenza, osservazioni, campo_extra"
        )
        .eq("visita_id", visita.id);
      if (scadQErr) throw new Error(scadQErr.message);
      const scadRows = derivaScadenzeMaterializzabili(
        visita.template_snapshot,
        (righeScad ?? []) as RispostaConId[]
      );
      const { error: matErr } = await admin.rpc("materializza_scadenze", {
        p_visita_id: visita.id,
        p_sede_id: visita.sede_id,
        p_cliente_id: visita.cliente_id,
        p_modulo_id: vRow?.modulo_id ?? null,
        p_rows: scadRows,
      });
      if (matErr) throw new Error(matErr.message);
    } catch (scadErr) {
      console.error(
        `materializzazione scadenze fallita (non bloccante) visitaId=${visita.id}:`,
        scadErr instanceof Error ? scadErr.message : scadErr
      );
    }

    // 11-bis. Transizione dello slot collegato a 'eseguita' (Sprint 15.2, Opzione A).
    //   Il collegamento visita↔slot è ESPLICITO alla creazione visita (STEP 3):
    //   qui si marca 'eseguita' SOLO lo slot già collegato a QUESTA visita, per
    //   match su visita_id — mai ricerca per sede/"primo slot libero" (rimosso).
    //   Visita fuori piano → nessuno slot collegato → 0 righe toccate = corretto,
    //   nessuna anomalia. try/catch DEDICATO: la chiusura del verbale non deve
    //   mai fallire per un problema sullo slot. Un errore REALE (non 0 match) è
    //   però loggato con contesto: lascerebbe lo slot "in lavorazione" perpetuo.
    try {
      const { error: slotErr } = await admin
        .from("visite_pianificate")
        .update({ stato: "eseguita" })
        .eq("visita_id", visita.id)
        .neq("stato", "eseguita");
      if (slotErr) {
        console.error(
          `transizione slot 'eseguita' fallita (non bloccante) visitaId=${visita.id}:`,
          slotErr.message
        );
      }
    } catch (aggErr) {
      console.error(
        `transizione slot 'eseguita' fallita (non bloccante) visitaId=${visita.id}:`,
        aggErr instanceof Error ? aggErr.message : aggErr
      );
    }

    // 12. OK
    return NextResponse.json({
      success: true,
      numero_verbale: numeroVerbale,
      visita_id: visita.id,
    });
  } catch (e) {
    // Rollback: rimuovi il file caricato e libera il numero già assegnato dalla
    // RPC (la visita non è stata chiusa), così un nuovo tentativo riparte pulito.
    if (uploaded) {
      await admin.storage.from(BUCKET_VERBALI).remove([storagePath]);
    }
    await admin.from("visite").update({ numero_verbale: null }).eq("id", visita.id);
    const msg = e instanceof Error ? e.message : "Errore generazione verbale.";
    console.error("genera-pdf:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
