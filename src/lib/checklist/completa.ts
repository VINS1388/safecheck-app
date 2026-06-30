import type { EsitoRisposta } from "@/types";

/**
 * Una risposta è "completa" quando, oltre all'esito, contiene anche il campo
 * testo obbligatorio richiesto da quell'esito:
 *  - C            → completa con il solo esito (nessun campo extra)
 *  - PC / NC      → richiede `azione_correttiva` non vuota
 *  - NV / NA      → richiede `motivazione` (osservazioni) non vuota
 *  - nessun esito → incompleta
 *
 * Fonte di verità unica per: progresso checklist, riepilogo, blocco PDF.
 */
export function rispostaCompleta(
  valore: EsitoRisposta | null | undefined,
  azioneCorrettiva: string | null | undefined,
  osservazioni: string | null | undefined
): boolean {
  if (valore == null) return false;
  if (valore === "PC" || valore === "NC") {
    return (azioneCorrettiva ?? "").trim().length > 0;
  }
  if (valore === "NV" || valore === "NA") {
    return (osservazioni ?? "").trim().length > 0;
  }
  return true; // C
}

/** True se l'esito impone un campo testo obbligatorio (azione o motivazione). */
export function richiedeTesto(valore: EsitoRisposta | null | undefined): boolean {
  return valore === "PC" || valore === "NC" || valore === "NV" || valore === "NA";
}

// ── Logica condizionale a livello di SEZIONE (Sprint 9, SEZ-08) ────────────
//
// Alcune sezioni hanno una "domanda filtro" (`domanda_filtro`): se la risposta
// a quella domanda vale NA — convenzione di dominio per "caso non presente /
// nessun appalto" — l'intera sezione è considerata non applicabile e le altre
// domande non sono né mostrate né richieste per la completezza.
//
// La domanda filtro è SEMPRE visibile e sempre obbligatoria. Le sezioni prive
// di `domanda_filtro` (SEZ-01..07) non sono interessate da questa logica.

/** Valore della domanda filtro che fa collassare la sezione (nessun caso applicabile). */
export const VALORE_FILTRO_COLLASSO: EsitoRisposta = "NA";

/** Forma minima di sezione su cui ragiona la logica condizionale. */
export interface SezioneFiltrabile {
  domanda_filtro?: string;
}

/**
 * True se la sezione ha una `domanda_filtro` e la risposta a quella domanda è
 * il valore di collasso (NA): in tal caso solo la domanda filtro è richiesta.
 */
export function sezioneCollassata(
  sezione: SezioneFiltrabile,
  valoreFiltro: EsitoRisposta | null | undefined
): boolean {
  return Boolean(sezione.domanda_filtro) && valoreFiltro === VALORE_FILTRO_COLLASSO;
}

/**
 * True se una domanda è "attiva" (mostrata e richiesta) data la logica di
 * sezione condizionale. Se la sezione è collassata, è attiva solo la filtro.
 */
export function domandaAttiva(
  sezione: SezioneFiltrabile,
  domandaId: string,
  valoreFiltro: EsitoRisposta | null | undefined
): boolean {
  if (!sezioneCollassata(sezione, valoreFiltro)) return true;
  return domandaId === sezione.domanda_filtro;
}

// ── Gate condizionale a livello di DOMANDA (Sprint 12.1) ───────────────────
//
// Una domanda con `gated_by` è una sotto-domanda condizionale: è attiva
// (visibile, richiesta, stampata) solo se la risposta alla domanda gate NON è
// tra i valori in `gate_collassa_su`. Se la gate non è ancora risposta, la
// sotto-domanda resta nascosta (la sotto-sezione "appare" solo quando attivata).
// Le domande senza `gated_by` sono sempre attive. Meccanismo additivo,
// indipendente dal collasso di sezione di SEZ-08.

/** Forma minima di domanda su cui ragiona il gate. */
export interface DomandaGate {
  gated_by?: string;
  gate_collassa_su?: string[];
}

/**
 * True se la domanda è attiva dato il valore corrente della sua domanda gate.
 * @param valoreGate  esito attuale della domanda `gated_by` (null se non risposta)
 */
export function domandaGateAttiva(
  domanda: DomandaGate,
  valoreGate: EsitoRisposta | null | undefined
): boolean {
  if (!domanda.gated_by) return true;
  if (valoreGate == null) return false; // gate non risposta → sotto-domanda nascosta
  const collassa = domanda.gate_collassa_su ?? [VALORE_FILTRO_COLLASSO];
  return !collassa.includes(valoreGate);
}

// ── Completezza modello multi-impresa SEZ-08 (Sprint 9.1) ──────────────────
//
// Quando SEZ-08 è espansa e multi_impresa, le domande successive alla filtro
// (D-08-002..009) sono ripetute per ogni impresa inserita. La sezione è
// completa SSE c'è almeno 1 impresa e, per ogni impresa, ogni domanda è
// completa secondo la STESSA regola delle domande standard (`rispostaCompleta`):
// esito presente + campo testo obbligatorio (azione correttiva per NC/PC,
// motivazione per NV/NA). Una domanda NC/PC senza azione_correttiva conta
// quindi come mancante, esattamente come nella checklist principale.

/** Risposta di una domanda-impresa nella forma minima utile alla completezza. */
export interface RispostaImpresaSlot {
  esito: EsitoRisposta | null | undefined;
  azioneCorrettiva?: string | null;
  osservazione?: string | null;
}

/**
 * @param domandeIds   id delle domande ripetute per impresa (es. D-08-002..009)
 * @param impreseIds   id delle imprese inserite per la visita
 * @param getRisposta  accessor: risposta per (impresa, domanda) — null se assente
 * @returns `mancanti` (> 0 se incompleta) e `completa`.
 */
export function completezzaImpreseSezioneOtto(
  domandeIds: string[],
  impreseIds: string[],
  getRisposta: (
    impresaId: string,
    domandaId: string
  ) => RispostaImpresaSlot | null | undefined
): { mancanti: number; completa: boolean } {
  // Nessuna impresa a sezione espansa: incompleta. Si conta come mancante un
  // intero set di domande, per segnalare "almeno un'impresa da inserire".
  if (impreseIds.length === 0) {
    return { mancanti: domandeIds.length, completa: false };
  }
  let mancanti = 0;
  for (const impId of impreseIds) {
    for (const did of domandeIds) {
      const r = getRisposta(impId, did);
      if (!rispostaCompleta(r?.esito ?? null, r?.azioneCorrettiva, r?.osservazione)) {
        mancanti += 1;
      }
    }
  }
  return { mancanti, completa: mancanti === 0 };
}

// ── Completezza formazione per-nominativo SEZ-03 (Sprint 12) ───────────────
//
// Per ogni domanda di formazione mappata a una figura SEZ-01 e per ogni
// nominativo di quella figura, deve esistere una risposta completa (stessa
// regola standard: esito + azione per NC/PC, motivazione per NV/NA). Una figura
// senza nominativi non genera domande → non contribuisce ai mancanti (nessun
// requisito "almeno uno", a differenza delle imprese di SEZ-08).

export interface DomandaFigura {
  domandaId: string; // es. "D-03-002"
  figura: string; // es. "PREPOSTI"
}

/**
 * @param domandeFigura  domande SEZ-03 mappate a una figura (con figura_nominativo)
 * @param nominativiDi   ids dei nominativi di una figura
 * @param getRisposta    risposta formazione per (domandaFigura, nominativoId)
 */
export function completezzaFormazioneNominativi(
  domandeFigura: DomandaFigura[],
  nominativiDi: (figura: string) => string[],
  getRisposta: (
    domandaId: string,
    nominativoId: string
  ) => RispostaImpresaSlot | null | undefined
): { mancanti: number; completa: boolean } {
  let mancanti = 0;
  for (const df of domandeFigura) {
    for (const nomId of nominativiDi(df.figura)) {
      const r = getRisposta(df.domandaId, nomId);
      if (!rispostaCompleta(r?.esito ?? null, r?.azioneCorrettiva, r?.osservazione)) {
        mancanti += 1;
      }
    }
  }
  return { mancanti, completa: mancanti === 0 };
}

/**
 * Completezza di un insieme di istanze di formazione (Sprint 12.2): valuta ogni
 * composite id con la regola standard (esito + azione NC/PC, motivazione NV/NA).
 * Sostituisce l'iterazione figura×nominativo quando si usa `istanzeFormazione`
 * (che applica anche la fusione DL/RSPP).
 */
export function completezzaFormazione(
  compositeIds: string[],
  getRisposta: (compositeId: string) => RispostaImpresaSlot | null | undefined
): { mancanti: number; completa: boolean } {
  let mancanti = 0;
  for (const cid of compositeIds) {
    const r = getRisposta(cid);
    if (!rispostaCompleta(r?.esito ?? null, r?.azioneCorrettiva, r?.osservazione)) {
      mancanti += 1;
    }
  }
  return { mancanti, completa: mancanti === 0 };
}
