// Tipi TypeScript globali per SafeCheck.

import type { EsitoRisposta } from "./verbale";

export type { EsitoRisposta };

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
  ordine: number;
  obbligatoria: boolean;
  tipo_risposta: string; // "conformita_5" | "qualita_4"
  correzione_default?: string;
  note_tecnico?: string;
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
