/**
 * Modello filtri condiviso (Sprint 16.5). Funzioni PURE (nessun server-only,
 * nessun path alias): usate sia server-side (searchParams → query) sia client
 * (FilterBar → URL). Un solo meccanismo di filtro per dashboard e pagine di
 * sezione: lo stato vive nell'URL, mai duplicato.
 *
 * Dimensioni: cliente, sede (dipende da cliente), tecnico (solo admin/planner —
 * gating fatto dalla UI, non qui), stato (valori specifici per pagina), periodo
 * (preset + personalizzato), tipologia (predisposta, oggi un solo valore),
 * criticita (≥1 risposta NC).
 *
 * Robustezza: valori non riconosciuti vengono IGNORATI, mai errore.
 */

export type PeriodoPreset = "oggi" | "7gg" | "30gg" | "personalizzato" | "sempre";
export const PERIODO_DEFAULT: PeriodoPreset = "30gg";
// "sempre" = nessuna restrizione temporale. Il default di modello resta 30gg
// (dashboard/KPI); le pagine di sezione passano periodoDefault="sempre" perché
// un archivio (o una vista di pianificazione forward-looking) non deve nascondere
// righe per una finestra temporale implicita.
const PERIODI: readonly PeriodoPreset[] = ["oggi", "7gg", "30gg", "personalizzato", "sempre"];

export interface Filtri {
  cliente?: string;
  sede?: string;
  tecnico?: string;
  stato?: string;
  periodo: PeriodoPreset;
  da?: string; // ISO YYYY-MM-DD, valorizzato solo con periodo="personalizzato"
  a?: string;
  tipologia?: string;
  criticita?: true; // solo true|undefined (assente = non filtrato)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isISODate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

type Input = URLSearchParams | Record<string, string | string[] | undefined>;
function reader(input: Input): (k: string) => string | undefined {
  if (input instanceof URLSearchParams) return (k) => input.get(k) ?? undefined;
  return (k) => {
    const v = input[k];
    return Array.isArray(v) ? v[0] : v;
  };
}

/**
 * Legge i filtri da URLSearchParams o dall'oggetto searchParams di Next.
 * `periodoDefault` è il default di CONTESTO usato quando il parametro è assente o
 * non valido (30gg per dashboard/KPI, "sempre" per le pagine di sezione).
 */
export function parseFiltri(input: Input, periodoDefault: PeriodoPreset = PERIODO_DEFAULT): Filtri {
  const get = reader(input);
  const periodoRaw = str(get("periodo"));
  const periodo: PeriodoPreset = (PERIODI as readonly string[]).includes(periodoRaw ?? "")
    ? (periodoRaw as PeriodoPreset)
    : periodoDefault;
  const daRaw = str(get("da"));
  const aRaw = str(get("a"));
  const crit = str(get("criticita"));
  return {
    cliente: str(get("cliente")),
    sede: str(get("sede")),
    tecnico: str(get("tecnico")),
    stato: str(get("stato")),
    periodo,
    da: periodo === "personalizzato" && daRaw && isISODate(daRaw) ? daRaw : undefined,
    a: periodo === "personalizzato" && aRaw && isISODate(aRaw) ? aRaw : undefined,
    tipologia: str(get("tipologia")),
    criticita: crit === "nc" || crit === "1" || crit === "true" ? true : undefined,
  };
}

/** Serializza i filtri in querystring: scrive solo valori diversi dal default. */
export function serializeFiltri(f: Filtri, periodoDefault: PeriodoPreset = PERIODO_DEFAULT): URLSearchParams {
  const p = new URLSearchParams();
  if (f.cliente) p.set("cliente", f.cliente);
  if (f.sede) p.set("sede", f.sede);
  if (f.tecnico) p.set("tecnico", f.tecnico);
  if (f.stato) p.set("stato", f.stato);
  if (f.periodo && f.periodo !== periodoDefault) p.set("periodo", f.periodo);
  if (f.periodo === "personalizzato") {
    if (f.da) p.set("da", f.da);
    if (f.a) p.set("a", f.a);
  }
  if (f.tipologia) p.set("tipologia", f.tipologia);
  if (f.criticita) p.set("criticita", "nc");
  return p;
}

/** Comoda: stringa querystring (con "?") o "" se nessun filtro attivo. */
export function toQueryString(f: Filtri, periodoDefault: PeriodoPreset = PERIODO_DEFAULT): string {
  const qs = serializeFiltri(f, periodoDefault).toString();
  return qs ? `?${qs}` : "";
}

export interface RangeDate {
  da?: string;
  a?: string;
}

function subDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Risolve il periodo in un intervallo concreto [da, a] rispetto a `oggiISO`
 * (MAI la data di sistema: la si passa dall'esterno). "ultimi N giorni" include
 * oggi: 7gg = [oggi-6, oggi], 30gg = [oggi-29, oggi]. Personalizzato usa da/a.
 */
export function rangePeriodo(f: Filtri, oggiISO: string): RangeDate {
  switch (f.periodo) {
    case "oggi":
      return { da: oggiISO, a: oggiISO };
    case "7gg":
      return { da: subDays(oggiISO, 6), a: oggiISO };
    case "30gg":
      return { da: subDays(oggiISO, 29), a: oggiISO };
    case "personalizzato":
      return { da: f.da, a: f.a };
    case "sempre":
      return {}; // nessuna restrizione temporale
  }
}

/**
 * Numero di dimensioni attive (per il badge "Filtri (N)"). Il periodo conta come
 * attivo solo se diverso dal default di CONTESTO (`periodoDefault`).
 */
export function contaFiltriAttivi(f: Filtri, periodoDefault: PeriodoPreset = PERIODO_DEFAULT): number {
  let n = 0;
  if (f.cliente) n++;
  if (f.sede) n++;
  if (f.tecnico) n++;
  if (f.stato) n++;
  if (f.periodo !== periodoDefault) n++;
  if (f.tipologia) n++;
  if (f.criticita) n++;
  return n;
}
