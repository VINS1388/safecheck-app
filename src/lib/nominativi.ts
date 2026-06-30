import { FIGURE_SICUREZZA } from "@/types";
import type { Nominativo, NominativiStrutturati } from "@/types";

function isNominativoObj(x: unknown): x is { id?: unknown; nome?: unknown } {
  return typeof x === "object" && x !== null && "nome" in x;
}

/**
 * Normalizza il `campo_extra` della riga nominativi (SEZ-01) in forma canonica
 * `NominativiStrutturati`: per ogni figura, una lista di {id,nome} con nome non
 * vuoto. Accetta entrambi i formati:
 *  - legacy (pre-Sprint 12): stringa o array di stringhe → id sintetico stabile
 *    `legacy:<FIGURA>:<indice>` (i verbali legacy usano comunque SEZ-03 vecchio
 *    modello, dove l'id non serve);
 *  - nuovo (Sprint 12): {id,nome} o array di {id,nome} → id reale preservato.
 */
export function normalizzaNominativi(raw: unknown): NominativiStrutturati {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: NominativiStrutturati = {};

  for (const f of FIGURE_SICUREZZA) {
    const v = obj[f.key];
    const arr = Array.isArray(v) ? v : v == null ? [] : [v];
    const list: Nominativo[] = [];
    arr.forEach((item, i) => {
      if (typeof item === "string") {
        const nome = item.trim();
        if (nome) list.push({ id: `legacy:${f.key}:${i}`, nome });
      } else if (isNominativoObj(item)) {
        const nome = String(item.nome ?? "").trim();
        const id = String(item.id ?? "").trim() || `legacy:${f.key}:${i}`;
        if (nome) list.push({ id, nome });
      }
    });
    out[f.key] = list;
  }
  return out;
}

/** Tutti i nominativi (di tutte le figure) in un'unica lista piatta. */
export function tuttiNominativi(n: NominativiStrutturati): Nominativo[] {
  return FIGURE_SICUREZZA.flatMap((f) => n[f.key] ?? []);
}
