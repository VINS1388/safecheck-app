"use client";

import { useState } from "react";
import { FIGURE_SICUREZZA } from "@/types";
import type { Nominativo, NominativiStrutturati } from "@/types";

interface Props {
  nominativi: NominativiStrutturati;
  disabled?: boolean;
  onChange: (next: NominativiStrutturati) => void;
  // True se il nominativo ha già una risposta di formazione (SEZ-03): in tal
  // caso la rimozione richiede conferma esplicita (Sprint 12).
  haRisposta?: (nominativoId: string) => boolean;
}

function nuovoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface Conferma {
  nome: string;
  apply: () => void;
}

const INPUT =
  "min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] disabled:bg-gray-50";

export default function NominativiSEZ01({
  nominativi,
  disabled,
  onChange,
  haRisposta,
}: Props) {
  const [conferma, setConferma] = useState<Conferma | null>(null);

  function lista(key: string): Nominativo[] {
    return nominativi[key] ?? [];
  }
  function setLista(key: string, next: Nominativo[]) {
    onChange({ ...nominativi, [key]: next });
  }

  /** Rimozione con conferma se il nominativo ha già una risposta di formazione. */
  function chiediRimozione(nom: Nominativo, apply: () => void) {
    if (haRisposta?.(nom.id)) {
      setConferma({ nome: nom.nome, apply });
    } else {
      apply();
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">
        Nominativi figure della sicurezza
      </h3>
      <p className="mt-0.5 text-xs text-gray-500">
        Indica i nominativi delle figure presenti. Le domande di formazione
        (SEZ-03) si generano automaticamente per ciascun nominativo.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIGURE_SICUREZZA.map((f) =>
          f.multiplo ? (
            <FiguraMultipla
              key={f.key}
              label={f.label}
              valori={lista(f.key)}
              disabled={disabled}
              onAdd={(nome) => setLista(f.key, [...lista(f.key), { id: nuovoId(), nome }])}
              onRename={(id, nome) =>
                setLista(
                  f.key,
                  lista(f.key).map((n) => (n.id === id ? { ...n, nome } : n))
                )
              }
              onRemove={(nom) =>
                chiediRimozione(nom, () =>
                  setLista(f.key, lista(f.key).filter((n) => n.id !== nom.id))
                )
              }
            />
          ) : (
            <FiguraSingola
              key={f.key}
              label={f.label}
              valore={lista(f.key)[0] ?? null}
              disabled={disabled}
              onSet={(nome) => {
                const corrente = lista(f.key)[0] ?? null;
                if (corrente) {
                  // Svuotare = rimuovere: conferma se ha risposta formazione.
                  if (!nome.trim()) {
                    chiediRimozione(corrente, () => setLista(f.key, []));
                    return;
                  }
                  setLista(f.key, [{ ...corrente, nome }]); // rename, id invariato
                } else if (nome.trim()) {
                  setLista(f.key, [{ id: nuovoId(), nome }]);
                }
              }}
            />
          )
        )}
      </div>

      {conferma && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            <span className="font-semibold">{conferma.nome}</span> ha già una
            risposta di formazione compilata. Rimuoverlo la eliminerà. Confermi?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                conferma.apply();
                setConferma(null);
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Rimuovi e elimina risposta
            </button>
            <button
              type="button"
              onClick={() => setConferma(null)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FiguraSingola({
  label,
  valore,
  disabled,
  onSet,
}: {
  label: string;
  valore: Nominativo | null;
  disabled?: boolean;
  onSet: (nome: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <input
        value={valore?.nome ?? ""}
        onChange={(e) => onSet(e.target.value)}
        disabled={disabled}
        placeholder="Nome e cognome"
        className={`mt-1 ${INPUT}`}
      />
    </div>
  );
}

function FiguraMultipla({
  label,
  valori,
  disabled,
  onAdd,
  onRename,
  onRemove,
}: {
  label: string;
  valori: Nominativo[];
  disabled?: boolean;
  onAdd: (nome: string) => void;
  onRename: (id: string, nome: string) => void;
  onRemove: (nom: Nominativo) => void;
}) {
  const [bozza, setBozza] = useState("");

  function aggiungi() {
    const nome = bozza.trim().replace(/,$/, "").trim();
    if (!nome) return;
    if (!valori.some((v) => v.nome === nome)) onAdd(nome);
    setBozza("");
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <div className="mt-1 space-y-1.5">
        {valori.map((nom) => (
          <div key={nom.id} className="flex items-center gap-2">
            <input
              value={nom.nome}
              onChange={(e) => onRename(nom.id, e.target.value)}
              disabled={disabled}
              className={INPUT}
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(nom)}
                aria-label={`Rimuovi ${nom.nome}`}
                className="flex-shrink-0 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-400 hover:border-red-200 hover:text-red-600"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <input
            value={bozza}
            onChange={(e) => setBozza(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                aggiungi();
              }
            }}
            onBlur={aggiungi}
            placeholder={valori.length === 0 ? "Aggiungi nome…" : "Aggiungi altro nome…"}
            className={INPUT}
          />
        )}
      </div>
    </div>
  );
}
