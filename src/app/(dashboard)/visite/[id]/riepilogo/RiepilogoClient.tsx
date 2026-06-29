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
  obbligatorieSenzaRisposta: number;
}

interface Props {
  visitaId: string;
  stato: string;
  numeroVerbale: string | null;
  conteggi: ConteggiSezione[];
  totali: Totali;
  noteIniziali: string;
}

type Stato = "idle" | "saving" | "saved" | "error";

export default function RiepilogoClient({
  visitaId,
  stato,
  numeroVerbale,
  conteggi,
  totali,
  noteIniziali,
}: Props) {
  const router = useRouter();
  const [note, setNote] = useState(noteIniziali);
  const [statoNote, setStatoNote] = useState<Stato>("idle");
  const [generando, setGenerando] = useState(false);
  const [erroreGen, setErroreGen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chiusa = stato !== "bozza";
  const bloccato = totali.obbligatorieSenzaRisposta > 0;

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
      {/* Conteggi per sezione */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
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
              const haMancanti = c.obbligatorieSenzaRisposta > 0;
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
      {!chiusa && bloccato && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {totali.obbligatorieSenzaRisposta} domand
          {totali.obbligatorieSenzaRisposta === 1 ? "a" : "e"} obbligator
          {totali.obbligatorieSenzaRisposta === 1 ? "ia" : "ie"} senza risposta —
          impossibile chiudere.
        </div>
      )}

      {erroreGen && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erroreGen}
        </div>
      )}

      {/* Azioni */}
      <div className="flex items-center justify-between">
        <Link
          href={`/visite/${visitaId}/checklist`}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          {chiusa ? "Apri checklist (sola lettura)" : "Torna alla checklist"}
        </Link>

        {chiusa ? (
          <a
            href={`/api/visite/${visitaId}/download-pdf`}
            className="rounded-md bg-[#1e3a5f] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Scarica PDF
          </a>
        ) : (
          <button
            type="button"
            disabled={bloccato || generando}
            onClick={generaPdf}
            className="rounded-md bg-[#1e3a5f] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#16304e] disabled:cursor-not-allowed disabled:opacity-40"
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
