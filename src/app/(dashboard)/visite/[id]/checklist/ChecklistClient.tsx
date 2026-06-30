"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn, formatDate } from "@/lib/utils";
import type {
  EsitoRisposta,
  ImpresaAppalto,
  Nominativi,
  RispostaImpresaAppalto,
  TemplateSnapshot,
  TipoImpresa,
} from "@/types";
import { SEZIONE_NOMINATIVI } from "@/types";
import type { RispostaSalvata } from "@/lib/db/queries/risposte";
import {
  rispostaCompleta,
  sezioneCollassata,
  domandaAttiva,
  completezzaImpreseSezioneOtto,
} from "@/lib/checklist/completa";
import {
  salvaRispostaAction,
  salvaNominativiAction,
  creaImpresaAction,
  eliminaImpresaAction,
  salvaRispostaImpresaAction,
} from "./actions";
import DomandaCard from "./DomandaCard";
import NominativiSEZ01 from "./NominativiSEZ01";
import SezioneAppaltiImprese, {
  type ImpEntry,
  IMP_ENTRY_VUOTA,
} from "./SezioneAppaltiImprese";

interface Entry {
  valore: EsitoRisposta | null;
  azione: string;
  osservazioneEvidenza: string;
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
  impreseIniziali: ImpresaAppalto[];
  risposteImpreseIniziali: RispostaImpresaAppalto[];
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
  impreseIniziali,
  risposteImpreseIniziali,
}: Props) {
  const sezioni = [...template.sezioni].sort((a, b) => a.ordine - b.ordine);
  const chiusa = stato !== "bozza";

  const [risposte, setRisposte] = useState<Record<string, Entry>>(() => {
    const map: Record<string, Entry> = {};
    for (const sez of sezioni) {
      for (const d of sez.domande) {
        map[d.id] = {
          valore: null,
          azione: "",
          osservazioneEvidenza: "",
          osservazioni: "",
          sezioneId: sez.id,
        };
      }
    }
    for (const r of risposteIniziali) {
      if (!map[r.domanda_id]) continue; // ignora la riga sintetica nominativi
      map[r.domanda_id] = {
        valore: r.valore,
        azione: r.azione_correttiva ?? "",
        osservazioneEvidenza: r.osservazione_evidenza ?? "",
        osservazioni: r.osservazioni ?? "",
        sezioneId: r.sezione_id,
      };
    }
    return map;
  });

  const [nominativi, setNominativi] = useState<Nominativi>(nominativiIniziali);

  // SEZ-08 multi-impresa (Sprint 9.1): elenco imprese + risposte per impresa.
  const [imprese, setImprese] = useState<ImpresaAppalto[]>(impreseIniziali);
  const [risposteImprese, setRisposteImprese] = useState<
    Record<string, Record<string, ImpEntry>>
  >(() => {
    const map: Record<string, Record<string, ImpEntry>> = {};
    for (const r of risposteImpreseIniziali) {
      (map[r.impresaId] ??= {})[r.domandaId] = {
        esito: r.esito,
        azione: r.azioneCorrettiva ?? "",
        osservazione: r.osservazione ?? "",
      };
    }
    return map;
  });

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
      osservazioneEvidenza: entry.osservazioneEvidenza.trim()
        ? entry.osservazioneEvidenza
        : null,
      osservazioni: entry.osservazioni.trim() ? entry.osservazioni : null,
    });
    setSalvataggio(res.ok ? "saved" : "error");
    if (!res.ok) setErroreMsg(res.error);
  }

  function aggiorna(domandaId: string, sezioneId: string, patch: Partial<Entry>) {
    const corrente = risposte[domandaId] ?? {
      valore: null,
      azione: "",
      osservazioneEvidenza: "",
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

  // ── SEZ-08 multi-impresa: CRUD imprese + autosave risposte ───────────────
  async function handleAddImpresa(
    ragioneSociale: string,
    tipo: TipoImpresa
  ): Promise<string | null> {
    const res = await creaImpresaAction(visitaId, ragioneSociale, tipo);
    if (!res.ok) {
      setSalvataggio("error");
      setErroreMsg(res.error);
      return null;
    }
    setImprese((prev) => [...prev, res.impresa]);
    return res.impresa.id;
  }

  async function handleRemoveImpresa(impresaId: string): Promise<void> {
    const res = await eliminaImpresaAction(impresaId);
    if (!res.ok) {
      setSalvataggio("error");
      setErroreMsg(res.error);
      return;
    }
    setImprese((prev) => prev.filter((i) => i.id !== impresaId));
    setRisposteImprese((prev) => {
      const next = { ...prev };
      delete next[impresaId];
      return next;
    });
  }

  function handleChangeRispostaImpresa(
    impresaId: string,
    domandaId: string,
    patch: Partial<ImpEntry>
  ) {
    const corrente = risposteImprese[impresaId]?.[domandaId] ?? IMP_ENTRY_VUOTA;
    const entry: ImpEntry = { ...corrente, ...patch };
    setRisposteImprese((prev) => ({
      ...prev,
      [impresaId]: { ...(prev[impresaId] ?? {}), [domandaId]: entry },
    }));
    // Si salva solo quando c'è un esito (colonna NOT NULL lato DB).
    if (!entry.esito) return;
    pianifica(`imp:${impresaId}:${domandaId}`, async () => {
      const res = await salvaRispostaImpresaAction({
        impresaId,
        domandaId,
        esito: entry.esito as EsitoRisposta,
        osservazione: entry.osservazione.trim() ? entry.osservazione : null,
        azioneCorrettiva: entry.azione.trim() ? entry.azione : null,
      });
      setSalvataggio(res.ok ? "saved" : "error");
      if (!res.ok) setErroreMsg(res.error);
    });
  }

  /** Id delle domande ripetute per impresa (tutte tranne la filtro). */
  function domandeImpresa(sez: {
    domanda_filtro?: string;
    domande: { id: string }[];
  }): string[] {
    return sez.domande.map((d) => d.id).filter((id) => id !== sez.domanda_filtro);
  }

  const sezione = sezioni[sezioneCorrente];
  const isUltima = sezioneCorrente === sezioni.length - 1;
  const isSezNominativi = sezione.id === SEZIONE_NOMINATIVI;
  // SEZ-08 multi-impresa: la sezione, se espansa, mostra l'elenco imprese al
  // posto delle domande D-08-002..009 (gestite per impresa).
  const isMultiImpresa = Boolean(sezione.multi_impresa);
  const sezioneEspansaMulti =
    isMultiImpresa && !sezioneCollassata(sezione, valoreFiltro(sezione));

  /** Valore corrente della domanda filtro di una sezione (null se nessuna filtro). */
  function valoreFiltro(sez: { domanda_filtro?: string }): EsitoRisposta | null {
    if (!sez.domanda_filtro) return null;
    return risposte[sez.domanda_filtro]?.valore ?? null;
  }

  function progresso(sezioneId: string) {
    const sez = sezioni.find((s) => s.id === sezioneId);
    const domande = sez?.domande ?? [];
    // Sezione condizionale collassata (filtro = NA): conta solo la domanda
    // filtro; le altre non sono richieste.
    if (sez && sezioneCollassata(sez, valoreFiltro(sez))) {
      const f = risposte[sez.domanda_filtro!];
      const data = rispostaCompleta(f?.valore ?? null, f?.azione, f?.osservazioni);
      return { date: data ? 1 : 0, totale: 1, collassata: true, completa: data };
    }
    // SEZ-08 multi-impresa espansa: progresso = filtro + (8 domande × N imprese).
    // Il denominatore usa almeno 1 impresa, così con 0 imprese non risulta mai
    // completa e la pill segnala che manca lavoro.
    if (sez?.multi_impresa) {
      const f = risposte[sez.domanda_filtro!];
      const filtroOk = rispostaCompleta(f?.valore ?? null, f?.azione, f?.osservazioni);
      const dids = domandeImpresa(sez);
      const getR = (impId: string, did: string) => {
        const e = risposteImprese[impId]?.[did];
        return e
          ? { esito: e.esito, azioneCorrettiva: e.azione, osservazione: e.osservazione }
          : null;
      };
      // Una domanda-impresa conta come "data" solo se completa (esito + testo
      // obbligatorio: azione per NC/PC, motivazione per NV/NA).
      let risposteDate = 0;
      for (const imp of imprese)
        for (const did of dids) {
          const r = getR(imp.id, did);
          if (rispostaCompleta(r?.esito ?? null, r?.azioneCorrettiva, r?.osservazione))
            risposteDate += 1;
        }
      const { completa: impreseComplete } = completezzaImpreseSezioneOtto(
        dids,
        imprese.map((i) => i.id),
        getR
      );
      const totale = 1 + dids.length * Math.max(imprese.length, 1);
      const date = (filtroOk ? 1 : 0) + risposteDate;
      return { date, totale, collassata: false, completa: filtroOk && impreseComplete };
    }
    // Una domanda conta come "data" solo se completa (esito + eventuale
    // campo testo obbligatorio: azione correttiva per NC/PC, motivazione per NV/NA).
    const date = domande.filter((d) => {
      const e = risposte[d.id];
      return rispostaCompleta(e?.valore ?? null, e?.azione, e?.osservazioni);
    }).length;
    return {
      date,
      totale: domande.length,
      collassata: false,
      completa: domande.length > 0 && date === domande.length,
    };
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
            const { date, totale, collassata, completa } = progresso(s.id);
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
                    : collassata
                      ? "border-gray-300 bg-gray-100 text-gray-500 hover:bg-gray-200"
                      : completa
                        ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                        : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                )}
                // Sezione condizionale saltata correttamente (filtro = NA): non è un errore.
                title={collassata ? "Sezione non applicabile (nessun caso): solo la domanda filtro è richiesta." : undefined}
              >
                {s.id}{" "}
                <span className={cn(attiva ? "text-white/80" : "text-gray-400")}>
                  {collassata ? "N/A" : `${date}/${totale}`}
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
            // Logica condizionale di sezione: se la sezione è collassata
            // (filtro = NA) mostra solo la domanda filtro. Reattivo lato client.
            .filter((d) => domandaAttiva(sezione, d.id, valoreFiltro(sezione)))
            // Multi-impresa: le domande successive alla filtro sono gestite
            // per impresa nel componente dedicato, non come card di sezione.
            .filter((d) => !isMultiImpresa || d.id === sezione.domanda_filtro)
            .map((d) => {
              const entry = risposte[d.id];
              return (
                <DomandaCard
                  key={d.id}
                  domanda={d}
                  valore={entry?.valore ?? null}
                  azioneCorrettiva={entry?.azione ?? ""}
                  osservazioneEvidenza={entry?.osservazioneEvidenza ?? ""}
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
                  onOsservazioneEvidenza={(t) =>
                    aggiorna(d.id, sezione.id, { osservazioneEvidenza: t })
                  }
                  onMotivazione={(t) => aggiorna(d.id, sezione.id, { osservazioni: t })}
                />
              );
            })}

          {/* SEZ-08 multi-impresa: elenco imprese + schede risposte per impresa.
              Renderizzato solo a sezione espansa (filtro ≠ NA). */}
          {sezioneEspansaMulti && (
            <SezioneAppaltiImprese
              domande={sezione.domande
                .filter((d) => d.id !== sezione.domanda_filtro)
                // Nel modello multi-impresa l'impresa è già identificata dalla
                // sua anagrafica: il campo_extra "elenco imprese" (legacy D-08-003)
                // non va mostrato come testo libero per ogni impresa.
                .map((d) => ({ ...d, campo_extra: undefined }))}
              imprese={imprese}
              risposte={risposteImprese}
              disabled={chiusa}
              onAdd={handleAddImpresa}
              onRemove={handleRemoveImpresa}
              onChange={handleChangeRispostaImpresa}
            />
          )}
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
