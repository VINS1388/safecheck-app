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
