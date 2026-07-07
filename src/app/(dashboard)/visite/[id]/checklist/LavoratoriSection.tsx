"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Lavoratore, LivelloRischio } from "@/types";

interface Props {
  lavoratori: Lavoratore[];
  disabled?: boolean;
  onChange: (next: Lavoratore[]) => void;
}

const LIVELLI: { key: LivelloRischio; label: string; sel: string }[] = [
  { key: "basso", label: "Basso", sel: "border-green-600 bg-green-600 text-white" },
  { key: "medio", label: "Medio", sel: "border-amber-500 bg-amber-500 text-white" },
  { key: "alto", label: "Alto", sel: "border-red-600 bg-red-600 text-white" },
];

const INPUT =
  "min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-gray-50";

function nuovoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `lav-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const BOZZA_VUOTA: Omit<Lavoratore, "id"> = {
  nome: "",
  mansione: "",
  livelloRischio: "basso",
  dataFormazione: "",
};

/** Bottoni livello di rischio (coerenti col design system, no dropdown). */
function LivelloButtons({
  valore,
  disabled,
  onSet,
}: {
  valore: LivelloRischio;
  disabled?: boolean;
  onSet: (v: LivelloRischio) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {LIVELLI.map((l) => {
        const sel = valore === l.key;
        return (
          <button
            key={l.key}
            type="button"
            disabled={disabled}
            onClick={() => onSet(l.key)}
            className={cn(
              "min-h-[40px] flex-1 rounded-lg border px-2 text-sm font-medium transition disabled:opacity-50",
              sel ? l.sel : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            )}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

export default function LavoratoriSection({ lavoratori, disabled, onChange }: Props) {
  const [bozza, setBozza] = useState<Omit<Lavoratore, "id"> | null>(null);

  function aggiorna(id: string, patch: Partial<Lavoratore>) {
    onChange(lavoratori.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function rimuovi(id: string) {
    onChange(lavoratori.filter((l) => l.id !== id));
  }
  const bozzaValida =
    !!bozza && bozza.nome.trim() && bozza.mansione.trim() && bozza.dataFormazione.trim();
  function confermaBozza() {
    if (!bozza || !bozzaValida) return;
    onChange([
      ...lavoratori,
      {
        id: nuovoId(),
        nome: bozza.nome.trim(),
        mansione: bozza.mansione.trim(),
        livelloRischio: bozza.livelloRischio,
        dataFormazione: bozza.dataFormazione,
      },
    ]);
    setBozza(null);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">Elenco lavoratori</h3>
      <p className="mt-0.5 text-xs text-gray-500">
        Inserisci i lavoratori e la data dell&apos;ultima formazione. Lo stato di
        conformità (C/PC/NC) è calcolato automaticamente in SEZ-03 rispetto alla
        data del sopralluogo.
      </p>

      {/* Lavoratori inseriti — righe editabili + rimuovi */}
      <div className="mt-4 space-y-3">
        {lavoratori.map((l) => (
          <div key={l.id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">Nome e cognome</label>
                <input
                  value={l.nome}
                  onChange={(e) => aggiorna(l.id, { nome: e.target.value })}
                  disabled={disabled}
                  placeholder="Nome e cognome"
                  className={`mt-1 ${INPUT}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Mansione</label>
                <input
                  value={l.mansione}
                  onChange={(e) => aggiorna(l.id, { mansione: e.target.value })}
                  disabled={disabled}
                  placeholder="Es. operaio, impiegata…"
                  className={`mt-1 ${INPUT}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Livello di rischio</label>
                <div className="mt-1">
                  <LivelloButtons
                    valore={l.livelloRischio}
                    disabled={disabled}
                    onSet={(v) => aggiorna(l.id, { livelloRischio: v })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Data formazione</label>
                <input
                  type="date"
                  value={l.dataFormazione}
                  onChange={(e) => aggiorna(l.id, { dataFormazione: e.target.value })}
                  disabled={disabled}
                  className={`mt-1 ${INPUT}`}
                />
              </div>
            </div>
            {!disabled && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => rimuovi(l.id)}
                  className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-red-200 hover:text-red-600"
                >
                  ✕ Rimuovi
                </button>
              </div>
            )}
          </div>
        ))}

        {lavoratori.length === 0 && !bozza && (
          <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Nessun lavoratore inserito.
          </p>
        )}
      </div>

      {/* Form inline per aggiungere un lavoratore */}
      {!disabled && bozza && (
        <div className="mt-3 rounded-lg border border-brand/30 bg-brand/5 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Nome e cognome <span className="text-red-500">*</span>
              </label>
              <input
                value={bozza.nome}
                onChange={(e) => setBozza({ ...bozza, nome: e.target.value })}
                placeholder="Nome e cognome"
                className={`mt-1 ${INPUT}`}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Mansione <span className="text-red-500">*</span>
              </label>
              <input
                value={bozza.mansione}
                onChange={(e) => setBozza({ ...bozza, mansione: e.target.value })}
                placeholder="Es. operaio, impiegata…"
                className={`mt-1 ${INPUT}`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Livello di rischio</label>
              <div className="mt-1">
                <LivelloButtons
                  valore={bozza.livelloRischio}
                  onSet={(v) => setBozza({ ...bozza, livelloRischio: v })}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Data formazione <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={bozza.dataFormazione}
                onChange={(e) => setBozza({ ...bozza, dataFormazione: e.target.value })}
                className={`mt-1 ${INPUT}`}
              />
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={confermaBozza}
              disabled={!bozzaValida}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white transition enabled:hover:bg-brand-hover disabled:opacity-40"
            >
              Aggiungi lavoratore
            </button>
            <button
              type="button"
              onClick={() => setBozza(null)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {!disabled && !bozza && (
        <button
          type="button"
          onClick={() => setBozza({ ...BOZZA_VUOTA })}
          className="mt-3 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-brand transition hover:border-brand/50 hover:bg-brand/5"
        >
          + Aggiungi lavoratore
        </button>
      )}
    </div>
  );
}
