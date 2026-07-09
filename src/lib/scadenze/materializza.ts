// Derivazione delle scadenze materializzabili da una visita chiusa (Sprint 18).
//
// PROIEZIONE, non registro: alla chiusura verbale il writer (materializza_scadenze,
// service role) riscrive lo stato corrente delle scadenze della sede+modulo. Questo
// modulo calcola SOLO l'insieme di righe da materializzare, riusando gli helper del
// motore scadenze (nessuna duplicazione della logica di data/soglia).
//
// PERIMETRO DICHIARATO: un attestato SENZA data (es. NC per assenza) NON è
// materializzato — /scadenze è un registro di DATE; la visibilità delle NC senza
// data è dominio futuro di Criticità 2.0. Non è un bug.

import type { DomandaTemplate, TemplateSnapshot } from "@/types";
import { SEP_FORMAZIONE } from "@/types";
import { calcolaScadenza } from "@/lib/scadenze/calcola";
import { domandaBaseId } from "@/lib/scadenze/ricalcolo";
import { estraiLavoratori, type RispostaSalvata } from "@/lib/db/queries/risposte";

/** Risposta con `id` (risposte.id) — necessaria per `riferimento_id`. */
export type RispostaConId = RispostaSalvata & { id: string };

/** Riga passata alla RPC `materializza_scadenze` (chiavi = colonne jsonb). */
export interface ScadenzaMaterializzabile {
  domanda_id: string;
  riferimento_id: string;
  data_riferimento: string; // ISO yyyy-mm-dd
  periodicita_mesi: number;
  data_scadenza: string; // ISO yyyy-mm-dd
}

function leggiDataVerifica(campoExtra: unknown): string | null {
  if (campoExtra && typeof campoExtra === "object") {
    return (campoExtra as { data_verifica?: string }).data_verifica ?? null;
  }
  return null;
}

/**
 * Deriva le righe scadenza materializzabili dalle risposte di una visita.
 * Materializza SOLO le domande `calcolo_automatico` con esito C/PC/NC e una data
 * di riferimento presente (attestato o data formazione lavoratore). NA/NV mai
 * materializzati. La `data_scadenza` dipende dalla data attestato + periodicità
 * (non dalla data del sopralluogo, che determina invece l'esito, già calcolato
 * a monte dal ricalcolo safety-net).
 */
export function derivaScadenzeMaterializzabili(
  snapshot: TemplateSnapshot,
  risposte: RispostaConId[]
): ScadenzaMaterializzabile[] {
  const idx = new Map<string, DomandaTemplate>();
  for (const s of snapshot.sezioni) for (const d of s.domande) idx.set(d.id, d);

  // Data formazione per lavoratore (SEZ-01): usata per le righe D-03-001::<lavId>.
  const dataFormPerLav = new Map(
    estraiLavoratori(risposte).map((l) => [l.id, l.dataFormazione ?? null])
  );

  const out: ScadenzaMaterializzabile[] = [];
  for (const r of risposte) {
    if (r.valore !== "C" && r.valore !== "PC" && r.valore !== "NC") continue;
    const node = idx.get(domandaBaseId(r.domanda_id));
    if (!node?.calcolo_automatico) continue;

    let dataRif: string | null;
    if (node.formazione_lavoratori) {
      const i = r.domanda_id.indexOf(SEP_FORMAZIONE);
      const lavId = i < 0 ? "" : r.domanda_id.slice(i + SEP_FORMAZIONE.length);
      dataRif = dataFormPerLav.get(lavId) ?? null;
    } else {
      dataRif = leggiDataVerifica(r.campo_extra);
    }
    if (!dataRif) continue; // PERIMETRO: nessuna data → non materializzato

    const periodicita = node.periodicita_mesi ?? null;
    if (periodicita == null) continue;
    const dataScad = calcolaScadenza(dataRif, periodicita);
    if (!dataScad) continue;

    out.push({
      domanda_id: r.domanda_id,
      riferimento_id: r.id,
      data_riferimento: dataRif,
      periodicita_mesi: periodicita,
      data_scadenza: dataScad,
    });
  }
  return out;
}
