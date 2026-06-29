"use client";

import { useState } from "react";
import { FIGURE_SICUREZZA, type Nominativi } from "@/types";

interface Props {
  nominativi: Nominativi;
  disabled?: boolean;
  onChange: (next: Nominativi) => void;
}

export default function NominativiSEZ01({
  nominativi,
  disabled,
  onChange,
}: Props) {
  function setSingolo(key: string, value: string) {
    onChange({ ...nominativi, [key]: value });
  }

  function getLista(key: string): string[] {
    const v = nominativi[key];
    return Array.isArray(v) ? v : [];
  }

  function setLista(key: string, lista: string[]) {
    onChange({ ...nominativi, [key]: lista });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">
        Nominativi figure della sicurezza
      </h3>
      <p className="mt-0.5 text-xs text-gray-500">
        Indica i nominativi delle figure presenti. Per le figure multiple
        aggiungi un nome alla volta (Invio o virgola).
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIGURE_SICUREZZA.map((f) =>
          f.multiplo ? (
            <TagInput
              key={f.key}
              label={f.label}
              valori={getLista(f.key)}
              disabled={disabled}
              onChange={(lista) => setLista(f.key, lista)}
            />
          ) : (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-700">
                {f.label}
              </label>
              <input
                value={typeof nominativi[f.key] === "string" ? (nominativi[f.key] as string) : ""}
                onChange={(e) => setSingolo(f.key, e.target.value)}
                disabled={disabled}
                placeholder="Nome e cognome"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] disabled:bg-gray-50"
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}

function TagInput({
  label,
  valori,
  disabled,
  onChange,
}: {
  label: string;
  valori: string[];
  disabled?: boolean;
  onChange: (lista: string[]) => void;
}) {
  const [bozza, setBozza] = useState("");

  function aggiungi(raw: string) {
    const nome = raw.trim().replace(/,$/, "").trim();
    if (!nome) return;
    if (!valori.includes(nome)) onChange([...valori, nome]);
    setBozza("");
  }

  function rimuovi(i: number) {
    onChange(valori.filter((_, idx) => idx !== i));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      aggiungi(bozza);
    } else if (e.key === "Backspace" && !bozza && valori.length > 0) {
      rimuovi(valori.length - 1);
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <div className="mt-1 flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1.5 focus-within:border-[#1e3a5f] focus-within:ring-1 focus-within:ring-[#1e3a5f]">
        {valori.map((nome, i) => (
          <span
            key={`${nome}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-[#1e3a5f]/10 px-2 py-0.5 text-xs font-medium text-[#1e3a5f]"
          >
            {nome}
            {!disabled && (
              <button
                type="button"
                onClick={() => rimuovi(i)}
                className="text-[#1e3a5f]/60 hover:text-[#1e3a5f]"
                aria-label={`Rimuovi ${nome}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          value={bozza}
          onChange={(e) => setBozza(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => aggiungi(bozza)}
          disabled={disabled}
          placeholder={valori.length === 0 ? "Aggiungi nome…" : ""}
          className="min-w-[6rem] flex-1 border-none bg-transparent py-0.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:bg-transparent"
        />
      </div>
    </div>
  );
}
