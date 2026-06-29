export type EsitoRisposta = "C" | "PC" | "NC" | "NV" | "NA";

export interface RispostaPDF {
  domanda_id: string;
  testo_domanda: string;
  esito: EsitoRisposta | null;
  osservazioni: string;
  azione_correttiva: string;
  nominativi: string; // stringa già formattata "Mario Rossi, Luigi Bianchi"
}

export interface SezionePDF {
  id: string;
  nome: string;
  risposte: RispostaPDF[];
  conteggi: {
    C: number;
    PC: number;
    NC: number;
    NV: number;
    NA: number;
  };
}

export interface DatiVerbale {
  numero_verbale: string;
  data_visita: string; // formato "29 giugno 2026"
  data_generazione: string; // formato "29/06/2026"
  cliente: string;
  sede: string;
  indirizzo: string;
  referente_cliente: string;
  tecnico: string;
  qualifica: string;
  ora_inizio: string;
  note_conclusive: string;
  sezioni: SezionePDF[];
  totali: {
    C: number;
    PC: number;
    NC: number;
    NV: number;
    NA: number;
    verificati: number;
  };
}
