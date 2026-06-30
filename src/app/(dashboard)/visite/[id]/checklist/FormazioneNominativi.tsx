"use client";

import { FIGURE_SICUREZZA, idRispostaFormazione } from "@/types";
import type {
  DomandaTemplate,
  EsitoRisposta,
  NominativiStrutturati,
} from "@/types";
import DomandaCard from "./DomandaCard";

/** Stato locale di una risposta di formazione per-nominativo. */
export interface FormEntry {
  esito: EsitoRisposta | null;
  azione: string; // azione_correttiva
  osservazione: string; // motivazione NV/NA (osservazioni)
  dataVerifica: string; // campo_extra.data_verifica
}

export const FORM_ENTRY_VUOTA: FormEntry = {
  esito: null,
  azione: "",
  osservazione: "",
  dataVerifica: "",
};

const LABEL_FIGURA = new Map(FIGURE_SICUREZZA.map((f) => [f.key, f.label]));

interface Props {
  // Le domande SEZ-03 mappate a una figura (con figura_nominativo).
  domandeFigura: DomandaTemplate[];
  nominativi: NominativiStrutturati;
  // risposte[compositeDomandaId] -> FormEntry
  risposte: Record<string, FormEntry>;
  disabled: boolean;
  onChange: (compositeId: string, patch: Partial<FormEntry>) => void;
}

export default function FormazioneNominativi({
  domandeFigura,
  nominativi,
  risposte,
  disabled,
  onChange,
}: Props) {
  // Gruppi (in ordine di sezione) che hanno almeno un nominativo.
  const gruppi = [...domandeFigura]
    .sort((a, b) => a.ordine - b.ordine)
    .map((d) => ({ domanda: d, figura: d.figura_nominativo!, lista: nominativi[d.figura_nominativo!] ?? [] }))
    .filter((g) => g.lista.length > 0);

  if (gruppi.length === 0) {
    return (
      <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Nessun nominativo inserito in SEZ-01: le domande di formazione per figura
        compaiono automaticamente man mano che inserisci i nominativi.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {gruppi.map(({ domanda, figura, lista }) => (
        <div key={figura}>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            {LABEL_FIGURA.get(figura) ?? figura}
          </h3>
          <div className="space-y-4">
            {lista.map((nom) => {
              const cid = idRispostaFormazione(domanda.id, nom.id);
              const e = risposte[cid] ?? FORM_ENTRY_VUOTA;
              // Domanda sintetica personalizzata per il nominativo (mantiene la
              // descrizione/correzione del requisito formativo della figura).
              const domandaNom: DomandaTemplate = {
                ...domanda,
                id: cid,
                testo: `Formazione di ${nom.nome}`,
                campo_extra: undefined,
                figura_nominativo: undefined,
              };
              return (
                <DomandaCard
                  key={cid}
                  domanda={domandaNom}
                  valore={e.esito}
                  azioneCorrettiva={e.azione}
                  osservazioneEvidenza=""
                  osservazioni={e.osservazione}
                  disabled={disabled}
                  mostraOsservazioneEvidenza={false}
                  mostraDataVerifica
                  dataVerifica={e.dataVerifica}
                  onDataVerifica={(v) => onChange(cid, { dataVerifica: v })}
                  onValore={(v) => {
                    const patch: Partial<FormEntry> = { esito: v };
                    if (
                      (v === "NC" || v === "PC") &&
                      !e.azione.trim() &&
                      domanda.correzione_default?.trim()
                    ) {
                      patch.azione = domanda.correzione_default;
                    }
                    onChange(cid, patch);
                  }}
                  onAzione={(t) => onChange(cid, { azione: t })}
                  onOsservazioneEvidenza={() => {}}
                  onMotivazione={(t) => onChange(cid, { osservazione: t })}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
