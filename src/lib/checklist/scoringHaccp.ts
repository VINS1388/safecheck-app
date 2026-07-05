import type { EsitoRisposta } from "@/types";

/**
 * Motore di scoring HACCP `haccp_media_sezione` (Sprint HACCP 2, C3).
 *
 * Regole (dal template canonico `scoring`):
 *  - Punti: C=1, PC=0.5, NC=0.
 *  - NA e NV sono ESCLUSI dal denominatore (non "valutati", non pesano).
 *  - Punteggio sezione = media dei punti delle risposte valutabili × 100.
 *    Una sezione senza risposte valutabili (tutte NA/NV o non risposte) NON ha
 *    punteggio (null) ed è ESCLUSA dal livello complessivo.
 *  - Livello complessivo = media dei punteggi delle sezioni valutate.
 *
 * Deterministico e puro: usato server-side alla chiusura e come ricalcolo client
 * coerente (safety net, come il motore scadenze dello Sprint 12.4).
 */

/** Punti per esito valutabile. NA/NV assenti = esclusi dal denominatore. */
const PUNTI: Partial<Record<EsitoRisposta, number>> = { C: 1, PC: 0.5, NC: 0 };

export function esitoValutabile(v: EsitoRisposta | null | undefined): v is "C" | "PC" | "NC" {
  return v === "C" || v === "PC" || v === "NC";
}

/** Una risposta come vista dal motore di scoring/riepilogo. */
export interface VoceRisposta {
  sezioneId: string;
  domandaId: string;
  titolo?: string;
  testo?: string;
  valore: EsitoRisposta | null | undefined;
  osservazione?: string | null;
  motivazione?: string | null;
}

export interface PunteggioSezione {
  sezioneId: string;
  valutate: number; // n. risposte C/PC/NC (denominatore)
  punteggio: number | null; // media × 100 arrotondata (null se nessuna valutabile)
}

const arrotonda = (n: number) => Math.round(n * 10) / 10;

/**
 * Punteggi per sezione + livello complessivo, secondo `haccp_media_sezione`.
 * @param sezioniOrdine  id sezioni nell'ordine del template (per output stabile)
 */
export function calcolaPunteggiHaccp(
  voci: VoceRisposta[],
  sezioniOrdine: string[]
): { sezioni: PunteggioSezione[]; livelloComplessivo: number | null } {
  const perSezione = new Map<string, { somma: number; n: number }>();
  for (const v of voci) {
    if (!esitoValutabile(v.valore)) continue;
    const acc = perSezione.get(v.sezioneId) ?? { somma: 0, n: 0 };
    acc.somma += PUNTI[v.valore]!;
    acc.n += 1;
    perSezione.set(v.sezioneId, acc);
  }

  const sezioni: PunteggioSezione[] = sezioniOrdine.map((sid) => {
    const acc = perSezione.get(sid);
    return {
      sezioneId: sid,
      valutate: acc?.n ?? 0,
      punteggio: acc && acc.n > 0 ? arrotonda((acc.somma / acc.n) * 100) : null,
    };
  });

  const valutate = sezioni.filter((s) => s.punteggio !== null);
  const livelloComplessivo =
    valutate.length > 0
      ? arrotonda(valutate.reduce((t, s) => t + (s.punteggio as number), 0) / valutate.length)
      : null;

  return { sezioni, livelloComplessivo };
}

/** Conteggi per esito su tutte le risposte fornite. */
export function conteggiHaccp(voci: VoceRisposta[]): Record<EsitoRisposta, number> {
  const c: Record<EsitoRisposta, number> = { C: 0, PC: 0, NC: 0, NV: 0, NA: 0 };
  for (const v of voci) if (v.valore) c[v.valore] += 1;
  return c;
}

export interface Rilievo {
  sezioneId: string;
  domandaId: string;
  titolo?: string;
  testo?: string;
  esito: "NC" | "PC";
  osservazione?: string | null;
}

export interface NotaNv {
  sezioneId: string;
  domandaId: string;
  titolo?: string;
  motivazione?: string | null;
}

/**
 * Riepilogo narrativo: sezioni con ≥1 NC, rilievi principali (NC prima, poi PC/
 * Migliorabili, nell'ordine delle voci), e le NV con le loro motivazioni. La
 * soglia di "verifica parziale" scatta quando esiste almeno una NV.
 */
export function riepilogoHaccp(voci: VoceRisposta[]): {
  sezioniConNC: string[];
  rilievi: Rilievo[];
  noteNv: NotaNv[];
  nvRilevanti: boolean;
} {
  const sezioniConNC = Array.from(
    new Set(voci.filter((v) => v.valore === "NC").map((v) => v.sezioneId))
  );
  const nc = voci.filter((v) => v.valore === "NC");
  const pc = voci.filter((v) => v.valore === "PC");
  const rilievi: Rilievo[] = [...nc, ...pc].map((v) => ({
    sezioneId: v.sezioneId,
    domandaId: v.domandaId,
    titolo: v.titolo,
    testo: v.testo,
    esito: v.valore as "NC" | "PC",
    osservazione: v.osservazione ?? null,
  }));
  const noteNv: NotaNv[] = voci
    .filter((v) => v.valore === "NV")
    .map((v) => ({
      sezioneId: v.sezioneId,
      domandaId: v.domandaId,
      titolo: v.titolo,
      motivazione: v.motivazione ?? null,
    }));
  return { sezioniConNC, rilievi, noteNv, nvRilevanti: noteNv.length > 0 };
}

/** Analisi completa (numeri + narrativa) in un colpo solo. */
export function analizzaHaccp(voci: VoceRisposta[], sezioniOrdine: string[]) {
  return {
    ...calcolaPunteggiHaccp(voci, sezioniOrdine),
    conteggi: conteggiHaccp(voci),
    ...riepilogoHaccp(voci),
  };
}
