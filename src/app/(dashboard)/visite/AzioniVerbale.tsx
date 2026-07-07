"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StatoVerbaleUI } from "@/components/ui/StatoBadge";
import { eliminaBozzaAction } from "./actions";

const LINK = "font-medium text-brand hover:underline disabled:opacity-40";

interface Props {
  visitaId: string;
  stato: StatoVerbaleUI;
}

/**
 * Azioni contestuali per riga dell'archivio (Sprint 15.1). Island client:
 *   bozza      → Continua / Elimina
 *   chiuso     → Leggi / Scarica PDF / Duplica / Crea sostitutivo
 *   sostituito → Leggi / Scarica PDF
 * Riusa le route API esistenti (duplica/sostitutivo) — nessuna logica nuova.
 */
export default function AzioniVerbale({ visitaId, stato }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "duplica" | "sostitutivo" | "elimina">(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function clona(tipo: "duplica" | "sostitutivo") {
    setBusy(tipo);
    setErrore(null);
    try {
      const res = await fetch(`/api/visite/${visitaId}/${tipo}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Operazione non riuscita.");
      router.push(`/visite/${body.visita_id}/checklist`);
    } catch (e) {
      setBusy(null);
      setErrore(e instanceof Error ? e.message : "Errore.");
    }
  }

  async function elimina() {
    if (!window.confirm("Eliminare definitivamente questa bozza? L'operazione non è reversibile.")) return;
    setBusy("elimina");
    setErrore(null);
    const res = await eliminaBozzaAction(visitaId);
    if (res.ok) {
      router.refresh();
    } else {
      setBusy(null);
      setErrore(res.error);
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="inline-flex items-center gap-4">
        {stato === "bozza" ? (
          <>
            <Link href={`/visite/${visitaId}/avvia`} className={LINK}>
              Continua
            </Link>
            <button type="button" onClick={elimina} disabled={busy !== null} className="font-medium text-red-600 hover:underline disabled:opacity-40">
              {busy === "elimina" ? "…" : "Elimina"}
            </button>
          </>
        ) : (
          <>
            <Link href={`/visite/${visitaId}/riepilogo`} className={LINK}>
              Leggi
            </Link>
            <a href={`/api/visite/${visitaId}/download-pdf`} className={LINK}>
              Scarica PDF
            </a>
            {stato === "chiuso" && (
              <>
                <button type="button" onClick={() => clona("duplica")} disabled={busy !== null} className={LINK}>
                  {busy === "duplica" ? "…" : "Duplica"}
                </button>
                <button type="button" onClick={() => clona("sostitutivo")} disabled={busy !== null} className={LINK}>
                  {busy === "sostitutivo" ? "…" : "Crea sostitutivo"}
                </button>
              </>
            )}
          </>
        )}
      </div>
      {errore && <span className="text-xs text-red-600">{errore}</span>}
    </div>
  );
}
