"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type {
  DomandaTemplate,
  EsitoRisposta,
  ImpresaAppalto,
  TipoImpresa,
} from "@/types";
import { ETICHETTE_TIPO_IMPRESA } from "@/types";
import { rispostaCompleta } from "@/lib/checklist/completa";
import DomandaCard from "./DomandaCard";

/** Stato locale di una risposta-impresa (mappa sulle colonne della tabella). */
export interface ImpEntry {
  esito: EsitoRisposta | null;
  azione: string; // -> azione_correttiva
  osservazione: string; // -> osservazione (motivazione NV/NA)
}

export const IMP_ENTRY_VUOTA: ImpEntry = { esito: null, azione: "", osservazione: "" };

interface Props {
  domande: DomandaTemplate[]; // D-08-002..009 (ripetute per impresa)
  imprese: ImpresaAppalto[];
  // risposte[impresaId][domandaId] -> ImpEntry
  risposte: Record<string, Record<string, ImpEntry>>;
  disabled: boolean;
  onAdd: (ragioneSociale: string, tipo: TipoImpresa) => Promise<string | null>;
  onRemove: (impresaId: string) => Promise<void>;
  onChange: (impresaId: string, domandaId: string, patch: Partial<ImpEntry>) => void;
}

const TIPI: TipoImpresa[] = ["appaltatrice", "subappaltatrice", "lavoratore_autonomo"];

export default function SezioneAppaltiImprese({
  domande,
  imprese,
  risposte,
  disabled,
  onAdd,
  onRemove,
  onChange,
}: Props) {
  const [aperta, setAperta] = useState<string | null>(null);
  const [mostraForm, setMostraForm] = useState(false);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoImpresa>("appaltatrice");
  const [busy, setBusy] = useState(false);
  const [conferma, setConferma] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const domandeOrdinate = [...domande].sort((a, b) => a.ordine - b.ordine);
  const impresaAperta = imprese.find((i) => i.id === aperta) ?? null;

  /** Sintesi di completamento/NC per la lista. */
  function stato(impresaId: string) {
    const r = risposte[impresaId] ?? {};
    let date = 0;
    let nc = 0;
    let pc = 0;
    for (const d of domandeOrdinate) {
      const e = r[d.id];
      if (e?.esito) {
        // "data" solo se completa: NC/PC richiedono azione, NV/NA la motivazione.
        if (rispostaCompleta(e.esito, e.azione, e.osservazione)) date += 1;
        if (e.esito === "NC") nc += 1;
        if (e.esito === "PC") pc += 1;
      }
    }
    return { date, totale: domandeOrdinate.length, nc, pc };
  }

  async function aggiungi() {
    if (!nome.trim()) {
      setErrore("La ragione sociale è obbligatoria.");
      return;
    }
    setBusy(true);
    setErrore(null);
    const id = await onAdd(nome.trim(), tipo);
    setBusy(false);
    if (!id) {
      setErrore("Impossibile aggiungere l'impresa. Riprova.");
      return;
    }
    setNome("");
    setTipo("appaltatrice");
    setMostraForm(false);
    setAperta(id); // apri subito la scheda della nuova impresa
  }

  async function rimuovi(id: string) {
    setBusy(true);
    await onRemove(id);
    setBusy(false);
    setConferma(null);
    if (aperta === id) setAperta(null);
  }

  // ── Scheda dettaglio di una singola impresa ──────────────────────────────
  if (impresaAperta) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setAperta(null)}
              className="text-xs font-medium text-brand hover:underline"
            >
              ← Torna all&apos;elenco imprese
            </button>
            <h3 className="mt-1 truncate text-sm font-semibold text-gray-900">
              {impresaAperta.ragioneSociale}
            </h3>
            <BadgeTipo tipo={impresaAperta.tipoImpresa} />
          </div>
        </div>

        <div className="space-y-4">
          {domandeOrdinate.map((d) => {
            const e = risposte[impresaAperta.id]?.[d.id] ?? IMP_ENTRY_VUOTA;
            return (
              <DomandaCard
                key={d.id}
                domanda={d}
                valore={e.esito}
                azioneCorrettiva={e.azione}
                osservazioneEvidenza=""
                osservazioni={e.osservazione}
                disabled={disabled}
                mostraOsservazioneEvidenza={false}
                onValore={(v) => {
                  const corrente = risposte[impresaAperta.id]?.[d.id];
                  const patch: Partial<ImpEntry> = { esito: v };
                  // Pre-compila l'azione col default del template per NC/PC,
                  // solo se il campo è ancora vuoto (parità con la checklist).
                  if (
                    (v === "NC" || v === "PC") &&
                    !(corrente?.azione ?? "").trim() &&
                    d.correzione_default?.trim()
                  ) {
                    patch.azione = d.correzione_default;
                  }
                  onChange(impresaAperta.id, d.id, patch);
                }}
                onAzione={(t) => onChange(impresaAperta.id, d.id, { azione: t })}
                onOsservazioneEvidenza={() => {}}
                onMotivazione={(t) => onChange(impresaAperta.id, d.id, { osservazione: t })}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // ── Elenco imprese ───────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Imprese in appalto</h3>
        <span className="text-xs text-gray-500">
          {imprese.length} {imprese.length === 1 ? "impresa" : "imprese"}
        </span>
      </div>

      {imprese.length === 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          Nessuna impresa inserita. Aggiungi almeno un&apos;impresa per completare la
          sezione.
        </p>
      )}

      <ul className="mt-2 space-y-2">
        {imprese.map((imp) => {
          const s = stato(imp.id);
          const completa = s.date === s.totale;
          return (
            <li
              key={imp.id}
              className="rounded-lg border border-gray-200 bg-white p-3 transition hover:border-gray-300"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setAperta(imp.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-gray-900">
                    {imp.ragioneSociale}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <BadgeTipo tipo={imp.tipoImpresa} />
                    {completa ? (
                      <Pill colore="green">Completa</Pill>
                    ) : (
                      <Pill colore="gray">
                        In compilazione — {s.date}/{s.totale}
                      </Pill>
                    )}
                    {s.nc > 0 && <Pill colore="red">{s.nc} NC</Pill>}
                    {s.pc > 0 && <Pill colore="amber">{s.pc} PC</Pill>}
                  </div>
                </button>
                {!disabled &&
                  (conferma === imp.id ? (
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => rimuovi(imp.id)}
                        className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Elimina
                      </button>
                      <button
                        type="button"
                        onClick={() => setConferma(null)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        Annulla
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConferma(imp.id)}
                      className="flex-shrink-0 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-red-200 hover:text-red-600"
                      title="Rimuovi impresa (elimina anche le sue risposte)"
                    >
                      Rimuovi
                    </button>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Aggiunta impresa */}
      {!disabled && (
        <div className="mt-3">
          {mostraForm ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label className="block text-xs font-medium text-gray-700">
                Ragione sociale
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Es. Alfa Impianti Srl"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <label className="mt-2 block text-xs font-medium text-gray-700">
                Tipo impresa
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoImpresa)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {TIPI.map((t) => (
                  <option key={t} value={t}>
                    {ETICHETTE_TIPO_IMPRESA[t]}
                  </option>
                ))}
              </select>
              {errore && <p className="mt-2 text-xs text-red-600">{errore}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={aggiungi}
                  className="min-h-[44px] flex-1 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
                >
                  {busy ? "Aggiunta…" : "Aggiungi"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMostraForm(false);
                    setErrore(null);
                  }}
                  className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMostraForm(true)}
              className="min-h-[48px] w-full rounded-lg border border-dashed border-brand px-4 text-sm font-semibold text-brand transition hover:bg-brand/5"
            >
              + Aggiungi impresa
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BadgeTipo({ tipo }: { tipo: TipoImpresa }) {
  return (
    <span className="inline-block rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
      {ETICHETTE_TIPO_IMPRESA[tipo]}
    </span>
  );
}

function Pill({
  colore,
  children,
}: {
  colore: "green" | "amber" | "red" | "gray";
  children: React.ReactNode;
}) {
  const stili = {
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    gray: "bg-gray-100 text-gray-600",
  } as const;
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
        stili[colore]
      )}
    >
      {children}
    </span>
  );
}
