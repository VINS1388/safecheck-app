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
