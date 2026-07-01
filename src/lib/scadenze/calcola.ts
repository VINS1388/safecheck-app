// Motore Scadenze (Sprint 12.3) — helper puri, lato applicativo.
//
// Specchio TS della funzione SQL `calcola_scadenza(data, mesi)` (migration 018):
// somma di mesi a una data con clamp di fine mese identico a Postgres
// (es. 2025-01-31 + 1 mese = 2025-02-28). Tutto string-based su ISO yyyy-mm-dd
// per evitare gli scostamenti di fuso orario di `Date`.

export type StatoScadenza = "attiva" | "risolta" | "scaduta" | "annullata";

export type TipoScadenza =
  | "formazione"
  | "certificazione"
  | "azione_correttiva"
  | "visita_pianificata"
  | "altro";

export interface Scadenza {
  id: string;
  tipo: TipoScadenza;
  clienteId: string | null;
  sedeId: string | null;
  riferimentoTipo: string;
  riferimentoId: string;
  dataRiferimento: string | null; // ISO yyyy-mm-dd
  periodicitaMesi: number | null; // null = scadenza manuale (non calcolata)
  dataScadenza: string; // ISO yyyy-mm-dd
  stato: StatoScadenza;
  note: string | null;
}

const GIORNI_MESE = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function bisestile(anno: number): boolean {
  return (anno % 4 === 0 && anno % 100 !== 0) || anno % 400 === 0;
}

function giorniNelMese(anno: number, mese1: number): number {
  if (mese1 === 2 && bisestile(anno)) return 29;
  return GIORNI_MESE[mese1 - 1];
}

/**
 * data_riferimento + periodicita_mesi mesi → ISO yyyy-mm-dd. Clamp di fine mese
 * come Postgres. Ritorna null se manca uno dei due input (scadenza manuale:
 * data_scadenza impostata a mano, non calcolata).
 */
export function calcolaScadenza(
  dataRiferimento: string | null | undefined,
  periodicitaMesi: number | null | undefined
): string | null {
  if (!dataRiferimento || periodicitaMesi == null) return null;
  const [y, m, d] = dataRiferimento.split("-").map(Number);
  if (!y || !m || !d) return null;
  const totMesi = m - 1 + periodicitaMesi; // m è 1-based → 0-based per l'aritmetica
  const anno = y + Math.floor(totMesi / 12);
  const mese1 = ((totMesi % 12) + 12) % 12 + 1; // 1-based, gestisce anche valori negativi
  const giorno = Math.min(d, giorniNelMese(anno, mese1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${anno}-${pad(mese1)}-${pad(giorno)}`;
}

/** True se la scadenza è già passata rispetto a `oggi` (ISO yyyy-mm-dd). */
export function isScaduta(dataScadenza: string, oggi: string): boolean {
  return dataScadenza < oggi; // confronto lessicografico valido su ISO yyyy-mm-dd
}

// ── Valutazione conformità da scadenza (Sprint 12.4) ───────────────────────
//
// Collega il campo data attestato/verifica (SEZ-03 per-nominativo, D-03-005,
// riunione periodica D-01-008, sopralluogo MC D-01-016) al motore scadenze:
// da (data attestato, periodicità normativa) si ricava la scadenza, poi il
// confronto con la DATA DEL SOPRALLUOGO — mai la data di sistema — determina
// l'esito. NA/NV NON sono mai calcolati: restano scelta manuale del tecnico.

/** Esito derivabile da una scadenza (mai NA/NV, che restano manuali). */
export type EsitoConformita = "C" | "PC" | "NC";

/**
 * Giorni interi tra due date ISO yyyy-mm-dd (`dataA - dataB`). Calcolo in UTC
 * per evitare gli scostamenti di fuso di `Date` locale (coerente con il resto
 * del modulo, string-based).
 */
export function differenzaGiorni(dataA: string, dataB: string): number {
  const [ya, ma, da] = dataA.split("-").map(Number);
  const [yb, mb, db] = dataB.split("-").map(Number);
  return Math.round((Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db)) / 86_400_000);
}

/**
 * Valuta la conformità C/PC/NC di un attestato rispetto alla data del
 * sopralluogo, data la periodicità normativa (mesi):
 *   - scaduto (giorni alla scadenza < 0)         → NC
 *   - in scadenza (0 .. sogliaPcGiorni giorni)   → PC
 *   - valido oltre la soglia                     → C
 * Riusa `calcolaScadenza` (nessuna duplicazione della logica data); solo la
 * valutazione di soglia è nuova. Ritorna null se manca la data attestato o la
 * periodicità (niente da calcolare → l'esito resta a scelta del tecnico).
 */
export function valutaConformitaDaScadenza(
  dataAttestato: string | null | undefined,
  periodicitaMesi: number | null | undefined,
  dataSopralluogo: string,
  sogliaPcGiorni = 60
): EsitoConformita | null {
  const scadenza = calcolaScadenza(dataAttestato, periodicitaMesi);
  if (!scadenza) return null;
  const giorniAllaScadenza = differenzaGiorni(scadenza, dataSopralluogo);
  if (giorniAllaScadenza < 0) return "NC";
  if (giorniAllaScadenza <= sogliaPcGiorni) return "PC";
  return "C";
}

export interface FiltroScadenze {
  stato?: StatoScadenza;
  clienteId?: string;
  sedeId?: string;
}

/** Filtro in-memory per stato/cliente/sede (campi assenti = nessun vincolo). */
export function filtraScadenze<T extends Scadenza>(
  scadenze: T[],
  filtro: FiltroScadenze = {}
): T[] {
  return scadenze.filter(
    (s) =>
      (filtro.stato == null || s.stato === filtro.stato) &&
      (filtro.clienteId == null || s.clienteId === filtro.clienteId) &&
      (filtro.sedeId == null || s.sedeId === filtro.sedeId)
  );
}

/** Ordina per data_scadenza crescente (le più imminenti prima). Non muta l'input. */
export function ordinaPerScadenza<T extends Scadenza>(scadenze: T[]): T[] {
  return [...scadenze].sort((a, b) => a.dataScadenza.localeCompare(b.dataScadenza));
}
