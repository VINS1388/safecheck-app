"use client";

import { cn } from "@/lib/utils";
import type { DomandaTemplate, EsitoRisposta } from "@/types";

const VALORI: EsitoRisposta[] = ["C", "PC", "NC", "NV", "NA"];

const ETICHETTE: Record<EsitoRisposta, string> = {
  C: "Conforme",
  PC: "Parz. conforme",
  NC: "Non conforme",
  NV: "Non verificato",
  NA: "Non applicabile",
};

// Stile del bottone quando selezionato (NC rosso, PC arancione, C verde).
const STILE_SELEZIONATO: Record<EsitoRisposta, string> = {
  C: "border-green-600 bg-green-600 text-white",
  PC: "border-amber-500 bg-amber-500 text-white",
  NC: "border-red-600 bg-red-600 text-white",
  NV: "border-slate-500 bg-slate-500 text-white",
  NA: "border-slate-400 bg-slate-400 text-white",
};

export interface DomandaCardProps {
  domanda: DomandaTemplate;
  valore: EsitoRisposta | null;
  azioneCorrettiva: string;
  onValore: (valore: EsitoRisposta) => void;
  onAzione: (testo: string) => void;
}

export default function DomandaCard({
  domanda,
  valore,
  azioneCorrettiva,
  onValore,
  onAzione,
}: DomandaCardProps) {
  const mostraAzione = valore === "NC" || valore === "PC";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm font-medium text-gray-900">
          {domanda.testo}
          {domanda.obbligatoria && (
            <span className="ml-1 text-red-500" title="Obbligatoria">
              *
            </span>
          )}
        </p>
      </div>

      {domanda.note_tecnico && (
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          {domanda.note_tecnico}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {VALORI.map((v) => {
          const selezionato = valore === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onValore(v)}
              title={ETICHETTE[v]}
              className={cn(
                "min-w-[3rem] rounded-md border px-3 py-1.5 text-sm font-semibold transition",
                selezionato
                  ? STILE_SELEZIONATO[v]
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
              )}
            >
              {v}
            </button>
          );
        })}
      </div>

      {mostraAzione && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-700">
            Azione correttiva suggerita
          </label>
          <textarea
            value={azioneCorrettiva}
            onChange={(e) => onAzione(e.target.value)}
            rows={2}
            placeholder={domanda.correzione_default || undefined}
            className="mt-1 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
          />
        </div>
      )}
    </div>
  );
}
