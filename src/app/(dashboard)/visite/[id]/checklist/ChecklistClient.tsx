"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn, formatDate } from "@/lib/utils";
import type { EsitoRisposta, TemplateSnapshot } from "@/types";
import type { RispostaSalvata } from "@/lib/db/queries/risposte";
import { salvaRispostaAction } from "./actions";
import DomandaCard from "./DomandaCard";

interface Entry {
  valore: EsitoRisposta | null;
  azione: string;
  sezioneId: string;
}

type Stato = "idle" | "saving" | "saved" | "error";

interface Props {
  visitaId: string;
  clienteNome: string;
  sedeNome: string;
  dataVisita: string;
  stato: string;
  template: TemplateSnapshot;
  risposteIniziali: RispostaSalvata[];
}

const DEBOUNCE_MS = 800;

export default function ChecklistClient({
  visitaId,
  clienteNome,
  sedeNome,
  dataVisita,
  template,
  risposteIniziali,
}: Props) {
  const sezioni = [...template.sezioni].sort((a, b) => a.ordine - b.ordine);

  // Stato risposte indicizzato per domanda_id (inizializzato da template + DB).
  const [risposte, setRisposte] = useState<Record<string, Entry>>(() => {
    const map: Record<string, Entry> = {};
    for (const sez of sezioni) {
      for (const d of sez.domande) {
        map[d.id] = { valore: null, azione: "", sezioneId: sez.id };
      }
    }
    for (const r of risposteIniziali) {
      map[r.domanda_id] = {
        valore: r.valore,
        azione: r.azione_correttiva ?? "",
        sezioneId: r.sezione_id,
      };
    }
    return map;
  });

  const [sezioneCorrente, setSezioneCorrente] = useState(0);
  const [salvataggio, setSalvataggio] = useState<Stato>("idle");
  const [erroreMsg, setErroreMsg] = useState<string | null>(null);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Pulizia timer pendenti allo smontaggio.
  useEffect(() => {
    const t = timers.current;
    return () => {
      Object.values(t).forEach(clearTimeout);
    };
  }, []);

  function scheduleSave(domandaId: string, entry: Entry) {
    if (timers.current[domandaId]) {
      clearTimeout(timers.current[domandaId]);
    }
    setSalvataggio("saving");
    setErroreMsg(null);
    timers.current[domandaId] = setTimeout(() => {
      void performSave(domandaId, entry);
    }, DEBOUNCE_MS);
  }

  async function performSave(domandaId: string, entry: Entry) {
    const res = await salvaRispostaAction({
      visitaId,
      domandaId,
      sezioneId: entry.sezioneId,
      valore: entry.valore,
      azioneCorrettiva: entry.azione.trim() ? entry.azione : null,
    });
    if (res.ok) {
      setSalvataggio("saved");
    } else {
      setSalvataggio("error");
      setErroreMsg(res.error);
    }
  }

  function handleValore(domandaId: string, sezioneId: string, v: EsitoRisposta) {
    const azione = risposte[domandaId]?.azione ?? "";
    const entry: Entry = { valore: v, azione, sezioneId };
    setRisposte((prev) => ({ ...prev, [domandaId]: entry }));
    scheduleSave(domandaId, entry);
  }

  function handleAzione(domandaId: string, sezioneId: string, testo: string) {
    const valore = risposte[domandaId]?.valore ?? null;
    const entry: Entry = { valore, azione: testo, sezioneId };
    setRisposte((prev) => ({ ...prev, [domandaId]: entry }));
    scheduleSave(domandaId, entry);
  }

  const sezione = sezioni[sezioneCorrente];
  const isUltima = sezioneCorrente === sezioni.length - 1;

  function progresso(sezioneId: string) {
    const domande = sezioni.find((s) => s.id === sezioneId)?.domande ?? [];
    const date = domande.filter((d) => risposte[d.id]?.valore != null).length;
    return { date, totale: domande.length };
  }

  function vaiASezione(i: number) {
    setSezioneCorrente(i);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col">
      {/* Header fisso */}
      <header className="sticky top-0 z-10 -mx-8 mb-4 border-b border-gray-200 bg-gray-100/95 px-8 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{clienteNome}</h1>
            <p className="text-sm text-gray-600">
              {sedeNome} · {formatDate(dataVisita)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
              Bozza
            </span>
            <IndicatoreSalvataggio stato={salvataggio} errore={erroreMsg} />
          </div>
        </div>

        {/* Navigazione sezioni */}
        <nav className="mt-3 flex flex-wrap gap-1.5">
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
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
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
      <div className="flex-1">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-gray-900">
            {sezione.nome}
          </h2>
          {sezione.descrizione && (
            <p className="text-sm text-gray-500">{sezione.descrizione}</p>
          )}
        </div>

        <div className="space-y-3">
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
                  onValore={(v) => handleValore(d.id, sezione.id, v)}
                  onAzione={(t) => handleAzione(d.id, sezione.id, t)}
                />
              );
            })}
        </div>
      </div>

      {/* Footer fisso */}
      <footer className="sticky bottom-0 z-10 -mx-8 mt-6 flex items-center justify-between border-t border-gray-200 bg-gray-100/95 px-8 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => vaiASezione(Math.max(0, sezioneCorrente - 1))}
          disabled={sezioneCorrente === 0}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition enabled:hover:bg-gray-50 disabled:opacity-40"
        >
          Indietro
        </button>

        {isUltima ? (
          <Link
            href={`/visite/${visitaId}/riepilogo`}
            className="rounded-md bg-[#1e3a5f] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Vai al riepilogo
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => vaiASezione(sezioneCorrente + 1)}
            className="rounded-md bg-[#1e3a5f] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Avanti
          </button>
        )}
      </footer>
    </div>
  );
}

function IndicatoreSalvataggio({
  stato,
  errore,
}: {
  stato: Stato;
  errore: string | null;
}) {
  if (stato === "saving") {
    return <span className="text-xs text-gray-500">Salvataggio…</span>;
  }
  if (stato === "saved") {
    return <span className="text-xs text-green-600">Salvato</span>;
  }
  if (stato === "error") {
    return (
      <span className="text-xs text-red-600" title={errore ?? undefined}>
        Errore di salvataggio
      </span>
    );
  }
  return <span className="text-xs text-transparent">·</span>;
}
