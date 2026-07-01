// Ricalcolo batch degli esiti a calcolo automatico (Sprint 12.4).
// Fonte di verità unica del ricalcolo, riusata da:
//   - client, al mount della checklist in bozza (allinea display + persiste diff);
//   - server, nella chiusura verbale (genera-pdf), come safety net obbligatorio
//     per i percorsi che chiudono senza montare la checklist.
// Legge periodicità/soglia dallo SNAPSHOT del template (immutabile per visita),
// mai dal template_master live. NA/NV sono manuali e non vengono mai toccati.

import type { DomandaTemplate, Lavoratore, TemplateSnapshot } from "@/types";
import { SEP_FORMAZIONE, idRispostaFormazione } from "@/types";
import { valutaConformitaDaScadenza } from "@/lib/scadenze/calcola";

export interface RispostaCalcolo {
  domandaId: string; // può essere composito "<base>::<nominativoId>" (formazione)
  valore: string | null;
  dataVerifica: string | null; // da campo_extra.data_verifica
}

export interface RicalcoloDiff {
  domandaId: string;
  base: DomandaTemplate; // domanda base del template (con periodicita/correzione_default)
  vecchioValore: string | null;
  nuovoValore: "C" | "PC" | "NC" | null;
}

/** Indice base domanda_id → nodo domanda dello snapshot (con i flag calcolo). */
function indiceDomande(snapshot: TemplateSnapshot): Map<string, DomandaTemplate> {
  const m = new Map<string, DomandaTemplate>();
  for (const s of snapshot.sezioni) for (const d of s.domande) m.set(d.id, d);
  return m;
}

/** Id base di una risposta (rimuove il suffisso composito della formazione). */
export function domandaBaseId(domandaId: string): string {
  const i = domandaId.indexOf(SEP_FORMAZIONE);
  return i < 0 ? domandaId : domandaId.slice(0, i);
}

/** Nodo domanda con marker `formazione_lavoratori` (Sprint 14), se presente. */
function nodoLavoratori(snapshot: TemplateSnapshot): DomandaTemplate | null {
  for (const s of snapshot.sezioni)
    for (const d of s.domande) if (d.formazione_lavoratori) return d;
  return null;
}

/**
 * Ricalcola l'esito delle risposte a domande `calcolo_automatico` contro
 * `dataVisita` (data sopralluogo). Ritorna SOLO le risposte da aggiornare
 * (nuovoValore ≠ vecchioValore). Esclude NA/NV (manuali). Riusa
 * `valutaConformitaDaScadenza` — nessuna duplicazione della logica di soglia.
 *
 * Sprint 14: per la formazione lavoratori (D-03-001) la data NON è in
 * `campo_extra` ma nell'anagrafica del lavoratore in SEZ-01 (`lavoratori`). Le
 * righe composite `D-03-001::<lavId>` sono quindi ricalcolate leggendo
 * `dataFormazione` dal lavoratore corrispondente (non da `r.dataVerifica`).
 */
export function ricalcolaEsitiAutomatici(
  snapshot: TemplateSnapshot,
  risposte: RispostaCalcolo[],
  dataVisita: string,
  lavoratori: Lavoratore[] = []
): RicalcoloDiff[] {
  const idx = indiceDomande(snapshot);
  const out: RicalcoloDiff[] = [];
  for (const r of risposte) {
    if (r.valore === "NA" || r.valore === "NV") continue; // scelta manuale
    const base = idx.get(domandaBaseId(r.domandaId));
    if (!base?.calcolo_automatico) continue;
    // I lavoratori (formazione_lavoratori) sono gestiti sotto, dai loro dati
    // anagrafici in SEZ-01: qui salterei con dataVerifica assente (falso negativo).
    if (base.formazione_lavoratori) continue;
    const nuovo = r.dataVerifica
      ? valutaConformitaDaScadenza(
          r.dataVerifica,
          base.periodicita_mesi ?? null,
          dataVisita,
          base.soglia_pc_giorni ?? 60
        )
      : null;
    if (nuovo !== r.valore) {
      out.push({ domandaId: r.domandaId, base, vecchioValore: r.valore, nuovoValore: nuovo });
    }
  }

  // Formazione lavoratori (Sprint 14): confronta l'esito calcolato dalla data
  // formazione del lavoratore con il valore salvato nella riga composita.
  const nodo = nodoLavoratori(snapshot);
  if (nodo?.calcolo_automatico && lavoratori.length > 0) {
    const storedPer = new Map(
      risposte
        .filter((r) => domandaBaseId(r.domandaId) === nodo.id)
        .map((r) => [r.domandaId, r.valore])
    );
    for (const l of lavoratori) {
      if (!l.dataFormazione) continue;
      const cid = idRispostaFormazione(nodo.id, l.id);
      const nuovo = valutaConformitaDaScadenza(
        l.dataFormazione,
        nodo.periodicita_mesi ?? null,
        dataVisita,
        nodo.soglia_pc_giorni ?? 60
      );
      const vecchio = storedPer.has(cid) ? storedPer.get(cid)! : null;
      if (nuovo !== vecchio) {
        out.push({ domandaId: cid, base: nodo, vecchioValore: vecchio, nuovoValore: nuovo });
      }
    }
  }

  return out;
}
