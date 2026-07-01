"use client";

import { cn, formatDateShort } from "@/lib/utils";
import type { DomandaTemplate, Lavoratore, LivelloRischio } from "@/types";
import { calcolaEsitoAuto } from "@/lib/scadenze/autocalcolo";

interface Props {
  domanda: DomandaTemplate; // nodo D-03-001 (periodicita_mesi, soglia_pc_giorni)
  lavoratori: Lavoratore[];
  dataSopralluogo: string;
}

const STILE_BADGE: Record<"C" | "PC" | "NC", string> = {
  C: "border-green-600 bg-green-600 text-white",
  PC: "border-amber-500 bg-amber-500 text-white",
  NC: "border-red-600 bg-red-600 text-white",
};

const ETICHETTA_RISCHIO: Record<LivelloRischio, string> = {
  basso: "Basso",
  medio: "Medio",
  alto: "Alto",
};

/**
 * Formazione lavoratori (SEZ-03, Sprint 14): una riga read-only per lavoratore
 * di SEZ-01, con badge C/PC/NC calcolato automaticamente dalla data formazione
 * rispetto alla data del sopralluogo. Nessun override manuale (no NA/NV).
 */
export default function LavoratoriFormazione({
  domanda,
  lavoratori,
  dataSopralluogo,
}: Props) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium leading-snug text-gray-900">{domanda.testo}</p>
      {(domanda.descrizione?.trim() || domanda.note_tecnico?.trim()) && (
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          {domanda.descrizione?.trim() || domanda.note_tecnico}
        </p>
      )}
      <p className="mt-1.5 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">
        Stato conforme/parziale/non conforme calcolato automaticamente dalla data di
        formazione (aggiornamento ogni {domanda.periodicita_mesi ?? 60} mesi) rispetto
        alla data del sopralluogo. Non modificabile manualmente.
      </p>

      {lavoratori.length === 0 ? (
        <p className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Nessun lavoratore inserito in SEZ-01.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {lavoratori.map((l) => {
            const auto = l.dataFormazione
              ? calcolaEsitoAuto(
                  l.dataFormazione,
                  domanda.periodicita_mesi ?? null,
                  dataSopralluogo,
                  domanda.soglia_pc_giorni ?? 60
                )
              : null;
            return (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {l.nome}
                    {l.mansione ? (
                      <span className="font-normal text-gray-500"> · {l.mansione}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-gray-500">
                    Rischio {ETICHETTA_RISCHIO[l.livelloRischio]}
                    {l.dataFormazione ? ` · Formazione ${formatDateShort(l.dataFormazione)}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  {auto ? (
                    <>
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-xs font-bold",
                          STILE_BADGE[auto.esito]
                        )}
                      >
                        {auto.esito}
                      </span>
                      <span className="mt-0.5 text-[10px] text-gray-500">{auto.etichetta}</span>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">Data formazione mancante</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
