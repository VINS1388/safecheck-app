"use client";

import { useState } from "react";
import { FIGURE_SICUREZZA } from "@/types";
import type { Nominativo, NominativiStrutturati } from "@/types";

interface Props {
  nominativi: NominativiStrutturati;
  disabled?: boolean;
  onChange: (next: NominativiStrutturati) => void;
  // Ritorna le etichette delle risposte di formazione che diventerebbero orfane
  // applicando `next` (Sprint 12.2). Se non vuoto → conferma esplicita.
  orfani?: (next: NominativiStrutturati) => string[];
}

function nuovoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface Conferma {
  orfani: string[];
  apply: () => void;
}

const INPUT =
  "min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-gray-50";

export default function NominativiSEZ01({
  nominativi,
  disabled,
  onChange,
  orfani,
}: Props) {
  const [conferma, setConferma] = useState<Conferma | null>(null);

  function lista(key: string): Nominativo[] {
    return nominativi[key] ?? [];
  }
  /** Applica `next` direttamente, o chiede conferma se causa risposte orfane. */
  function applica(next: NominativiStrutturati) {
    const o = orfani?.(next) ?? [];
    if (o.length > 0) {
      setConferma({ orfani: o, apply: () => onChange(next) });
    } else {
      onChange(next);
    }
  }
  function setLista(key: string, next: Nominativo[]) {
    applica({ ...nominativi, [key]: next });
  }

  const dl = lista("DL")[0] ?? null;
  const rspp = lista("RSPP")[0] ?? null;
  const dlRsppFusi = Boolean(dl && rspp && dl.id === rspp.id);

  function toggleDlRspp(checked: boolean) {
    if (checked) {
      if (!dl) return; // serve un DL per fondere
      applica({ ...nominativi, RSPP: [{ id: dl.id, nome: dl.nome }] });
    } else {
      // Sfusione: RSPP torna vuoto, il tecnico inserirà la persona separata.
      applica({ ...nominativi, RSPP: [] });
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
        {FIGURE_SICUREZZA.map((f) => {
          // RSPP: gestione speciale per il toggle DL-SPP.
          if (f.key === "RSPP") {
            return (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-700">{f.label}</label>
                {dlRsppFusi ? (
                  <p className="mt-1 flex min-h-[44px] items-center rounded-lg border border-dashed border-brand/40 bg-brand/5 px-3 text-sm text-brand">
                    Coincide con il Datore di Lavoro ({dl?.nome})
                  </p>
                ) : (
                  <input
                    value={rspp?.nome ?? ""}
                    onChange={(e) => {
                      const nome = e.target.value;
                      if (rspp) {
                        if (!nome.trim()) return setLista("RSPP", []);
                        return setLista("RSPP", [{ ...rspp, nome }]);
                      }
                      if (nome.trim()) setLista("RSPP", [{ id: nuovoId(), nome }]);
                    }}
                    disabled={disabled}
                    placeholder="Nome e cognome"
                    className={`mt-1 ${INPUT}`}
                  />
                )}
                {!disabled && (
                  <label className="mt-1.5 flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={dlRsppFusi}
                      disabled={!dl}
                      onChange={(e) => toggleDlRspp(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                    />
                    Il Datore di Lavoro svolge direttamente i compiti di RSPP (percorso DL-SPP)
                  </label>
                )}
              </div>
            );
          }

          return f.multiplo ? (
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
              onRemove={(nom) => setLista(f.key, lista(f.key).filter((n) => n.id !== nom.id))}
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
                  if (!nome.trim()) return setLista(f.key, []);
                  setLista(f.key, [{ ...corrente, nome }]); // rename, id invariato
                } else if (nome.trim()) {
                  setLista(f.key, [{ id: nuovoId(), nome }]);
                }
              }}
            />
          );
        })}
      </div>

      {conferma && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            Questa modifica eliminerà {conferma.orfani.length} rispost
            {conferma.orfani.length === 1 ? "a" : "e"} di formazione già compilat
            {conferma.orfani.length === 1 ? "a" : "e"}:
          </p>
          <ul className="mt-1 list-inside list-disc text-xs text-amber-800">
            {conferma.orfani.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                conferma.apply();
                setConferma(null);
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Procedi ed elimina
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
