"use client";

import Button from "./Button";

// ConfirmDialog (Sprint 16.5 · S2) — SHELL presentazionale del dialog di
// conferma. Oggi la stessa chrome (overlay + bottom-sheet mobile / centrato
// desktop) è clonata in BottoneConfermaAzione e nel Modal inline di
// OrganizzazioneClient. Questa primitiva la centralizza.
//
// È solo presentazionale: `aperto`/`onChiudi`/`onConferma` sono controllati dal
// chiamante. Non fa data-fetching né server actions — così può servire sia il
// pattern a server-action-form sia quello a result-handling client (Organizzazione).
// L'aggancio dei due call site esistenti è uno step applicativo successivo, non S2.

interface Props {
  aperto: boolean;
  onChiudi: () => void;
  titolo: string;
  /** Testo/nodo del corpo del dialog. */
  children: React.ReactNode;
  onConferma?: () => void;
  testoConferma?: string;
  testoAnnulla?: string;
  variante?: "primary" | "danger";
  /** Disabilita il bottone di conferma (es. operazione in corso). */
  confermaDisabilitata?: boolean;
  /** Sostituisce del tutto la riga azioni di default. */
  azioni?: React.ReactNode;
}

export default function ConfirmDialog({
  aperto,
  onChiudi,
  titolo,
  children,
  onConferma,
  testoConferma = "Conferma",
  testoAnnulla = "Annulla",
  variante = "primary",
  confermaDisabilitata,
  azioni,
}: Props) {
  if (!aperto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onChiudi} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <h2 className="text-lg font-semibold text-gray-900">{titolo}</h2>
        <div className="mt-3 space-y-3 text-sm text-gray-600">{children}</div>
        <div className="mt-5 flex justify-end gap-3">
          {azioni ?? (
            <>
              <Button variant="secondary" onClick={onChiudi}>
                {testoAnnulla}
              </Button>
              {onConferma && (
                <Button
                  variant={variante}
                  onClick={onConferma}
                  disabled={confermaDisabilitata}
                >
                  {testoConferma}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
