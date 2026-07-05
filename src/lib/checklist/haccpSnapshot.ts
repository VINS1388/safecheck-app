import type {
  DomandaTemplate,
  SezioneTemplate,
  TemplateSnapshot,
} from "@/types";

/**
 * Trasformazione canonico → applicativo del template HACCP (Sprint HACCP 2, C2).
 *
 * Il template HACCP vive in `template_master.struttura_json` nella sua forma
 * CANONICA byte-fedele (sezioni con `titolo`, domande con `titolo`/`testo`/`guida`/
 * `applicabilita`, senza `ordine`/`obbligatoria`/`tipo_risposta`). La checklist,
 * lo scoring e il PDF consumano invece la forma applicativa `TemplateSnapshot`.
 *
 * Questa funzione mappa l'una nell'altra SENZA riscrivere testi, accorpare/dividere
 * domande o cambiare ID: aggiunge solo i campi strutturali derivabili (ordine da
 * posizione, obbligatoria=true, tipo_risposta) e trasporta i campi HACCP (guida,
 * applicabilità, etichette, obblighi, tipo_scoring, intestazione_extra). È il
 * seme che rende lo snapshot HACCP immutabile alla creazione della visita.
 *
 * `note_template` è metadato interno di authoring: NON viene trasportato nello
 * snapshot (non serve a compilazione/scoring/PDF), coerente con la regola che i
 * campi interni non finiscono in UI/PDF.
 */

/** Forma minima riconosciuta come template HACCP canonico. */
export function isHaccpCanon(struttura: unknown): boolean {
  return (
    typeof struttura === "object" &&
    struttura !== null &&
    (struttura as { tipo_scoring?: unknown }).tipo_scoring === "haccp_media_sezione"
  );
}

interface DomandaCanon {
  id: string;
  titolo?: string;
  testo: string;
  categoria?: string;
  applicabilita?: string | null;
  guida?: { conforme?: string; migliorabile?: string; non_conforme?: string };
}
interface SezioneCanon {
  id: string;
  titolo: string;
  categoria_prevalente?: string;
  domande: DomandaCanon[];
}
interface TemplateCanon {
  modulo?: string;
  template?: string;
  versione_contenuto?: string;
  tipo_scoring?: string;
  etichette?: TemplateSnapshot["etichette"];
  obbligo_osservazione?: TemplateSnapshot["obbligo_osservazione"];
  intestazione_extra?: string[];
  sezioni: SezioneCanon[];
}

/** Costruisce lo snapshot applicativo immutabile da un template HACCP canonico. */
export function costruisciSnapshotHaccp(strutturaCanonica: unknown): TemplateSnapshot {
  const canon = strutturaCanonica as TemplateCanon;

  const sezioni: SezioneTemplate[] = (canon.sezioni ?? []).map((s, si) => ({
    id: s.id,
    nome: s.titolo,
    categoria_prevalente: s.categoria_prevalente,
    ordine: si + 1,
    domande: (s.domande ?? []).map(
      (d, di): DomandaTemplate => ({
        id: d.id,
        testo: d.testo,
        titolo: d.titolo,
        categoria: d.categoria,
        applicabilita: d.applicabilita ?? null,
        guida: d.guida,
        ordine: di + 1,
        obbligatoria: true,
        tipo_risposta: "conformita_5",
      })
    ),
  }));

  return {
    id: `haccp-generico-v${canon.versione_contenuto ?? "1.0"}`,
    nome: canon.template ?? "Template HACCP generico",
    versione: 1,
    modulo: canon.modulo,
    tipo_scoring: canon.tipo_scoring,
    etichette: canon.etichette,
    obbligo_osservazione: canon.obbligo_osservazione,
    intestazione_extra: canon.intestazione_extra,
    sezioni,
  };
}

/**
 * Restituisce la forma applicativa dello snapshot a partire dalla struttura del
 * template master: trasforma se è HACCP canonico, altrimenti la lascia invariata
 * (sicurezza già in forma applicativa). Punto unico usato da `creaVisita`.
 */
export function snapshotDaStrutturaMaster(struttura: unknown): TemplateSnapshot {
  return isHaccpCanon(struttura)
    ? costruisciSnapshotHaccp(struttura)
    : (struttura as TemplateSnapshot);
}

/** True se lo snapshot (già applicativo) è un verbale HACCP. */
export function isSnapshotHaccp(snapshot: Pick<TemplateSnapshot, "tipo_scoring">): boolean {
  return snapshot.tipo_scoring === "haccp_media_sezione";
}
