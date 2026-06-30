"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn, formatDate } from "@/lib/utils";
import type { EsitoRisposta, Nominativi, TemplateSnapshot } from "@/types";
import { SEZIONE_NOMINATIVI } from "@/types";
import type { RispostaSalvata } from "@/lib/db/queries/risposte";
import { rispostaCompleta } from "@/lib/checklist/completa";
import { salvaRispostaAction, salvaNominativiAction } from "./actions";
import DomandaCard from "./DomandaCard";
import NominativiSEZ01 from "./NominativiSEZ01";

interface Entry {
  valore: EsitoRisposta | null;
  azione: string;
  osservazioni: string;
  sezioneId: string;
}

type Stato = "idle" | "saving" | "saved" | "error";

interface Props {
  visitaId: string;
  clienteNome: string;
  sedeNome: string;
  sedeIndirizzo: string;
  sedeCitta: string;
  dataVisita: string;
  oraInizio: string | null;
  specialistNome: string;
  qualifica: string | null;
  referenteCliente: string | null;
  stato: string;
  numeroVerbale: string | null;
  template: TemplateSnapshot;
  risposteIniziali: RispostaSalvata[];
  nominativiIniziali: Nominativi;
}

const DEBOUNCE_MS = 800;
const KEY_NOMINATIVI = "__nominativi__";

export default function ChecklistClient({
  visitaId,
  clienteNome,
  sedeNome,
  sedeIndirizzo,
  sedeCitta,
  dataVisita,
  oraInizio,
  specialistNome,
  qualifica,
  referenteCliente,
  stato,
  numeroVerbale,
  template,
  risposteIniziali,
  nominativiIniziali,
}: Props) {
  const sezioni = [...template.sezioni].sort((a, b) => a.ordine - b.ordine);
  const chiusa = stato !== "bozza";

  const [risposte, setRisposte] = useState<Record<string, Entry>>(() => {
    const map: Record<string, Entry> = {};
    for (const sez of sezioni) {
      for (const d of sez.domande) {
        map[d.id] = { valore: null, azione: "", osservazioni: "", sezioneId: sez.id };
      }
    }
    for (const r of risposteIniziali) {
      if (!map[r.domanda_id]) continue; // ignora la riga sintetica nominativi
      map[r.domanda_id] = {
        valore: r.valore,
        azione: r.azione_correttiva ?? "",
        osservazioni: r.osservazioni ?? "",
        sezioneId: r.sezione_id,
      };
    }
    return map;
  });

  const [nominativi, setNominativi] = useState<Nominativi>(nominativiIniziali);
  const [sezioneCorrente, setSezioneCorrente] = useState(0);
  const [salvataggio, setSalvataggio] = useState<Stato>("idle");
  const [erroreMsg, setErroreMsg] = useState<string | null>(null);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  function pianifica(key: string, fn: () => Promise<void>) {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    setSalvataggio("saving");
    setErroreMsg(null);
    timers.current[key] = setTimeout(() => void fn(), DEBOUNCE_MS);
  }

  async function performSave(domandaId: string, entry: Entry) {
    const res = await salvaRispostaAction({
      visitaId,
      domandaId,
      sezioneId: entry.sezioneId,
      valore: entry.valore,
      azioneCorrettiva: entry.azione.trim() ? entry.azione : null,
      osservazioni: entry.osservazioni.trim() ? entry.osservazioni : null,
    });
    setSalvataggio(res.ok ? "saved" : "error");
    if (!res.ok) setErroreMsg(res.error);
  }

  function aggiorna(domandaId: string, sezioneId: string, patch: Partial<Entry>) {
    const corrente = risposte[domandaId] ?? {
      valore: null,
      azione: "",
      osservazioni: "",
      sezioneId,
    };
    const entry: Entry = { ...corrente, ...patch, sezioneId };
    setRisposte((prev) => ({ ...prev, [domandaId]: entry }));
    pianifica(domandaId, () => performSave(domandaId, entry));
  }

  function handleNominativi(next: Nominativi) {
    setNominativi(next);
    pianifica(KEY_NOMINATIVI, async () => {
      const res = await salvaNominativiAction(visitaId, next);
      setSalvataggio(res.ok ? "saved" : "error");
      if (!res.ok) setErroreMsg(res.error);
    });
  }

  const sezione = sezioni[sezioneCorrente];
  const isUltima = sezioneCorrente === sezioni.length - 1;
  const isSezNominativi = sezione.id === SEZIONE_NOMINATIVI;

  function progresso(sezioneId: string) {
    const domande = sezioni.find((s) => s.id === sezioneId)?.domande ?? [];
    // Una domanda conta come "data" solo se completa (esito + eventuale
    // campo testo obbligatorio: azione correttiva per NC/PC, motivazione per NV/NA).
    const date = domande.filter((d) => {
      const e = risposte[d.id];
      return rispostaCompleta(e?.valore ?? null, e?.azione, e?.osservazioni);
    }).length;
    return { date, totale: domande.length };
  }

  function vaiASezione(i: number) {
    setSezioneCorrente(i);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col">
      {/* Intestazione persistente */}
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-gray-900 sm:text-lg">
              {clienteNome}
            </h1>
            <p className="truncate text-xs text-gray-600 sm:text-sm">
              {sedeNome}
              {sedeIndirizzo ? ` · ${sedeIndirizzo}` : ""}
              {sedeCitta ? `, ${sedeCitta}` : ""}
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {formatDate(dataVisita)}
              {oraInizio ? ` · ${oraInizio.slice(0, 5)}` : ""}
              {" · "}
              {specialistNome}
              {qualifica ? ` (${qualifica})` : ""}
              {referenteCliente ? ` · Ref. ${referenteCliente}` : ""}
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1">
            <StatoBadge chiusa={chiusa} numero={numeroVerbale} />
            <IndicatoreSalvataggio stato={salvataggio} errore={erroreMsg} chiusa={chiusa} />
          </div>
        </div>

        {/* Navigazione sezioni — scroll orizzontale su mobile */}
        <nav className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {sezioni.map((s, i) => {
            const { date, totale } = progresso(s.id);
            const completa = totale > 0 && date === totale;
            const attiva = i === sezioneCorrente;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => vaiASezione(i)}
                className={cn(
                  "flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  attiva
                    ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                    : completa
                      ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                      : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                )}
              >
                {s.id}{" "}
                <span className={cn(attiva ? "text-white/80" : "text-gray-400")}>
                  {date}/{totale}
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Area domande */}
      <div className="flex-1 px-1">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-gray-900">
            {sezione.id} — {sezione.nome}
          </h2>
          {sezione.descrizione && (
            <p className="text-sm text-gray-500">{sezione.descrizione}</p>
          )}
        </div>

        <div className="space-y-4">
          {/* Nominativi figure sicurezza in cima a SEZ-01 */}
          {isSezNominativi && (
            <NominativiSEZ01
              nominativi={nominativi}
              disabled={chiusa}
              onChange={handleNominativi}
            />
          )}

          {[...sezione.domande]
            .sort((a, b) => a.ordine - b.ordine)
            .map((d) => {
              const entry = risposte[d.id];
              return (
                <DomandaCard
                  key={d.id}
                  domanda={d}
                  valore={entry?.valore ?? null}
                  azioneCorrettiva={entry?.azione ?? ""}
                  osservazioni={entry?.osservazioni ?? ""}
                  disabled={chiusa}
                  onValore={(v) => {
                    const corrente = risposte[d.id];
                    const patch: Partial<Entry> = { valore: v };
                    // NC/PC: pre-compila l'azione correttiva col default del
                    // template, solo se il campo è ancora vuoto (non sovrascrive
                    // quanto già scritto dal tecnico). Resta editabile e obbligatorio.
                    if (
                      (v === "NC" || v === "PC") &&
                      !(corrente?.azione ?? "").trim() &&
                      d.correzione_default?.trim()
                    ) {
                      patch.azione = d.correzione_default;
                    }
                    aggiorna(d.id, sezione.id, patch);
                  }}
                  onAzione={(t) => aggiorna(d.id, sezione.id, { azione: t })}
                  onMotivazione={(t) => aggiorna(d.id, sezione.id, { osservazioni: t })}
                />
              );
            })}
        </div>
      </div>

      {/* Footer fisso */}
      <footer className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <button
          type="button"
          onClick={() => vaiASezione(Math.max(0, sezioneCorrente - 1))}
          disabled={sezioneCorrente === 0}
          className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition enabled:hover:bg-gray-50 disabled:opacity-40"
        >
          Indietro
        </button>

        {isUltima ? (
          <Link
            href={`/visite/${visitaId}/riepilogo`}
            className="flex min-h-[44px] items-center rounded-lg bg-[#1e3a5f] px-5 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Vai al riepilogo
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => vaiASezione(sezioneCorrente + 1)}
            className="min-h-[44px] rounded-lg bg-[#1e3a5f] px-5 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Avanti
          </button>
        )}
      </footer>
    </div>
  );
}

function StatoBadge({ chiusa, numero }: { chiusa: boolean; numero: string | null }) {
  if (chiusa) {
    return (
      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-green-700">
        {numero ?? "Chiuso"}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
      Bozza
    </span>
  );
}

function IndicatoreSalvataggio({
  stato,
  errore,
  chiusa,
}: {
  stato: Stato;
  errore: string | null;
  chiusa: boolean;
}) {
  if (chiusa) {
    return <span className="text-xs text-gray-400">Sola lettura</span>;
  }
  if (stato === "saving") return <span className="text-xs text-gray-500">Salvataggio…</span>;
  if (stato === "saved") return <span className="text-xs text-green-600">Salvato</span>;
  if (stato === "error") {
    return (
      <span className="text-xs text-red-600" title={errore ?? undefined}>
        Errore di salvataggio
      </span>
    );
  }
  return <span className="text-xs text-transparent">·</span>;
}
