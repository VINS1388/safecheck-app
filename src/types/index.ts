// Tipi TypeScript globali per SafeCheck.

/** Esito di una risposta della checklist. */
export type EsitoRisposta = "C" | "PC" | "NC" | "NV" | "NA";

/**
 * Campo extra (nominativi) associato ad alcune domande di SEZ-01.
 * `multiplo` distingue figure singole (DL, RSPP) da quelle multiple.
 */
export interface CampoExtraTemplate {
  tipo: string; // es. "nominativo"
  label: string;
  multiplo: boolean;
}

/** Una domanda all'interno dello snapshot del template. */
export interface DomandaTemplate {
  id: string; // es. "D-01-001"
  testo: string;
  descrizione?: string; // testo esplicativo normativo, VISIBILE in UI sotto la domanda; non stampato nel PDF
  ordine: number;
  obbligatoria: boolean;
  tipo_risposta: string; // "conformita_5" | "qualita_4"
  correzione_default?: string;
  note_tecnico?: string; // guida tecnica interna (legacy/fallback UI); mai stampata nel PDF
  rif_normativo?: string; // riferimento normativo interno; mai stampato nel PDF
  campo_extra?: CampoExtraTemplate;
}

/** Una sezione (SEZ-01..SEZ-07) dello snapshot del template. */
export interface SezioneTemplate {
  id: string; // es. "SEZ-01"
  nome: string;
  descrizione?: string;
  ordine: number;
  domande: DomandaTemplate[];
}

/**
 * Struttura immutabile del template salvata su `visite.template_snapshot`
 * al momento della creazione della visita.
 */
export interface TemplateSnapshot {
  id: string;
  nome: string;
  versione: number;
  origine?: unknown;
  sezioni: SezioneTemplate[];
}

// ── Figure della sicurezza (SEZ-01 — nominativi) ─────────────────────────

export interface FiguraSicurezza {
  key: string;
  label: string;
  multiplo: boolean; // true = più nomi (multi-tag), false = nome singolo
}

/** Le 9 figure della sicurezza nominate in SEZ-01 (ordine gerarchico). */
export const FIGURE_SICUREZZA: FiguraSicurezza[] = [
  { key: "DL", label: "DL — Datore di Lavoro", multiplo: false },
  { key: "RSPP", label: "RSPP — Resp. Servizio Prevenzione e Protezione", multiplo: false },
  { key: "ASPP", label: "ASPP — Addetto al Servizio di Prevenzione e Protezione", multiplo: true },
  { key: "MC", label: "MC — Medico Competente", multiplo: true },
  { key: "RLS", label: "RLS — Rappresentante dei Lavoratori per la Sicurezza", multiplo: true },
  { key: "ANTINCENDIO", label: "Addetti Antincendio", multiplo: true },
  { key: "PRIMO_SOCCORSO", label: "Addetti Primo Soccorso", multiplo: true },
  { key: "PREPOSTI", label: "Preposti", multiplo: true },
  { key: "DIRIGENTI", label: "Dirigenti", multiplo: true },
];

/** Mappa figura → nome (singolo) o lista nomi (multiplo). */
export type Nominativi = Record<string, string | string[]>;

/** Id della "domanda" fittizia che archivia i nominativi di SEZ-01. */
export const DOMANDA_NOMINATIVI = "SEZ-01-NOMINATIVI";

/** Id della sezione organizzazione/figure sicurezza. */
export const SEZIONE_NOMINATIVI = "SEZ-01";
