"use client";

import { useState } from "react";

/**
 * Bottone che apre un dialog di conferma prima di eseguire una server action
 * (pattern edge case D, Sprint 16). Riusato per disattivazione/riattivazione di
 * clienti e sedi: il dialog mostra un AVVISO IMPATTI non bloccante (es. sedi/slot
 * collegati) e conferma esplicita. `azione` è una server action già bound.
 */
export default function BottoneConfermaAzione({
  azione,
  etichetta,
  titolo,
  messaggio,
  testoConferma = "Conferma",
  variante = "neutro",
  classeTrigger,
  disabilitato = false,
  tooltipDisabilitato,
}: {
  azione: () => void | Promise<void>;
  etichetta: React.ReactNode;
  titolo: string;
  messaggio: React.ReactNode;
  testoConferma?: string;
  variante?: "neutro" | "rosso";
  classeTrigger?: string;
  disabilitato?: boolean;
  tooltipDisabilitato?: string;
}) {
  const [aperto, setAperto] = useState(false);

  const btnConferma =
    variante === "rosso"
      ? "inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
      : "inline-flex items-center justify-center rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#16304e]";

  return (
    <>
      <button
        type="button"
        disabled={disabilitato}
        title={disabilitato ? tooltipDisabilitato : undefined}
        onClick={() => setAperto(true)}
        className={
          classeTrigger ??
          "font-medium text-[#1e3a5f] hover:underline disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline"
        }
      >
        {etichetta}
      </button>

      {aperto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAperto(false)} />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
            <h2 className="text-lg font-semibold text-gray-900">{titolo}</h2>
            <div className="mt-3 space-y-3 text-sm text-gray-600">{messaggio}</div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                onClick={() => setAperto(false)}
              >
                Annulla
              </button>
              <form action={azione}>
                <button type="submit" className={btnConferma}>
                  {testoConferma}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
