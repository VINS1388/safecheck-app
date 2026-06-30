import { FIGURE_SICUREZZA, idRispostaFormazione } from "@/types";
import type {
  DomandaTemplate,
  Nominativo,
  NominativiStrutturati,
  SezioneTemplate,
} from "@/types";

// ── Derivazione domande di formazione SEZ-03 (Sprint 12 + 12.2) ────────────
//
// Vista derivata: per ogni nominativo di una figura mappata si genera una
// domanda di formazione. Sprint 12.2 aggiunge la regola DL/RSPP: se DL e RSPP
// sono la stessa persona (STESSO id stabile), al posto delle due domande
// separate (Formazione DL + Formazione RSPP) compare un'unica domanda
// "DL-SPP" (percorso art. 34), basata su D-03-005.

const FIG_DL = "DL";
const FIG_RSPP = "RSPP";
const Q_DLSPP = "D-03-005"; // "Formazione DL che svolge i compiti del SPP"
export const FIGURA_DLSPP = "DL_SPP"; // chiave di raggruppamento sintetica

/** Una singola istanza di domanda di formazione (per nominativo). */
export interface IstanzaFormazione {
  compositeId: string; // "<baseId>::<nominativoId>"
  domandaBaseId: string;
  domandaBase: DomandaTemplate;
  figuraKey: string; // chiave figura (raggruppamento/ordine)
  figuraLabel: string;
  nominativo: Nominativo;
  testo: string; // etichetta personalizzata
  ordine: number;
}

/**
 * Se DL e RSPP coincidono (stesso id stabile), ritorna il nominativo unificato;
 * altrimenti null. Confronto su id, MAI sul nome (un refuso non deve contare).
 */
export function dlCoincideRspp(nominativi: NominativiStrutturati): Nominativo | null {
  const dl = (nominativi[FIG_DL] ?? [])[0] ?? null;
  const rspp = (nominativi[FIG_RSPP] ?? [])[0] ?? null;
  return dl && rspp && dl.id === rspp.id ? dl : null;
}

function labelFigura(key: string): string {
  if (key === FIGURA_DLSPP) return "Datore di Lavoro / RSPP (percorso DL-SPP)";
  return FIGURE_SICUREZZA.find((f) => f.key === key)?.label ?? key;
}

/**
 * Istanze di formazione attive per la sezione, dato lo stato corrente dei
 * nominativi. Applica la fusione DL/RSPP quando coincidono.
 */
export function istanzeFormazione(
  sezione: Pick<SezioneTemplate, "domande">,
  nominativi: NominativiStrutturati
): IstanzaFormazione[] {
  const merged = dlCoincideRspp(nominativi);
  const mappate = sezione.domande
    .filter((d) => d.figura_nominativo)
    .sort((a, b) => a.ordine - b.ordine);

  const out: IstanzaFormazione[] = [];
  for (const d of mappate) {
    const fig = d.figura_nominativo!;
    for (const nom of nominativi[fig] ?? []) {
      // Persona unificata DL=RSPP: salta sia la domanda DL sia la domanda RSPP.
      if (merged && (fig === FIG_DL || fig === FIG_RSPP) && nom.id === merged.id) {
        continue;
      }
      out.push({
        compositeId: idRispostaFormazione(d.id, nom.id),
        domandaBaseId: d.id,
        domandaBase: d,
        figuraKey: fig,
        figuraLabel: labelFigura(fig),
        nominativo: nom,
        testo: `Formazione di ${nom.nome}`,
        ordine: d.ordine,
      });
    }
  }

  // Domanda unica DL-SPP per la persona unificata (basata su D-03-005).
  if (merged) {
    const base = sezione.domande.find((d) => d.id === Q_DLSPP);
    if (base) {
      out.push({
        compositeId: idRispostaFormazione(Q_DLSPP, merged.id),
        domandaBaseId: Q_DLSPP,
        domandaBase: base,
        figuraKey: FIGURA_DLSPP,
        figuraLabel: labelFigura(FIGURA_DLSPP),
        nominativo: merged,
        testo: `Formazione DL-SPP di ${merged.nome}`,
        ordine: base.ordine,
      });
    }
  }

  return out;
}

/**
 * Domande generiche dirette attive di una sezione formazione: quelle senza
 * `figura_nominativo`, escludendo D-03-005 quando DL/RSPP sono fusi (in quel
 * caso D-03-005 è gestita come istanza per-nominativo, non come domanda diretta).
 */
export function genericheFormazione(
  sezione: Pick<SezioneTemplate, "domande">,
  nominativi: NominativiStrutturati
): DomandaTemplate[] {
  const merged = dlCoincideRspp(nominativi);
  return sezione.domande
    .filter((d) => !d.figura_nominativo && !(merged && d.id === Q_DLSPP))
    .sort((a, b) => a.ordine - b.ordine);
}
