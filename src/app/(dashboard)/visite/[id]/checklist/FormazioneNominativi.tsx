"use client";

import type { DomandaTemplate, EsitoRisposta } from "@/types";
import type { IstanzaFormazione } from "@/lib/checklist/formazione";
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

interface Props {
  // Istanze attive (già con fusione DL/RSPP applicata), ordinate.
  istanze: IstanzaFormazione[];
  // risposte[compositeDomandaId] -> FormEntry
  risposte: Record<string, FormEntry>;
  disabled: boolean;
  onChange: (compositeId: string, patch: Partial<FormEntry>) => void;
}

export default function FormazioneNominativi({
  istanze,
  risposte,
  disabled,
  onChange,
}: Props) {
  if (istanze.length === 0) {
    return (
      <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Nessun nominativo inserito in SEZ-01: le domande di formazione per figura
        compaiono automaticamente man mano che inserisci i nominativi.
      </p>
    );
  }

  // Raggruppa per figura mantenendo l'ordine (per `ordine` della domanda base).
  const ordinate = [...istanze].sort((a, b) => a.ordine - b.ordine);
  const gruppi: { figuraKey: string; figuraLabel: string; lista: IstanzaFormazione[] }[] = [];
  for (const i of ordinate) {
    let g = gruppi.find((x) => x.figuraKey === i.figuraKey);
    if (!g) {
      g = { figuraKey: i.figuraKey, figuraLabel: i.figuraLabel, lista: [] };
      gruppi.push(g);
    }
    g.lista.push(i);
  }

  return (
    <div className="space-y-6">
      {gruppi.map((g) => (
        <div key={g.figuraKey}>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">{g.figuraLabel}</h3>
          <div className="space-y-4">
            {g.lista.map((ist) => {
              const e = risposte[ist.compositeId] ?? FORM_ENTRY_VUOTA;
              // Domanda sintetica personalizzata (mantiene descrizione/correzione
              // del requisito formativo della figura/base).
              const domandaNom: DomandaTemplate = {
                ...ist.domandaBase,
                id: ist.compositeId,
                testo: ist.testo,
                campo_extra: undefined,
                figura_nominativo: undefined,
              };
              return (
                <DomandaCard
                  key={ist.compositeId}
                  domanda={domandaNom}
                  valore={e.esito}
                  azioneCorrettiva={e.azione}
                  osservazioneEvidenza=""
                  osservazioni={e.osservazione}
                  disabled={disabled}
                  mostraOsservazioneEvidenza={false}
                  mostraDataVerifica
                  dataVerifica={e.dataVerifica}
                  onDataVerifica={(v) => onChange(ist.compositeId, { dataVerifica: v })}
                  onValore={(v) => {
                    const patch: Partial<FormEntry> = { esito: v };
                    if (
                      (v === "NC" || v === "PC") &&
                      !e.azione.trim() &&
                      ist.domandaBase.correzione_default?.trim()
                    ) {
                      patch.azione = ist.domandaBase.correzione_default;
                    }
                    onChange(ist.compositeId, patch);
                  }}
                  onAzione={(t) => onChange(ist.compositeId, { azione: t })}
                  onOsservazioneEvidenza={() => {}}
                  onMotivazione={(t) => onChange(ist.compositeId, { osservazione: t })}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
