import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVisitaById } from "@/lib/db/queries/visite";
import { getRisposteByVisita, estraiNominativi } from "@/lib/db/queries/risposte";
import { BUCKET_VERBALI } from "@/lib/db/queries/verbali";
import { generaVerbale, type VerbaleData } from "@/lib/pdf/generaVerbale";

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
  let obbligatorieMancanti = 0;
  let campiTestoMancanti = 0;
  for (const sez of visita.template_snapshot.sezioni) {
    for (const d of sez.domande) {
      const r = rispostaPer.get(d.id);
      const v = r?.valore ?? null;
      if (!v) {
        if (d.obbligatoria) obbligatorieMancanti += 1;
        continue;
      }
      if (v === "NC" || v === "PC") {
        if (!(r?.azione_correttiva ?? "").trim()) campiTestoMancanti += 1;
      } else if (v === "NV" || v === "NA") {
        if (!(r?.osservazioni ?? "").trim()) campiTestoMancanti += 1;
      }
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
    nominativi: estraiNominativi(risposte),
    template: visita.template_snapshot,
    risposte: Object.fromEntries(
      risposte.map((r) => [
        r.domanda_id,
        {
          esito: r.valore,
          azione_correttiva: r.azione_correttiva,
          osservazioni: r.osservazioni,
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
