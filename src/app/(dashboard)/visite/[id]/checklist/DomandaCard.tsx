"use client";

import { cn } from "@/lib/utils";
import type { DomandaTemplate, EsitoRisposta } from "@/types";
import AutoResizeTextarea from "./AutoResizeTextarea";

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

// Stile comune dei campi testo (padding 12px, font 16px su mobile via globals.css).
const TEXTAREA_BASE =
  "mt-1 w-full rounded-lg border px-3 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] disabled:bg-gray-50";

export interface DomandaCardProps {
  domanda: DomandaTemplate;
  valore: EsitoRisposta | null;
  azioneCorrettiva: string;
  osservazioneEvidenza: string;
  osservazioni: string;
  disabled?: boolean;
  // Mostra il campo opzionale "osservazione / descrizione evidenza" per NC/PC.
  // Disattivato nel contesto impresa di SEZ-08 (nessuna colonna dedicata).
  mostraOsservazioneEvidenza?: boolean;
  // Campo data di verifica formazione (SEZ-03 per-nominativo, Sprint 12).
  // Opzionale, non concorre alla completezza; nessun calcolo scadenze qui.
  mostraDataVerifica?: boolean;
  dataVerifica?: string;
  onDataVerifica?: (valore: string) => void;
  onValore: (valore: EsitoRisposta) => void;
  onAzione: (testo: string) => void;
  onOsservazioneEvidenza: (testo: string) => void;
  onMotivazione: (testo: string) => void;
}

export default function DomandaCard({
  domanda,
  valore,
  azioneCorrettiva,
  osservazioneEvidenza,
  osservazioni,
  disabled,
  mostraOsservazioneEvidenza = true,
  mostraDataVerifica = false,
  dataVerifica = "",
  onDataVerifica,
  onValore,
  onAzione,
  onOsservazioneEvidenza,
  onMotivazione,
}: DomandaCardProps) {
  const mostraAzione = valore === "NC" || valore === "PC";
  const mostraMotivazione = valore === "NV" || valore === "NA";
  // Campo testo libero opzionale (es. elenco imprese appaltatrici di SEZ-08):
  // persistito su `osservazione_evidenza`, sempre visibile, indipendente dall'esito.
  const campoTestoLibero = domanda.campo_extra?.tipo === "testo_libero";

  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white p-4 shadow-sm",
        // Domanda condizionale (gated): accento amber sul bordo sinistro +
        // indentazione + sfondo tenue, per percepire il raggruppamento sotto la
        // domanda filtro. Puramente visivo: nessun impatto su logica/completezza/PDF.
        domanda.gated_by && "ml-3 border-l-4 border-l-amber-400 bg-amber-50/30"
      )}
    >
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

      {/* Nota operativa UI (es. effetto della domanda filtro di sezione). */}
      {domanda.nota_ui?.trim() && (
        <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
          {domanda.nota_ui}
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

      {/* Data di verifica/aggiornamento formazione (SEZ-03 per-nominativo).
          Opzionale, indipendente dall'esito; nessun calcolo di scadenza. */}
      {mostraDataVerifica && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-700">
            Data ultima verifica/aggiornamento formazione{" "}
            <span className="font-normal text-gray-400">(opzionale)</span>
          </label>
          <input
            type="date"
            value={dataVerifica}
            onChange={(e) => onDataVerifica?.(e.target.value)}
            disabled={disabled}
            className="mt-1 min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] disabled:bg-gray-50"
          />
        </div>
      )}

      {/* Campo testo libero opzionale, indipendente dall'esito (es. elenco
          imprese appaltatrici / referenti). Persistito su osservazione_evidenza. */}
      {campoTestoLibero && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-700">
            {domanda.campo_extra?.label ?? "Annotazione"}{" "}
            <span className="font-normal text-gray-400">(opzionale)</span>
          </label>
          <AutoResizeTextarea
            value={osservazioneEvidenza}
            onChange={(e) => onOsservazioneEvidenza(e.target.value)}
            disabled={disabled}
            minRows={3}
            placeholder="Elenca ragione sociale e referente delle imprese presenti…"
            className={cn(TEXTAREA_BASE, "border-gray-300")}
          />
        </div>
      )}

      {mostraAzione && (
        <>
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700">
              Azione correttiva <span className="text-red-500" title="Obbligatoria">*</span>
            </label>
            <AutoResizeTextarea
              value={azioneCorrettiva}
              onChange={(e) => onAzione(e.target.value)}
              disabled={disabled}
              minRows={3}
              placeholder="Descrivi l'azione correttiva da adottare…"
              className={cn(
                TEXTAREA_BASE,
                azioneCorrettiva.trim() ? "border-gray-300" : "border-red-300"
              )}
            />
            {!azioneCorrettiva.trim() && !disabled && (
              <p className="mt-1 text-xs text-red-500">
                Campo obbligatorio per chiudere la domanda.
              </p>
            )}
          </div>

          {/* Campo OPZIONALE: descrizione dell'evidenza osservata. Non blocca la
              chiusura. Soppresso se la domanda usa già osservazione_evidenza per
              il campo testo libero (stessa colonna), per evitare doppio input. */}
          {mostraOsservazioneEvidenza && !campoTestoLibero && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700">
                Osservazione / descrizione evidenza{" "}
                <span className="font-normal text-gray-400">(opzionale)</span>
              </label>
              <AutoResizeTextarea
                value={osservazioneEvidenza}
                onChange={(e) => onOsservazioneEvidenza(e.target.value)}
                disabled={disabled}
                minRows={3}
                placeholder="Descrivi cosa hai osservato durante il sopralluogo…"
                className={cn(TEXTAREA_BASE, "border-gray-300")}
              />
            </div>
          )}
        </>
      )}

      {mostraMotivazione && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-700">
            Motivazione <span className="text-red-500" title="Obbligatoria">*</span>
          </label>
          <AutoResizeTextarea
            value={osservazioni}
            onChange={(e) => onMotivazione(e.target.value)}
            disabled={disabled}
            minRows={3}
            placeholder={
              valore === "NA"
                ? "Perché non applicabile?"
                : "Perché non verificato?"
            }
            className={cn(
              TEXTAREA_BASE,
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
