import type { Lavoratore, LivelloRischio } from "@/types";

// Normalizzazione dell'elenco lavoratori (SEZ-01, Sprint 14). Fonte: campo_extra
// della riga sintetica `SEZ-01-LAV` in `risposte`, forma `{ lavoratori: [...] }`.
// Analogo a `normalizzaNominativi`: difensivo su forma/tipi, id stabile.

const LIVELLI: LivelloRischio[] = ["basso", "medio", "alto"];

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/**
 * Normalizza il `campo_extra` della riga lavoratori in `Lavoratore[]`. Accetta
 * sia `{ lavoratori: [...] }` sia direttamente un array. Scarta le voci senza
 * nome; livello di rischio non valido → "basso" (default difensivo).
 */
export function normalizzaLavoratori(raw: unknown): Lavoratore[] {
  const arr: unknown[] = isObj(raw) && Array.isArray(raw.lavoratori)
    ? raw.lavoratori
    : Array.isArray(raw)
      ? raw
      : [];
  const out: Lavoratore[] = [];
  arr.forEach((item, i) => {
    if (!isObj(item)) return;
    const nome = String(item.nome ?? "").trim();
    if (!nome) return;
    const liv = item.livelloRischio as LivelloRischio;
    out.push({
      id: String(item.id ?? "").trim() || `lav-${i}`,
      nome,
      mansione: String(item.mansione ?? "").trim(),
      livelloRischio: LIVELLI.includes(liv) ? liv : "basso",
      dataFormazione: String(item.dataFormazione ?? "").trim(),
    });
  });
  return out;
}
