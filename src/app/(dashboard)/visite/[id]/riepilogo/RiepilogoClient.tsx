"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ConteggiSezione } from "./page";
import { salvaNoteFinaliAction } from "./actions";

interface Totali {
  NC: number;
  PC: number;
  nonRisposto: number;
  campoMancante: number;
  obbligatorieSenzaRisposta: number;
}

interface VerbaleLink {
  id: string;
  numero: string | null;
}

interface Genealogia {
  derivatoDa: VerbaleLink | null;
  sostituisce: VerbaleLink | null;
  sostituitoDa: VerbaleLink | null;
}

interface Props {
  visitaId: string;
  stato: string;
  statoVerbale: "bozza" | "chiuso" | "sostituito" | null;
  numeroVerbale: string | null;
  conteggi: ConteggiSezione[];
  totali: Totali;
  noteIniziali: string;
  genealogia: Genealogia;
}

type Stato = "idle" | "saving" | "saved" | "error";

/** Link a un verbale collegato (genealogia): mostra il numero o "bozza". */
function GenLink({ l }: { l: VerbaleLink }) {
  return (
    <Link
      href={`/visite/${l.id}/riepilogo`}
      className="font-semibold text-[#1e3a5f] hover:underline"
    >
      {l.numero ?? "verbale in bozza"}
    </Link>
  );
}

export default function RiepilogoClient({
  visitaId,
  stato,
  statoVerbale,
  numeroVerbale,
  conteggi,
  totali,
  noteIniziali,
  genealogia,
}: Props) {
  const router = useRouter();
  const [note, setNote] = useState(noteIniziali);
  const [statoNote, setStatoNote] = useState<Stato>("idle");
  const [generando, setGenerando] = useState(false);
  const [erroreGen, setErroreGen] = useState<string | null>(null);
  const [azione, setAzione] = useState<null | "duplica" | "sostitutivo">(null);
  const [erroreAzione, setErroreAzione] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chiusa = stato !== "bozza";
  const isChiuso = statoVerbale === "chiuso";
  const isSostituito = statoVerbale === "sostituito";
  const bloccato =
    totali.obbligatorieSenzaRisposta > 0 || totali.campoMancante > 0;

  /** Esegue Duplica o Crea sostitutivo e naviga al nuovo verbale (bozza). */
  async function eseguiClone(tipo: "duplica" | "sostitutivo") {
    setAzione(tipo);
    setErroreAzione(null);
    try {
      const res = await fetch(`/api/visite/${visitaId}/${tipo}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? "Operazione non riuscita.");
      }
      router.push(`/visite/${body.visita_id}/checklist`);
    } catch (e) {
      setErroreAzione(e instanceof Error ? e.message : "Operazione non riuscita.");
      setAzione(null);
    }
  }

  function handleNote(testo: string) {
    setNote(testo);
    setStatoNote("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await salvaNoteFinaliAction(visitaId, testo);
      setStatoNote(res.ok ? "saved" : "error");
    }, 800);
  }

  async function generaPdf() {
    setGenerando(true);
    setErroreGen(null);
    try {
      const res = await fetch(`/api/visite/${visitaId}/genera-pdf`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? "Errore durante la generazione del verbale.");
      }
      // Stato aggiornato a "chiuso": ricarica i dati server-side.
      router.refresh();
    } catch (e) {
      setErroreGen(
        e instanceof Error ? e.message : "Errore durante la generazione del verbale."
      );
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Avviso sostituito — priorità visiva alta (validità del verbale) */}
      {isSostituito && genealogia.sostituitoDa && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Verbale sostituito — non più valido</p>
          <p className="mt-0.5">
            Questo verbale è stato sostituito da{" "}
            <Link
              href={`/visite/${genealogia.sostituitoDa.id}/riepilogo`}
              className="font-semibold underline"
            >
              {genealogia.sostituitoDa.numero ?? "verbale in bozza"}
            </Link>
            . Resta consultabile e scaricabile in sola lettura.
          </p>
        </div>
      )}

      {/* Genealogia (provenienza) — solo quando esiste */}
      {(genealogia.derivatoDa || genealogia.sostituisce) && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Genealogia
          </p>
          <ul className="mt-1 space-y-0.5">
            {genealogia.derivatoDa && (
              <li>
                Duplicato da <GenLink l={genealogia.derivatoDa} />
              </li>
            )}
            {genealogia.sostituisce && (
              <li>
                Sostituisce <GenLink l={genealogia.sostituisce} />
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Conteggi per sezione — card stack su mobile */}
      <div className="space-y-3 sm:hidden">
        {conteggi.map((c) => {
          const haNC = c.NC > 0;
          const haMancanti =
            c.obbligatorieSenzaRisposta > 0 || c.campoMancante > 0;
          return (
            <div
              key={c.id}
              className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">
                  {c.id}
                  <span className="ml-1 font-normal text-gray-500">{c.nome}</span>
                </p>
                {haMancanti ? (
                  <Badge colore="red">Incompleta</Badge>
                ) : haNC ? (
                  <Badge colore="amber">NC</Badge>
                ) : (
                  <Badge colore="green">OK</Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                <span>C: {c.C}</span>
                <span className="text-amber-600">PC: {c.PC}</span>
                <span className="text-red-600">NC: {c.NC}</span>
                <span>NV: {c.NV}</span>
                <span>NA: {c.NA}</span>
                <span className="text-gray-400">n.r.: {c.nonRisposto}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Conteggi per sezione — tabella su desktop */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white sm:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Sezione</th>
              <th className="px-2 py-2 text-center font-medium">C</th>
              <th className="px-2 py-2 text-center font-medium">PC</th>
              <th className="px-2 py-2 text-center font-medium">NC</th>
              <th className="px-2 py-2 text-center font-medium">NV</th>
              <th className="px-2 py-2 text-center font-medium">NA</th>
              <th className="px-2 py-2 text-center font-medium">—</th>
              <th className="px-3 py-2 text-center font-medium">Stato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {conteggi.map((c) => {
              const haNC = c.NC > 0;
              const haMancanti =
            c.obbligatorieSenzaRisposta > 0 || c.campoMancante > 0;
              return (
                <tr key={c.id}>
                  <td className="px-4 py-2">
                    <span className="font-medium text-gray-900">{c.id}</span>
                    <span className="ml-2 text-gray-500">{c.nome}</span>
                  </td>
                  <td className="px-2 py-2 text-center text-gray-700">{c.C}</td>
                  <td className="px-2 py-2 text-center text-amber-600">{c.PC}</td>
                  <td className="px-2 py-2 text-center text-red-600">{c.NC}</td>
                  <td className="px-2 py-2 text-center text-gray-700">{c.NV}</td>
                  <td className="px-2 py-2 text-center text-gray-700">{c.NA}</td>
                  <td className="px-2 py-2 text-center text-gray-500">
                    {c.nonRisposto}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {haMancanti ? (
                      <Badge colore="red">Incompleta</Badge>
                    ) : haNC ? (
                      <Badge colore="amber">NC presenti</Badge>
                    ) : (
                      <Badge colore="green">OK</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totali */}
      <div className="grid grid-cols-3 gap-3">
        <Totale etichetta="NC totali" valore={totali.NC} colore="red" />
        <Totale etichetta="PC totali" valore={totali.PC} colore="amber" />
        <Totale
          etichetta="Non risposte"
          valore={totali.nonRisposto}
          colore="gray"
        />
      </div>

      {/* Note finali (sola lettura se chiusa) */}
      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Note finali visita
          </label>
          {!chiusa && (
            <span className="text-xs text-gray-400">
              {statoNote === "saving"
                ? "Salvataggio…"
                : statoNote === "saved"
                  ? "Salvato"
                  : statoNote === "error"
                    ? "Errore di salvataggio"
                    : ""}
            </span>
          )}
        </div>
        <textarea
          value={note}
          onChange={(e) => handleNote(e.target.value)}
          rows={4}
          disabled={chiusa}
          placeholder="Osservazioni conclusive, raccomandazioni, accordi sui tempi…"
          className="mt-1 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] disabled:bg-gray-50 disabled:text-gray-500"
        />
      </div>

      {/* Verbale chiuso */}
      {chiusa && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Verbale generato e chiuso
          {numeroVerbale ? (
            <>
              {" "}
              — <span className="font-semibold">{numeroVerbale}</span>
            </>
          ) : null}
          . Il PDF è immutabile.
        </div>
      )}

      {/* Blocco chiusura */}
      {!chiusa && totali.obbligatorieSenzaRisposta > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {totali.obbligatorieSenzaRisposta} domand
          {totali.obbligatorieSenzaRisposta === 1 ? "a" : "e"} obbligator
          {totali.obbligatorieSenzaRisposta === 1 ? "ia" : "ie"} senza risposta —
          impossibile chiudere.
        </div>
      )}

      {!chiusa && totali.campoMancante > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {totali.campoMancante} domand
          {totali.campoMancante === 1 ? "a" : "e"} con campo obbligatorio non
          compilato (azione correttiva o motivazione) — impossibile chiudere.
        </div>
      )}

      {erroreGen && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erroreGen}
        </div>
      )}

      {/* Azioni verbale chiuso: Duplica / Crea sostitutivo */}
      {isChiuso && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">Azioni sul verbale</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={azione !== null}
              onClick={() => eseguiClone("duplica")}
              className="min-h-[44px] flex-1 rounded-lg border border-[#1e3a5f] px-4 text-sm font-semibold text-[#1e3a5f] transition hover:bg-[#1e3a5f] hover:text-white disabled:opacity-40"
            >
              {azione === "duplica" ? "Duplicazione…" : "Duplica"}
            </button>
            <button
              type="button"
              disabled={azione !== null || Boolean(genealogia.sostituitoDa)}
              onClick={() => eseguiClone("sostitutivo")}
              title={
                genealogia.sostituitoDa
                  ? `Già sostituito da ${genealogia.sostituitoDa.numero ?? "un altro verbale"}`
                  : undefined
              }
              className="min-h-[44px] flex-1 rounded-lg border border-amber-500 px-4 text-sm font-semibold text-amber-700 transition hover:bg-amber-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {azione === "sostitutivo" ? "Creazione…" : "Crea sostitutivo"}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Duplica crea una copia indipendente. Crea sostitutivo annulla questo
            verbale sostituendolo con uno nuovo (un solo sostitutivo per verbale).
          </p>
          {erroreAzione && (
            <p className="mt-2 text-sm text-red-700">{erroreAzione}</p>
          )}
        </div>
      )}

      {/* Azioni */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/visite/${visitaId}/checklist`}
          className="flex min-h-[48px] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          {chiusa ? "Apri checklist (sola lettura)" : "Torna alla checklist"}
        </Link>

        {chiusa ? (
          <a
            href={`/api/visite/${visitaId}/download-pdf`}
            className="flex min-h-[48px] items-center justify-center rounded-lg bg-[#1e3a5f] px-5 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Scarica PDF
          </a>
        ) : (
          <button
            type="button"
            disabled={bloccato || generando}
            onClick={generaPdf}
            className="min-h-[48px] rounded-lg bg-[#1e3a5f] px-5 text-sm font-semibold text-white transition hover:bg-[#16304e] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generando ? "Generazione verbale in corso…" : "Genera verbale PDF"}
          </button>
        )}
      </div>
    </div>
  );
}

function Badge({
  colore,
  children,
}: {
  colore: "red" | "amber" | "green";
  children: React.ReactNode;
}) {
  const stili = {
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    green: "bg-green-100 text-green-700",
  } as const;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${stili[colore]}`}
    >
      {children}
    </span>
  );
}

function Totale({
  etichetta,
  valore,
  colore,
}: {
  etichetta: string;
  valore: number;
  colore: "red" | "amber" | "gray";
}) {
  const stili = {
    red: "text-red-600",
    amber: "text-amber-600",
    gray: "text-gray-700",
  } as const;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-center">
      <div className={`text-2xl font-bold ${stili[colore]}`}>{valore}</div>
      <div className="text-xs text-gray-500">{etichetta}</div>
    </div>
  );
}
