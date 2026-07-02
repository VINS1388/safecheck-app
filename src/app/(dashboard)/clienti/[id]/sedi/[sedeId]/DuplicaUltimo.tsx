"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** CTA "Duplica ultimo verbale" (riusa la route API esistente). */
export default function DuplicaUltimo({ visitaId }: { visitaId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function duplica() {
    setBusy(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/visite/${visitaId}/duplica`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Duplicazione non riuscita.");
      router.push(`/visite/${body.visita_id}/checklist`);
    } catch (e) {
      setBusy(false);
      setErrore(e instanceof Error ? e.message : "Errore.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={duplica}
        disabled={busy}
        className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? "…" : "Duplica ultimo verbale"}
      </button>
      {errore && <span className="text-xs text-red-600">{errore}</span>}
    </>
  );
}
