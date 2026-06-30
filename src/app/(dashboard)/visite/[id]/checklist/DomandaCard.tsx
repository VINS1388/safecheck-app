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
  NV: "border-gray-500 bg-gray-500 text-white",
  NA: "border-gray-400 bg-gray-400 text-white",
};

export interface DomandaCardProps {
  domanda: DomandaTemplate;
  valore: EsitoRisposta | null;
  azioneCorrettiva: string;
  osservazioni: string;
  disabled?: boolean;
  onValore: (valore: EsitoRisposta) => void;
  onAzione: (testo: string) => void;
  onMotivazione: (testo: string) => void;
}

export default function DomandaCard({
  domanda,
  valore,
  azioneCorrettiva,
  osservazioni,
  disabled,
  onValore,
  onAzione,
  onMotivazione,
}: DomandaCardProps) {
  const mostraAzione = valore === "NC" || valore === "PC";
  const mostraMotivazione = valore === "NV" || valore === "NA";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium leading-snug text-gray-900">
        {domanda.testo}
        {domanda.obbligatoria && (
          <span className="ml-1 text-red-500" title="Obbligatoria">
            *
          </span>
        )}
      </p>

      {/* Descrizione normativa visibile al tecnico. Fonte primaria: `descrizione`;
          fallback su `note_tecnico` per domande non ancora migrate e snapshot già congelati. */}
      {(domanda.descrizione?.trim() || domanda.note_tecnico?.trim()) && (
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          {domanda.descrizione?.trim() || domanda.note_tecnico}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {VALORI.map((v) => {
          const selezionato = valore === v;
          return (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => onValore(v)}
              className={cn(
                "flex min-h-[48px] flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-center font-semibold leading-tight transition disabled:opacity-50",
                selezionato
                  ? STILE_SELEZIONATO[v]
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
              )}
            >
              <span className="text-base font-bold">{v}</span>
              <span
                className={cn(
                  "text-[10px] font-medium",
                  selezionato ? "text-white/90" : "text-gray-500"
                )}
              >
                {ETICHETTE[v]}
              </span>
            </button>
          );
        })}
      </div>

      {mostraAzione && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-700">
            Azione correttiva <span className="text-red-500" title="Obbligatoria">*</span>
          </label>
          <textarea
            value={azioneCorrettiva}
            onChange={(e) => onAzione(e.target.value)}
            disabled={disabled}
            rows={2}
            placeholder="Descrivi l'azione correttiva da adottare…"
            className={cn(
              "mt-1 w-full resize-y rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] disabled:bg-gray-50",
              azioneCorrettiva.trim() ? "border-gray-300" : "border-red-300"
            )}
          />
          {!azioneCorrettiva.trim() && !disabled && (
            <p className="mt-1 text-xs text-red-500">
              Campo obbligatorio per chiudere la domanda.
            </p>
          )}
        </div>
      )}

      {mostraMotivazione && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-700">
            Motivazione <span className="text-red-500" title="Obbligatoria">*</span>
          </label>
          <textarea
            value={osservazioni}
            onChange={(e) => onMotivazione(e.target.value)}
            disabled={disabled}
            rows={2}
            placeholder={
              valore === "NA"
                ? "Perché non applicabile?"
                : "Perché non verificato?"
            }
            className={cn(
              "mt-1 w-full resize-y rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] disabled:bg-gray-50",
              osservazioni.trim() ? "border-gray-300" : "border-red-300"
            )}
          />
          {!osservazioni.trim() && !disabled && (
            <p className="mt-1 text-xs text-red-500">
              Campo obbligatorio per chiudere la domanda.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
