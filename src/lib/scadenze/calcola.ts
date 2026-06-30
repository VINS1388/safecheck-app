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
