"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn, formatDate } from "@/lib/utils";
import type {
  EsitoRisposta,
  ImpresaAppalto,
  Lavoratore,
  NominativiStrutturati,
  RispostaImpresaAppalto,
  TemplateSnapshot,
  TipoImpresa,
} from "@/types";
import { SEZIONE_NOMINATIVI, SEP_FORMAZIONE, idRispostaFormazione } from "@/types";
import type { RispostaSalvata } from "@/lib/db/queries/risposte";
import {
  rispostaCompleta,
  rispostaCompletaHaccp,
  sezioneCollassata,
  domandaAttiva,
  domandaGateAttiva,
  completezzaImpreseSezioneOtto,
  completezzaFormazione,
} from "@/lib/checklist/completa";
import { isSnapshotHaccp } from "@/lib/checklist/haccpSnapshot";
import {
  istanzeFormazione,
  genericheFormazione,
  dlCoincideRspp,
} from "@/lib/checklist/formazione";
import { calcolaEsitoAuto, etichettaAuto } from "@/lib/scadenze/autocalcolo";
import { ricalcolaEsitiAutomatici } from "@/lib/scadenze/ricalcolo";
import {
  salvaRispostaAction,
  salvaNominativiAction,
  salvaLavoratoriAction,
  creaImpresaAction,
  eliminaImpresaAction,
  salvaRispostaImpresaAction,
  salvaRispostaFormazioneAction,
  eliminaRispostaFormazioneAction,
} from "./actions";
import DomandaCard from "./DomandaCard";
import NominativiSEZ01 from "./NominativiSEZ01";
import LavoratoriSection from "./LavoratoriSection";
import LavoratoriFormazione from "./LavoratoriFormazione";
import SezioneAppaltiImprese, {
  type ImpEntry,
  IMP_ENTRY_VUOTA,
} from "./SezioneAppaltiImprese";
import FormazioneNominativi, {
  type FormEntry,
  FORM_ENTRY_VUOTA,
} from "./FormazioneNominativi";

interface Entry {
  valore: EsitoRisposta | null;
  azione: string;
  osservazioneEvidenza: string;
  osservazioni: string;
  dataVerifica: string; // campo data opzionale (D-01-016) → campo_extra.data_verifica
  sezioneId: string;
}

type Stato = "idle" | "saving" | "saved" | "error";

interface Props {
  visitaId: string;
  clienteNome: string;
  sedeNome: string;
  sedeIndirizzo: string;
  sedeCitta: string;
  dataVisita: string;
  oraInizio: string | null;
  specialistNome: string;
  qualifica: string | null;
  referenteCliente: string | null;
  stato: string;
  numeroVerbale: string | null;
  template: TemplateSnapshot;
  risposteIniziali: RispostaSalvata[];
  nominativiIniziali: NominativiStrutturati;
  lavoratoriIniziali: Lavoratore[];
  impreseIniziali: ImpresaAppalto[];
  risposteImpreseIniziali: RispostaImpresaAppalto[];
}

const DEBOUNCE_MS = 800;
const KEY_NOMINATIVI = "__nominativi__";
const KEY_LAVORATORI = "__lavoratori__";

/** data_verifica da campo_extra (stringa vuota se assente). */
function dataVerificaDa(campoExtra: unknown): string {
  return campoExtra && typeof campoExtra === "object"
    ? (campoExtra as { data_verifica?: string }).data_verifica ?? ""
    : "";
}

const PREFISSO_LAV = `D-03-001${SEP_FORMAZIONE}`;

interface StatoIniziale {
  risposte: Record<string, Entry>;
  formazione: Record<string, FormEntry>;
  // Id (standard e compositi formazione) il cui esito ricalcolato al mount
  // differisce dal salvato → da persistere per allineare il DB al display.
  diffStandard: string[];
  diffFormazione: string[];
  // Lavoratori (Sprint 14): esiti composite da upsertare e righe orfane da eliminare.
  diffLavoratori: { compositeId: string; esito: EsitoRisposta }[];
  deleteLavoratori: string[];
}

/**
 * Stato iniziale della checklist, applicando il ricalcolo degli esiti a calcolo
 * automatico contro `dataVisita` (Sprint 12.4) quando la visita è in BOZZA.
 * Il valore salvato in `risposte.valore` per queste domande NON è fonte di
 * verità finché la visita è bozza: può essere stale (es. bozza duplicata con
 * nuova data_visita) e va sempre ricalcolato contro la data del sopralluogo
 * corrente. In verbale chiuso i valori sono immutabili → nessun ricalcolo.
 */
function costruisciStatoIniziale(
  template: TemplateSnapshot,
  risposteIniziali: RispostaSalvata[],
  dataVisita: string,
  chiusa: boolean,
  lavoratori: Lavoratore[]
): StatoIniziale {
  const risposte: Record<string, Entry> = {};
  for (const sez of template.sezioni) {
    for (const d of sez.domande) {
      risposte[d.id] = {
        valore: null,
        azione: "",
        osservazioneEvidenza: "",
        osservazioni: "",
        dataVerifica: "",
        sezioneId: sez.id,
      };
    }
  }
  for (const r of risposteIniziali) {
    if (!risposte[r.domanda_id]) continue; // ignora la riga sintetica nominativi
    risposte[r.domanda_id] = {
      valore: r.valore,
      azione: r.azione_correttiva ?? "",
      osservazioneEvidenza: r.osservazione_evidenza ?? "",
      osservazioni: r.osservazioni ?? "",
      dataVerifica: dataVerificaDa(r.campo_extra),
      sezioneId: r.sezione_id,
    };
  }

  const formazione: Record<string, FormEntry> = {};
  for (const r of risposteIniziali) {
    if (r.sezione_id !== "SEZ-03" || !r.domanda_id.includes(SEP_FORMAZIONE)) continue;
    // Le righe composite dei lavoratori (D-03-001::<lavId>) NON sono formazione
    // per-figura: gestite a parte (badge read-only derivato da SEZ-01).
    if (r.domanda_id.startsWith(PREFISSO_LAV)) continue;
    formazione[r.domanda_id] = {
      esito: r.valore,
      azione: r.azione_correttiva ?? "",
      osservazione: r.osservazioni ?? "",
      dataVerifica: dataVerificaDa(r.campo_extra),
    };
  }

  const diffStandard: string[] = [];
  const diffFormazione: string[] = [];
  const diffLavoratori: { compositeId: string; esito: EsitoRisposta }[] = [];
  let deleteLavoratori: string[] = [];
  if (!chiusa) {
    const diffs = ricalcolaEsitiAutomatici(
      template,
      risposteIniziali.map((r) => ({
        domandaId: r.domanda_id,
        valore: r.valore,
        dataVerifica: dataVerificaDa(r.campo_extra) || null,
      })),
      dataVisita,
      lavoratori
    );
    for (const d of diffs) {
      // Lavoratori (Sprint 14): esito puro C/PC/NC, nessun prefill azione.
      if (d.base.formazione_lavoratori) {
        if (d.nuovoValore) diffLavoratori.push({ compositeId: d.domandaId, esito: d.nuovoValore });
        continue;
      }
      const prefill =
        (d.nuovoValore === "NC" || d.nuovoValore === "PC") &&
        Boolean(d.base.correzione_default?.trim());
      if (d.domandaId.includes(SEP_FORMAZIONE)) {
        const e = formazione[d.domandaId];
        if (!e) continue;
        e.esito = d.nuovoValore;
        if (prefill && !e.azione.trim()) e.azione = d.base.correzione_default!;
        diffFormazione.push(d.domandaId);
      } else {
        const e = risposte[d.domandaId];
        if (!e) continue;
        e.valore = d.nuovoValore;
        if (prefill && !e.azione.trim()) e.azione = d.base.correzione_default!;
        diffStandard.push(d.domandaId);
      }
    }
    // Righe composite lavoratori orfane (lavoratore rimosso o senza data) → elimina.
    const desiderati = new Set(
      lavoratori
        .filter((l) => l.dataFormazione)
        .map((l) => idRispostaFormazione("D-03-001", l.id))
    );
    deleteLavoratori = risposteIniziali
      .filter((r) => r.domanda_id.startsWith(PREFISSO_LAV) && !desiderati.has(r.domanda_id))
      .map((r) => r.domanda_id);
  }

  return {
    risposte,
    formazione,
    diffStandard,
    diffFormazione,
    diffLavoratori,
    deleteLavoratori,
  };
}

export default function ChecklistClient({
  visitaId,
  clienteNome,
  sedeNome,
  sedeIndirizzo,
  sedeCitta,
  dataVisita,
  oraInizio,
  specialistNome,
  qualifica,
  referenteCliente,
  stato,
  numeroVerbale,
  template,
  risposteIniziali,
  nominativiIniziali,
  lavoratoriIniziali,
  impreseIniziali,
  risposteImpreseIniziali,
}: Props) {
  const sezioni = [...template.sezioni].sort((a, b) => a.ordine - b.ordine);
  const chiusa = stato !== "bozza";

  // ── Modalità HACCP (Sprint HACCP 2, C2): rilevata dallo snapshot. Attiva
  // etichette/guida/criterio/obblighi sulle card e il modello di completezza
  // HACCP (PC/NC → osservazione, NV → motivazione). Snapshot sicurezza: tutto false.
  const modelloHaccp = isSnapshotHaccp(template);
  const etichetteHaccp = template.etichette;
  const obblighiHaccp = template.obbligo_osservazione ?? {};
  /** Completezza di una risposta standard secondo il modello attivo. */
  const entryCompleta = (e: Entry | undefined): boolean =>
    modelloHaccp
      ? rispostaCompletaHaccp(
          e?.valore ?? null,
          { osservazioneEvidenza: e?.osservazioneEvidenza, motivazione: e?.osservazioni },
          obblighiHaccp
        )
      : rispostaCompleta(e?.valore ?? null, e?.azione, e?.osservazioni);
  // Sezione formazione per-nominativo (SEZ-03), se presente nello snapshot.
  const sezFormazione = sezioni.find((s) => s.formazione_per_nominativo) ?? null;

  // Stato iniziale con ricalcolo esiti automatici (una sola volta, Sprint 12.4).
  const [statoIniziale] = useState<StatoIniziale>(() =>
    costruisciStatoIniziale(template, risposteIniziali, dataVisita, chiusa, lavoratoriIniziali)
  );

  // Nodo D-03-001 (formazione lavoratori) nello snapshot, se presente (v9+).
  const nodoLavoratori =
    sezioni.flatMap((s) => s.domande).find((d) => d.formazione_lavoratori) ?? null;

  const [risposte, setRisposte] = useState<Record<string, Entry>>(statoIniziale.risposte);

  // Lookup domanda per id (per sapere se ha campo data, gate, ecc.).
  const domandeById = new Map(sezioni.flatMap((s) => s.domande.map((d) => [d.id, d] as const)));

  const [nominativi, setNominativi] =
    useState<NominativiStrutturati>(nominativiIniziali);

  // Elenco lavoratori (SEZ-01, Sprint 14). Fonte della data formazione per il
  // calcolo automatico C/PC/NC per-lavoratore di D-03-001 (SEZ-03).
  const [lavoratori, setLavoratori] = useState<Lavoratore[]>(lavoratoriIniziali);

  // SEZ-03 formazione per-nominativo (Sprint 12): risposte indicizzate per
  // domanda_id composito "<D-03-00x>::<nominativoId>". Esiti automatici già
  // ricalcolati al mount (Sprint 12.4).
  const [risposteFormazione, setRisposteFormazione] = useState<
    Record<string, FormEntry>
  >(statoIniziale.formazione);

  // SEZ-08 multi-impresa (Sprint 9.1): elenco imprese + risposte per impresa.
  const [imprese, setImprese] = useState<ImpresaAppalto[]>(impreseIniziali);
  const [risposteImprese, setRisposteImprese] = useState<
    Record<string, Record<string, ImpEntry>>
  >(() => {
    const map: Record<string, Record<string, ImpEntry>> = {};
    for (const r of risposteImpreseIniziali) {
      (map[r.impresaId] ??= {})[r.domandaId] = {
        esito: r.esito,
        azione: r.azioneCorrettiva ?? "",
        osservazione: r.osservazione ?? "",
      };
    }
    return map;
  });

  const [sezioneCorrente, setSezioneCorrente] = useState(0);
  const [salvataggio, setSalvataggio] = useState<Stato>("idle");
  const [erroreMsg, setErroreMsg] = useState<string | null>(null);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  function pianifica(key: string, fn: () => Promise<void>) {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    setSalvataggio("saving");
    setErroreMsg(null);
    timers.current[key] = setTimeout(() => void fn(), DEBOUNCE_MS);
  }

  async function performSave(domandaId: string, entry: Entry) {
    // Passa la data solo per le domande con campo data (es. D-01-016); per le
    // altre `undefined` lascia campo_extra invariato.
    const haCampoData = domandeById.get(domandaId)?.campo_data === true;
    const res = await salvaRispostaAction({
      visitaId,
      domandaId,
      sezioneId: entry.sezioneId,
      valore: entry.valore,
      azioneCorrettiva: entry.azione.trim() ? entry.azione : null,
      osservazioneEvidenza: entry.osservazioneEvidenza.trim()
        ? entry.osservazioneEvidenza
        : null,
      osservazioni: entry.osservazioni.trim() ? entry.osservazioni : null,
      dataVerifica: haCampoData ? (entry.dataVerifica.trim() ? entry.dataVerifica : null) : undefined,
    });
    setSalvataggio(res.ok ? "saved" : "error");
    if (!res.ok) setErroreMsg(res.error);
  }

  // Persiste al mount i valori ricalcolati (bozza) diversi dal salvato, così il
  // DB — fonte di verità per chiusura/PDF — resta allineato al display corretto.
  // Riusa l'autosave esistente; nessuna scrittura se nulla è cambiato.
  const ricalcoloPersistito = useRef(false);
  useEffect(() => {
    if (chiusa || ricalcoloPersistito.current) return;
    ricalcoloPersistito.current = true;
    const { diffStandard, diffFormazione, diffLavoratori, deleteLavoratori } = statoIniziale;
    if (
      diffStandard.length === 0 &&
      diffFormazione.length === 0 &&
      diffLavoratori.length === 0 &&
      deleteLavoratori.length === 0
    )
      return;
    void (async () => {
      for (const id of diffStandard) {
        await performSave(id, statoIniziale.risposte[id]);
      }
      for (const cid of diffFormazione) {
        const e = statoIniziale.formazione[cid];
        const res = await salvaRispostaFormazioneAction({
          visitaId,
          domandaId: cid,
          valore: e.esito,
          azioneCorrettiva: e.azione.trim() ? e.azione : null,
          osservazioni: e.osservazione.trim() ? e.osservazione : null,
          dataVerifica: e.dataVerifica.trim() ? e.dataVerifica : null,
        });
        setSalvataggio(res.ok ? "saved" : "error");
        if (!res.ok) setErroreMsg(res.error);
      }
      // Lavoratori (Sprint 14): upsert esiti ricalcolati + elimina righe orfane.
      for (const { compositeId, esito } of diffLavoratori) {
        const res = await salvaRispostaFormazioneAction({
          visitaId,
          domandaId: compositeId,
          valore: esito,
          azioneCorrettiva: null,
          osservazioni: null,
          dataVerifica: null,
        });
        setSalvataggio(res.ok ? "saved" : "error");
        if (!res.ok) setErroreMsg(res.error);
      }
      for (const cid of deleteLavoratori) {
        await eliminaRispostaFormazioneAction(visitaId, cid);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function aggiorna(domandaId: string, sezioneId: string, patch: Partial<Entry>) {
    const corrente = risposte[domandaId] ?? {
      valore: null,
      azione: "",
      osservazioneEvidenza: "",
      osservazioni: "",
      dataVerifica: "",
      sezioneId,
    };
    const entry: Entry = { ...corrente, ...patch, sezioneId };
    setRisposte((prev) => ({ ...prev, [domandaId]: entry }));
    pianifica(domandaId, () => performSave(domandaId, entry));
  }

  // ── Calcolo automatico esito da scadenza (Sprint 12.4) ───────────────────
  // Per le domande `calcolo_automatico` rese come DomandaCard diretta (D-03-005
  // DL-SPP non fuso, riunione periodica D-01-008, sopralluogo MC D-01-016): al
  // cambio data l'esito C/PC/NC è ricalcolato dalla DATA DEL SOPRALLUOGO; NA/NV
  // manuali non vengono mai sovrascritti.
  function onDataCalcolo(d: { id: string; periodicita_mesi?: number; soglia_pc_giorni?: number; correzione_default?: string }, sezioneId: string, nuovaData: string) {
    const corrente = risposte[d.id];
    const patch: Partial<Entry> = { dataVerifica: nuovaData };
    const manuale = corrente?.valore === "NA" || corrente?.valore === "NV";
    if (!manuale) {
      const auto = nuovaData
        ? calcolaEsitoAuto(nuovaData, d.periodicita_mesi ?? null, dataVisita, d.soglia_pc_giorni ?? 60)
        : null;
      patch.valore = auto ? auto.esito : null;
      if (
        auto &&
        (auto.esito === "NC" || auto.esito === "PC") &&
        !(corrente?.azione ?? "").trim() &&
        d.correzione_default?.trim()
      ) {
        patch.azione = d.correzione_default;
      }
    }
    aggiorna(d.id, sezioneId, patch);
  }

  /** Deselezione NA/NV su domanda a calcolo: torna all'esito derivato dalla data. */
  function deselezionaCalcolo(d: { id: string; periodicita_mesi?: number; soglia_pc_giorni?: number }, sezioneId: string) {
    const corrente = risposte[d.id];
    const auto = corrente?.dataVerifica
      ? calcolaEsitoAuto(corrente.dataVerifica, d.periodicita_mesi ?? null, dataVisita, d.soglia_pc_giorni ?? 60)
      : null;
    aggiorna(d.id, sezioneId, { valore: auto ? auto.esito : null });
  }

  /** Composite id attivi (istanze formazione) per uno stato nominativi. */
  function compositeAttivi(nom: NominativiStrutturati): string[] {
    return sezFormazione ? istanzeFormazione(sezFormazione, nom).map((i) => i.compositeId) : [];
  }

  /** Etichette delle risposte di formazione che `next` renderebbe orfane. */
  function orfaniFormazione(next: NominativiStrutturati): string[] {
    if (!sezFormazione) return [];
    const labels: string[] = [];
    const dopo = new Set(compositeAttivi(next));
    for (const i of istanzeFormazione(sezFormazione, nominativi)) {
      if (!dopo.has(i.compositeId) && risposteFormazione[i.compositeId]?.esito != null) {
        labels.push(i.testo);
      }
    }
    // D-03-005 diretta (generica) → diventa istanza per-nominativo quando si
    // fondono DL/RSPP: la risposta diretta esistente sarebbe orfana.
    if (
      !dlCoincideRspp(nominativi) &&
      dlCoincideRspp(next) &&
      risposte["D-03-005"]?.valore != null
    ) {
      labels.push("Formazione DL-SPP (risposta generica)");
    }
    return labels;
  }

  function handleNominativi(next: NominativiStrutturati) {
    // Elimina le risposte di formazione non più attive con `next` (la conferma
    // è già avvenuta in NominativiSEZ01). Copre rimozione nominativo e fusione/
    // sfusione DL-RSPP, in modo uniforme via diff delle istanze.
    if (sezFormazione) {
      const dopo = new Set(compositeAttivi(next));
      const orfaneComp = compositeAttivi(nominativi).filter(
        (cid) => !dopo.has(cid) && risposteFormazione[cid]?.esito != null
      );
      if (orfaneComp.length > 0) {
        setRisposteFormazione((prev) => {
          const m = { ...prev };
          for (const cid of orfaneComp) delete m[cid];
          return m;
        });
        void Promise.all(
          orfaneComp.map((cid) => eliminaRispostaFormazioneAction(visitaId, cid))
        );
      }
      // D-03-005 diretta orfana quando si fondono DL/RSPP.
      if (
        !dlCoincideRspp(nominativi) &&
        dlCoincideRspp(next) &&
        risposte["D-03-005"]?.valore != null
      ) {
        setRisposte((prev) => ({
          ...prev,
          "D-03-005": {
            ...prev["D-03-005"],
            valore: null,
            azione: "",
            osservazioni: "",
            osservazioneEvidenza: "",
            dataVerifica: "",
          },
        }));
        void eliminaRispostaFormazioneAction(visitaId, "D-03-005");
      }
    }

    setNominativi(next);
    pianifica(KEY_NOMINATIVI, async () => {
      const res = await salvaNominativiAction(visitaId, next);
      setSalvataggio(res.ok ? "saved" : "error");
      if (!res.ok) setErroreMsg(res.error);
    });
  }

  /** Esito automatico di un lavoratore dalla sua data formazione (o null). */
  function esitoLavoratore(l: Lavoratore): EsitoRisposta | null {
    if (!nodoLavoratori || !l.dataFormazione) return null;
    return (
      calcolaEsitoAuto(
        l.dataFormazione,
        nodoLavoratori.periodicita_mesi ?? null,
        dataVisita,
        nodoLavoratori.soglia_pc_giorni ?? 60
      )?.esito ?? null
    );
  }

  /**
   * Autosave dell'elenco lavoratori (SEZ-01) + riconciliazione delle righe
   * esito composite `D-03-001::<lavId>` (Sprint 14): upsert quando l'esito
   * calcolato cambia (nuovo lavoratore o data modificata), elimina quando il
   * lavoratore è rimosso o resta senza data. Nessun override manuale.
   */
  function handleLavoratori(next: Lavoratore[]) {
    if (nodoLavoratori) {
      const prevById = new Map(lavoratori.map((l) => [l.id, l]));
      const nextIds = new Set(next.map((l) => l.id));
      for (const l of next) {
        const cid = idRispostaFormazione("D-03-001", l.id);
        const nuovo = esitoLavoratore(l);
        const prev = prevById.get(l.id);
        const vecchio = prev ? esitoLavoratore(prev) : undefined;
        if (nuovo && nuovo !== vecchio) {
          void salvaRispostaFormazioneAction({
            visitaId,
            domandaId: cid,
            valore: nuovo,
            azioneCorrettiva: null,
            osservazioni: null,
            dataVerifica: null,
          });
        } else if (!nuovo && vecchio) {
          void eliminaRispostaFormazioneAction(visitaId, cid); // data rimossa
        }
      }
      // Lavoratori rimossi → elimina la riga esito.
      for (const l of lavoratori) {
        if (!nextIds.has(l.id)) {
          void eliminaRispostaFormazioneAction(visitaId, idRispostaFormazione("D-03-001", l.id));
        }
      }
    }

    setLavoratori(next);
    pianifica(KEY_LAVORATORI, async () => {
      const res = await salvaLavoratoriAction(visitaId, next);
      setSalvataggio(res.ok ? "saved" : "error");
      if (!res.ok) setErroreMsg(res.error);
    });
  }

  /** Autosave di una risposta di formazione per-nominativo (SEZ-03). */
  function handleFormazione(compositeId: string, patch: Partial<FormEntry>) {
    const corrente = risposteFormazione[compositeId] ?? FORM_ENTRY_VUOTA;
    const entry: FormEntry = { ...corrente, ...patch };
    setRisposteFormazione((prev) => ({ ...prev, [compositeId]: entry }));
    pianifica(`form:${compositeId}`, async () => {
      const res = await salvaRispostaFormazioneAction({
        visitaId,
        domandaId: compositeId,
        valore: entry.esito,
        azioneCorrettiva: entry.azione.trim() ? entry.azione : null,
        osservazioni: entry.osservazione.trim() ? entry.osservazione : null,
        dataVerifica: entry.dataVerifica.trim() ? entry.dataVerifica : null,
      });
      setSalvataggio(res.ok ? "saved" : "error");
      if (!res.ok) setErroreMsg(res.error);
    });
  }

  // ── SEZ-08 multi-impresa: CRUD imprese + autosave risposte ───────────────
  async function handleAddImpresa(
    ragioneSociale: string,
    tipo: TipoImpresa
  ): Promise<string | null> {
    const res = await creaImpresaAction(visitaId, ragioneSociale, tipo);
    if (!res.ok) {
      setSalvataggio("error");
      setErroreMsg(res.error);
      return null;
    }
    setImprese((prev) => [...prev, res.impresa]);
    return res.impresa.id;
  }

  async function handleRemoveImpresa(impresaId: string): Promise<void> {
    const res = await eliminaImpresaAction(impresaId);
    if (!res.ok) {
      setSalvataggio("error");
      setErroreMsg(res.error);
      return;
    }
    setImprese((prev) => prev.filter((i) => i.id !== impresaId));
    setRisposteImprese((prev) => {
      const next = { ...prev };
      delete next[impresaId];
      return next;
    });
  }

  function handleChangeRispostaImpresa(
    impresaId: string,
    domandaId: string,
    patch: Partial<ImpEntry>
  ) {
    const corrente = risposteImprese[impresaId]?.[domandaId] ?? IMP_ENTRY_VUOTA;
    const entry: ImpEntry = { ...corrente, ...patch };
    setRisposteImprese((prev) => ({
      ...prev,
      [impresaId]: { ...(prev[impresaId] ?? {}), [domandaId]: entry },
    }));
    // Si salva solo quando c'è un esito (colonna NOT NULL lato DB).
    if (!entry.esito) return;
    pianifica(`imp:${impresaId}:${domandaId}`, async () => {
      const res = await salvaRispostaImpresaAction({
        impresaId,
        domandaId,
        esito: entry.esito as EsitoRisposta,
        osservazione: entry.osservazione.trim() ? entry.osservazione : null,
        azioneCorrettiva: entry.azione.trim() ? entry.azione : null,
      });
      setSalvataggio(res.ok ? "saved" : "error");
      if (!res.ok) setErroreMsg(res.error);
    });
  }

  /** Id delle domande ripetute per impresa (tutte tranne la filtro). */
  function domandeImpresa(sez: {
    domanda_filtro?: string;
    domande: { id: string }[];
  }): string[] {
    return sez.domande.map((d) => d.id).filter((id) => id !== sez.domanda_filtro);
  }

  const sezione = sezioni[sezioneCorrente];
  const isUltima = sezioneCorrente === sezioni.length - 1;
  const isSezNominativi = sezione.id === SEZIONE_NOMINATIVI;
  // SEZ-08 multi-impresa: la sezione, se espansa, mostra l'elenco imprese al
  // posto delle domande D-08-002..009 (gestite per impresa).
  const isMultiImpresa = Boolean(sezione.multi_impresa);
  const sezioneEspansaMulti =
    isMultiImpresa && !sezioneCollassata(sezione, valoreFiltro(sezione));
  // SEZ-03 formazione per-nominativo: le domande mappate a una figura sono
  // derivate per nominativo; restano dirette solo le generiche (Lavoratori, DL-SPP).
  const isFormazione = Boolean(sezione.formazione_per_nominativo);
  // Istanze (con fusione DL/RSPP) e domande generiche dirette attive correnti.
  const istanzeCorrente = isFormazione ? istanzeFormazione(sezione, nominativi) : [];
  const genericheIds = new Set(
    isFormazione ? genericheFormazione(sezione, nominativi).map((d) => d.id) : []
  );

  /** Valore corrente della domanda filtro di una sezione (null se nessuna filtro). */
  function valoreFiltro(sez: { domanda_filtro?: string }): EsitoRisposta | null {
    if (!sez.domanda_filtro) return null;
    return risposte[sez.domanda_filtro]?.valore ?? null;
  }

  function progresso(sezioneId: string) {
    const sez = sezioni.find((s) => s.id === sezioneId);
    const domande = sez?.domande ?? [];
    // Sezione condizionale collassata (filtro = NA): conta solo la domanda
    // filtro; le altre non sono richieste.
    if (sez && sezioneCollassata(sez, valoreFiltro(sez))) {
      const f = risposte[sez.domanda_filtro!];
      const data = rispostaCompleta(f?.valore ?? null, f?.azione, f?.osservazioni);
      return { date: data ? 1 : 0, totale: 1, collassata: true, completa: data };
    }
    // SEZ-08 multi-impresa espansa: progresso = filtro + (8 domande × N imprese).
    // Il denominatore usa almeno 1 impresa, così con 0 imprese non risulta mai
    // completa e la pill segnala che manca lavoro.
    if (sez?.multi_impresa) {
      const f = risposte[sez.domanda_filtro!];
      const filtroOk = rispostaCompleta(f?.valore ?? null, f?.azione, f?.osservazioni);
      const dids = domandeImpresa(sez);
      const getR = (impId: string, did: string) => {
        const e = risposteImprese[impId]?.[did];
        return e
          ? { esito: e.esito, azioneCorrettiva: e.azione, osservazione: e.osservazione }
          : null;
      };
      // Una domanda-impresa conta come "data" solo se completa (esito + testo
      // obbligatorio: azione per NC/PC, motivazione per NV/NA).
      let risposteDate = 0;
      for (const imp of imprese)
        for (const did of dids) {
          const r = getR(imp.id, did);
          if (rispostaCompleta(r?.esito ?? null, r?.azioneCorrettiva, r?.osservazione))
            risposteDate += 1;
        }
      const { completa: impreseComplete } = completezzaImpreseSezioneOtto(
        dids,
        imprese.map((i) => i.id),
        getR
      );
      const totale = 1 + dids.length * Math.max(imprese.length, 1);
      const date = (filtroOk ? 1 : 0) + risposteDate;
      return { date, totale, collassata: false, completa: filtroOk && impreseComplete };
    }
    // SEZ-03 formazione per-nominativo: domande generiche + (1 per nominativo
    // per ogni figura mappata). Reattivo allo stato corrente di SEZ-01.
    if (sez?.formazione_per_nominativo) {
      const generiche = genericheFormazione(sez, nominativi);
      const genericheDate = generiche.filter((d) => {
        const e = risposte[d.id];
        return rispostaCompleta(e?.valore ?? null, e?.azione, e?.osservazioni);
      }).length;
      const istanze = istanzeFormazione(sez, nominativi);
      const getR = (cid: string) => {
        const e = risposteFormazione[cid];
        return e
          ? { esito: e.esito, azioneCorrettiva: e.azione, osservazione: e.osservazione }
          : null;
      };
      const formDate = istanze.filter((i) => {
        const r = getR(i.compositeId);
        return rispostaCompleta(r?.esito ?? null, r?.azioneCorrettiva, r?.osservazione);
      }).length;
      const { completa: formCompleta } = completezzaFormazione(
        istanze.map((i) => i.compositeId),
        getR
      );
      return {
        date: genericheDate + formDate,
        totale: generiche.length + istanze.length,
        collassata: false,
        completa: genericheDate === generiche.length && formCompleta,
      };
    }
    // Esclude le sotto-domande gate non attive (es. sorveglianza sanitaria
    // collassata su NA/NV della domanda filtro D-01-012).
    const attive = domande.filter(
      (d) => !d.gated_by || domandaGateAttiva(d, risposte[d.gated_by]?.valore ?? null)
    );
    // Una domanda conta come "data" solo se completa (esito + eventuale
    // campo testo obbligatorio: azione correttiva per NC/PC, motivazione per NV/NA).
    const date = attive.filter((d) => entryCompleta(risposte[d.id])).length;
    return {
      date,
      totale: attive.length,
      collassata: false,
      completa: attive.length > 0 && date === attive.length,
    };
  }

  function vaiASezione(i: number) {
    setSezioneCorrente(i);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col">
      {/* Intestazione persistente */}
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-gray-900 sm:text-lg">
              {clienteNome}
            </h1>
            <p className="truncate text-xs text-gray-600 sm:text-sm">
              {sedeNome}
              {sedeIndirizzo ? ` · ${sedeIndirizzo}` : ""}
              {sedeCitta ? `, ${sedeCitta}` : ""}
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {formatDate(dataVisita)}
              {oraInizio ? ` · ${oraInizio.slice(0, 5)}` : ""}
              {" · "}
              {specialistNome}
              {qualifica ? ` (${qualifica})` : ""}
              {referenteCliente ? ` · Ref. ${referenteCliente}` : ""}
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1">
            <StatoBadge chiusa={chiusa} numero={numeroVerbale} />
            <IndicatoreSalvataggio stato={salvataggio} errore={erroreMsg} chiusa={chiusa} />
          </div>
        </div>

        {/* Navigazione sezioni — scroll orizzontale su mobile */}
        <nav className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {sezioni.map((s, i) => {
            const { date, totale, collassata, completa } = progresso(s.id);
            const attiva = i === sezioneCorrente;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => vaiASezione(i)}
                className={cn(
                  "flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  attiva
                    ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                    : collassata
                      ? "border-gray-300 bg-gray-100 text-gray-500 hover:bg-gray-200"
                      : completa
                        ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                        : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                )}
                // Sezione condizionale saltata correttamente (filtro = NA): non è un errore.
                title={collassata ? "Sezione non applicabile (nessun caso): solo la domanda filtro è richiesta." : undefined}
              >
                {s.id}{" "}
                <span className={cn(attiva ? "text-white/80" : "text-gray-400")}>
                  {collassata ? "N/A" : `${date}/${totale}`}
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Area domande */}
      <div className="flex-1 px-1">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-gray-900">
            {sezione.id} — {sezione.nome}
          </h2>
          {sezione.descrizione && (
            <p className="text-sm text-gray-500">{sezione.descrizione}</p>
          )}
        </div>

        <div className="space-y-4">
          {/* Nominativi figure sicurezza in cima a SEZ-01 */}
          {isSezNominativi && (
            <NominativiSEZ01
              nominativi={nominativi}
              disabled={chiusa}
              onChange={handleNominativi}
              orfani={orfaniFormazione}
            />
          )}

          {/* Elenco lavoratori (SEZ-01, Sprint 14): dopo i nominativi figure
              sicurezza. Solo su snapshot v9+ (D-03-001 per-lavoratore); le visite
              legacy mantengono D-03-001 come domanda generica. */}
          {isSezNominativi && nodoLavoratori && (
            <LavoratoriSection
              lavoratori={lavoratori}
              disabled={chiusa}
              onChange={handleLavoratori}
            />
          )}

          {[...sezione.domande]
            .sort((a, b) => a.ordine - b.ordine)
            // Logica condizionale di sezione: se la sezione è collassata
            // (filtro = NA) mostra solo la domanda filtro. Reattivo lato client.
            .filter((d) => domandaAttiva(sezione, d.id, valoreFiltro(sezione)))
            // Multi-impresa: le domande successive alla filtro sono gestite
            // per impresa nel componente dedicato, non come card di sezione.
            .filter((d) => !isMultiImpresa || d.id === sezione.domanda_filtro)
            // Formazione per-nominativo: restano dirette solo le domande
            // generiche attive (D-03-005 esclusa quando DL/RSPP sono fusi).
            .filter((d) => !isFormazione || genericheIds.has(d.id))
            // Gate condizionale: nasconde le sotto-domande non attive (es.
            // sorveglianza sanitaria se la filtro D-01-012 è NA/NV). Reattivo.
            .filter(
              (d) => !d.gated_by || domandaGateAttiva(d, risposte[d.gated_by]?.valore ?? null)
            )
            .map((d) => {
              const entry = risposte[d.id];
              const isAuto = d.calcolo_automatico === true;
              return (
                <DomandaCard
                  key={d.id}
                  domanda={d}
                  valore={entry?.valore ?? null}
                  azioneCorrettiva={entry?.azione ?? ""}
                  osservazioneEvidenza={entry?.osservazioneEvidenza ?? ""}
                  osservazioni={entry?.osservazioni ?? ""}
                  // HACCP: etichette/guida/criterio/obblighi dallo snapshot (undefined
                  // su sicurezza → comportamento invariato).
                  etichette={modelloHaccp ? etichetteHaccp : undefined}
                  guida={modelloHaccp ? d.guida : undefined}
                  criterioApplicabilita={modelloHaccp ? d.applicabilita : undefined}
                  obblighi={modelloHaccp ? obblighiHaccp : undefined}
                  mostraDataVerifica={d.campo_data === true}
                  dataVerifica={entry?.dataVerifica ?? ""}
                  onDataVerifica={(t) =>
                    isAuto
                      ? onDataCalcolo(d, sezione.id, t)
                      : aggiorna(d.id, sezione.id, { dataVerifica: t })
                  }
                  calcoloAutomatico={isAuto}
                  calcoloEtichetta={
                    isAuto
                      ? etichettaAuto(
                          entry?.valore ?? null,
                          entry?.dataVerifica ?? "",
                          d.periodicita_mesi ?? null,
                          dataVisita,
                          d.soglia_pc_giorni ?? 60
                        )
                      : undefined
                  }
                  onDeselezionaEsito={isAuto ? () => deselezionaCalcolo(d, sezione.id) : undefined}
                  disabled={chiusa}
                  onValore={(v) => {
                    const corrente = risposte[d.id];
                    const patch: Partial<Entry> = { valore: v };
                    // NC/PC: pre-compila l'azione correttiva col default del
                    // template, solo se il campo è ancora vuoto (non sovrascrive
                    // quanto già scritto dal tecnico). Resta editabile e obbligatorio.
                    if (
                      (v === "NC" || v === "PC") &&
                      !(corrente?.azione ?? "").trim() &&
                      d.correzione_default?.trim()
                    ) {
                      patch.azione = d.correzione_default;
                    }
                    aggiorna(d.id, sezione.id, patch);
                  }}
                  onAzione={(t) => aggiorna(d.id, sezione.id, { azione: t })}
                  onOsservazioneEvidenza={(t) =>
                    aggiorna(d.id, sezione.id, { osservazioneEvidenza: t })
                  }
                  onMotivazione={(t) => aggiorna(d.id, sezione.id, { osservazioni: t })}
                />
              );
            })}

          {/* SEZ-08 multi-impresa: elenco imprese + schede risposte per impresa.
              Renderizzato solo a sezione espansa (filtro ≠ NA). */}
          {sezioneEspansaMulti && (
            <SezioneAppaltiImprese
              domande={sezione.domande
                .filter((d) => d.id !== sezione.domanda_filtro)
                // Nel modello multi-impresa l'impresa è già identificata dalla
                // sua anagrafica: il campo_extra "elenco imprese" (legacy D-08-003)
                // non va mostrato come testo libero per ogni impresa.
                .map((d) => ({ ...d, campo_extra: undefined }))}
              imprese={imprese}
              risposte={risposteImprese}
              disabled={chiusa}
              onAdd={handleAddImpresa}
              onRemove={handleRemoveImpresa}
              onChange={handleChangeRispostaImpresa}
            />
          )}

          {/* SEZ-03 formazione per-nominativo: domande derivate dai nominativi
              di SEZ-01, raggruppate per figura. */}
          {isFormazione && (
            <FormazioneNominativi
              istanze={istanzeCorrente}
              risposte={risposteFormazione}
              dataSopralluogo={dataVisita}
              disabled={chiusa}
              onChange={handleFormazione}
            />
          )}

          {/* Formazione lavoratori (Sprint 14): badge read-only C/PC/NC per
              lavoratore di SEZ-01, calcolato dalla data formazione. */}
          {isFormazione && nodoLavoratori && (
            <LavoratoriFormazione
              domanda={nodoLavoratori}
              lavoratori={lavoratori}
              dataSopralluogo={dataVisita}
            />
          )}
        </div>
      </div>

      {/* Footer fisso */}
      <footer className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <button
          type="button"
          onClick={() => vaiASezione(Math.max(0, sezioneCorrente - 1))}
          disabled={sezioneCorrente === 0}
          className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition enabled:hover:bg-gray-50 disabled:opacity-40"
        >
          Indietro
        </button>

        {isUltima ? (
          <Link
            href={`/visite/${visitaId}/riepilogo`}
            className="flex min-h-[44px] items-center rounded-lg bg-[#1e3a5f] px-5 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Vai al riepilogo
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => vaiASezione(sezioneCorrente + 1)}
            className="min-h-[44px] rounded-lg bg-[#1e3a5f] px-5 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Avanti
          </button>
        )}
      </footer>
    </div>
  );
}

function StatoBadge({ chiusa, numero }: { chiusa: boolean; numero: string | null }) {
  if (chiusa) {
    return (
      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-green-700">
        {numero ?? "Chiuso"}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
      Bozza
    </span>
  );
}

function IndicatoreSalvataggio({
  stato,
  errore,
  chiusa,
}: {
  stato: Stato;
  errore: string | null;
  chiusa: boolean;
}) {
  if (chiusa) {
    return <span className="text-xs text-gray-400">Sola lettura</span>;
  }
  if (stato === "saving") return <span className="text-xs text-gray-500">Salvataggio…</span>;
  if (stato === "saved") return <span className="text-xs text-green-600">Salvato</span>;
  if (stato === "error") {
    return (
      <span className="text-xs text-red-600" title={errore ?? undefined}>
        Errore di salvataggio
      </span>
    );
  }
  return <span className="text-xs text-transparent">·</span>;
}
