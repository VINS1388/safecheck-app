// Tipi TypeScript globali per SafeCheck.

/** Esito di una risposta della checklist. */
export type EsitoRisposta = "C" | "PC" | "NC" | "NV" | "NA";

/**
 * Campo extra associato ad alcune domande.
 *  - tipo "nominativo": figure di SEZ-01 (`multiplo` distingue singole/multiple);
 *  - tipo "testo_libero": campo testo opzionale multi-riga (es. elenco imprese
 *    appaltatrici di SEZ-08), persistito su `risposte.osservazione_evidenza`.
 */
export interface CampoExtraTemplate {
  tipo: string; // "nominativo" | "testo_libero"
  label: string;
  multiplo: boolean;
}

/** Guida valutativa HACCP a tre livelli (dal template). Solo UI, MAI nel PDF. */
export interface GuidaValutativa {
  conforme?: string;
  migliorabile?: string;
  non_conforme?: string;
}

/** Una domanda all'interno dello snapshot del template. */
export interface DomandaTemplate {
  id: string; // es. "D-01-001"
  testo: string;
  titolo?: string; // titolo breve HACCP (es. "Manuale di autocontrollo"), heading in UI
  descrizione?: string; // testo esplicativo normativo, VISIBILE in UI sotto la domanda; non stampato nel PDF
  // HACCP (Sprint HACCP 2): guida valutativa a 3 livelli (solo UI), criterio di
  // applicabilità (domande con `applicabilita`), categoria della domanda.
  guida?: GuidaValutativa;
  applicabilita?: string | null;
  categoria?: string;
  ordine: number;
  obbligatoria: boolean;
  tipo_risposta: string; // "conformita_5" | "qualita_4"
  correzione_default?: string;
  note_tecnico?: string; // guida tecnica interna (legacy/fallback UI); mai stampata nel PDF
  rif_normativo?: string; // riferimento normativo interno; mai stampato nel PDF
  nota_ui?: string; // breve nota operativa VISIBILE in UI (es. effetto della domanda filtro); non stampata nel PDF
  // Marker SEZ-03 formazione per-nominativo (Sprint 12): se valorizzato, questa
  // domanda di formazione non è unica di sezione ma viene derivata per ciascun
  // nominativo della figura SEZ-01 indicata (es. "PREPOSTI"). Le domande senza
  // figura_nominativo (Lavoratori, DL-SPP) restano singole generiche.
  figura_nominativo?: string;
  // Gate condizionale a livello di domanda (Sprint 12.1): la domanda è visibile/
  // richiesta solo se la risposta alla domanda `gated_by` NON è in
  // `gate_collassa_su`. Usato per la sotto-sezione "Sorveglianza sanitaria" di
  // SEZ-01 (gated_by D-01-012, collassa su NA/NV). Additivo, non tocca il motore
  // di collasso di sezione di SEZ-08.
  gated_by?: string;
  gate_collassa_su?: string[];
  // Marker Sprint 14: D-03-001 derivata per lavoratore dall'elenco lavoratori di
  // SEZ-01 (riga sintetica SEZ-01-LAV). Analogo a `figura_nominativo` ma la fonte
  // è la lista lavoratori (non una figura di FIGURE_SICUREZZA). Esito C/PC/NC
  // sempre calcolato (calcolo_automatico), nessun NA/NV manuale.
  formazione_lavoratori?: boolean;
  // Mostra un campo data strutturato (es. data ultimo sopralluogo MC). Solo
  // dato, persistito su risposte.campo_extra.data_verifica.
  campo_data?: boolean;
  // Calcolo automatico dell'esito da scadenza attestato (Sprint 12.4): se true,
  // l'esito C/PC/NC è derivato dalla data attestato/verifica (campo_extra.data_verifica)
  // confrontata con `periodicita_mesi` e la DATA DEL SOPRALLUOGO. NA/NV restano
  // sempre scelta manuale del tecnico; il calcolo non li sovrascrive mai.
  calcolo_automatico?: boolean;
  periodicita_mesi?: number; // periodicità normativa in mesi (es. Preposti 24, RSPP 60, RLS 12)
  soglia_pc_giorni?: number; // giorni entro la scadenza in cui l'esito è PC (default 60)
  campo_extra?: CampoExtraTemplate;
}

/** Una sezione (SEZ-01..SEZ-08) dello snapshot del template. */
export interface SezioneTemplate {
  id: string; // es. "SEZ-01"
  nome: string;
  descrizione?: string;
  categoria_prevalente?: string; // HACCP: categoria prevalente della sezione
  ordine: number;
  // Id della "domanda filtro" della sezione (logica condizionale a livello di
  // sezione). Se presente e la sua risposta è NA (nessun caso applicabile), le
  // altre domande della sezione sono nascoste e non richieste. Introdotto in
  // SEZ-08 (Appalti/DUVRI, Sprint 9).
  domanda_filtro?: string;
  // Marker modello multi-impresa (Sprint 9.1): se true, quando la sezione è
  // espansa le domande successive alla filtro NON sono uniche di sezione ma
  // vengono ripetute per ogni impresa inserita dal tecnico (tabelle
  // imprese_appalto / risposte_imprese_appalto). Discrimina gli snapshot v1.1
  // (con marker) da quelli legacy v1 (senza marker, comportamento invariato).
  multi_impresa?: boolean;
  // Marker SEZ-03 (Sprint 12): se true, le domande con `figura_nominativo` sono
  // derivate per ogni nominativo della relativa figura di SEZ-01 (vista derivata),
  // non risposte una volta per figura. Discrimina gli snapshot v5 dai legacy v4.
  formazione_per_nominativo?: boolean;
  domande: DomandaTemplate[];
}

// ── Appalti SEZ-08 multi-impresa (Sprint 9.1) ─────────────────────────────

export type TipoImpresa = "appaltatrice" | "subappaltatrice" | "lavoratore_autonomo";

/** Etichette UI per i tipi di impresa. */
export const ETICHETTE_TIPO_IMPRESA: Record<TipoImpresa, string> = {
  appaltatrice: "Appaltatrice",
  subappaltatrice: "Subappaltatrice",
  lavoratore_autonomo: "Lavoratore autonomo",
};

/** Un'impresa coinvolta in un appalto presso la sede della visita. */
export interface ImpresaAppalto {
  id: string;
  visitaId: string;
  ragioneSociale: string;
  tipoImpresa: TipoImpresa;
  ordine: number;
}

/** Risposta di una singola impresa a una delle domande D-08-002..009. */
export interface RispostaImpresaAppalto {
  id: string;
  impresaId: string;
  domandaId: string;
  esito: EsitoRisposta;
  osservazione?: string;
  azioneCorrettiva?: string;
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
  // HACCP (Sprint HACCP 2): marker e configurazione trasportati dal template
  // canonico nella forma applicativa. Assenti sugli snapshot sicurezza.
  modulo?: string; // es. "haccp_generico"
  tipo_scoring?: string; // es. "haccp_media_sezione" → attiva il flusso HACCP in UI
  etichette?: Partial<Record<EsitoRisposta, string>>; // es. PC = "Migliorabile"
  obbligo_osservazione?: Partial<
    Record<EsitoRisposta, "facoltativa" | "obbligatoria" | "motivazione_obbligatoria">
  >;
  intestazione_extra?: string[]; // campi extra dell'intestazione visita HACCP
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

/**
 * Formato STORAGE legacy (pre-Sprint 12) dei nominativi: stringhe nude per
 * figura (singolo o lista). Mantenuto solo per retrocompatibilità in lettura.
 */
export type Nominativi = Record<string, string | string[]>;

/**
 * Un nominativo con id stabile (Sprint 12). L'id sopravvive alle correzioni del
 * nome e collega in modo univoco le risposte di formazione di SEZ-03.
 */
export interface Nominativo {
  id: string;
  nome: string;
}

/**
 * Forma canonica normalizzata dei nominativi usata dall'app: per ogni figura,
 * sempre una lista di {id,nome} (le figure singole hanno 0 o 1 elemento).
 * Il normalizzatore (`normalizzaNominativi`) accetta sia il formato legacy
 * (stringhe) sia quello nuovo ({id,nome}).
 */
export type NominativiStrutturati = Record<string, Nominativo[]>;

/** Id della "domanda" fittizia che archivia i nominativi di SEZ-01. */
export const DOMANDA_NOMINATIVI = "SEZ-01-NOMINATIVI";

// ── Lavoratori (SEZ-01 — elenco per formazione D-03-001, Sprint 14) ────────

/** Livello di rischio del lavoratore (determina le ore di formazione, non il calcolo scadenza). */
export type LivelloRischio = "basso" | "medio" | "alto";

/** Un lavoratore dell'azienda, con la sua formazione. Id stabile (come i nominativi). */
export interface Lavoratore {
  id: string;
  nome: string; // nome e cognome
  mansione: string;
  livelloRischio: LivelloRischio;
  dataFormazione: string; // ISO yyyy-mm-dd (fonte del calcolo automatico C/PC/NC)
}

/** Id della "domanda" fittizia che archivia l'elenco lavoratori di SEZ-01. */
export const DOMANDA_LAVORATORI = "SEZ-01-LAV";

// ── Pianificazione visite (Sprint 15) ──────────────────────────────────────

/** Stato di uno slot pianificato. */
export type StatoSlot = "da_pianificare" | "pianificata" | "eseguita";

export const ETICHETTE_STATO_SLOT: Record<StatoSlot, string> = {
  da_pianificare: "Da pianificare",
  pianificata: "Pianificata",
  eseguita: "Eseguita",
};

/** Piano contrattuale di una sede (N visite/anno da una data di inizio ciclo). */
export interface PianoVisite {
  id: string;
  sedeId: string;
  dataInizioCiclo: string; // ISO yyyy-mm-dd
  visiteAnno: number;
  tecnicoAssegnatoId: string | null;
  cicloCorrente: number;
}

/** Uno slot pianificato (visita prevista dal contratto). */
export interface VisitaPianificata {
  id: string;
  pianoId: string;
  sedeId: string;
  numeroVisita: number;
  cicloNumero: number;
  dataSuggerita: string; // ISO yyyy-mm-dd
  dataPianificata: string | null;
  stato: StatoSlot;
  visitaId: string | null;
}

/** Tecnico assegnabile (utente attivo). */
export interface TecnicoOption {
  id: string;
  nomeCompleto: string;
  ruolo: string;
}

/** Separatore per il domanda_id composito delle risposte formazione per-nominativo. */
export const SEP_FORMAZIONE = "::";

/** Costruisce il domanda_id composito di una risposta formazione per-nominativo. */
export function idRispostaFormazione(domandaFigura: string, nominativoId: string): string {
  return `${domandaFigura}${SEP_FORMAZIONE}${nominativoId}`;
}

/** Id della sezione organizzazione/figure sicurezza. */
export const SEZIONE_NOMINATIVI = "SEZ-01";
