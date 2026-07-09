"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { PianoRiepilogo } from "@/lib/db/queries/pianificazione";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { generaProssimoCicloAction } from "./actions";

export default function PianiContrattuali({ piani }: { piani: PianoRiepilogo[] }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [conferma, setConferma] = useState<PianoRiepilogo | null>(null);

  if (piani.length === 0) return null;
  const generabili = piani.filter((p) => p.puoGenerareProssimo).length;

  async function eseguiGenera(p: PianoRiepilogo) {
    setBusy(p.pianoId);
    setMsg(null);
    const res = await generaProssimoCicloAction(p.pianoId);
    setBusy(null);
    setConferma(null);
    if (res.ok) {
      setMsg(`Ciclo ${p.cicloCorrente + 1} generato per ${p.sedeNome} (${res.nuovi} visite).`);
      router.refresh();
    } else {
      setMsg(res.error);
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-gray-900">
          Piani contrattuali ({piani.length})
          {generabili > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {generabili} da rinnovare
            </span>
          )}
        </span>
        <span className="text-gray-400">{aperto ? "▲" : "▼"}</span>
      </button>

      {aperto && (
        <div className="border-t border-gray-100 px-4 py-3">
          {msg && <p className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{msg}</p>}
          <ul className="space-y-2">
            {piani.map((p) => (
              <li key={p.pianoId} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {p.clienteNome} <span className="font-normal text-gray-500">· {p.sedeNome}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Ciclo {p.cicloCorrente} · {p.eseguitiCicloCorrente}/{p.totaleCicloCorrente} eseguite ·{" "}
                    {p.visiteAnno} visite/anno
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConferma(p)}
                  disabled={!p.puoGenerareProssimo || busy === p.pianoId}
                  title={
                    p.puoGenerareProssimo
                      ? "Genera il ciclo successivo"
                      : "Ciclo in corso: disponibile quando tutte le visite sono eseguite o il ciclo è terminato"
                  }
                  className={cn(
                    "min-h-[38px] rounded-lg px-3 text-xs font-semibold transition",
                    p.puoGenerareProssimo
                      ? "bg-brand text-white enabled:hover:bg-brand-hover disabled:opacity-50"
                      : "cursor-not-allowed border border-gray-200 bg-gray-50 text-gray-400"
                  )}
                >
                  {busy === p.pianoId ? "…" : "Genera prossimo ciclo"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        aperto={conferma !== null}
        onChiudi={() => {
          if (busy) return;
          setConferma(null);
        }}
        titolo="Genera prossimo ciclo"
        onConferma={() => conferma && eseguiGenera(conferma)}
        testoConferma={conferma && busy === conferma.pianoId ? "Generazione…" : "Genera"}
        confermaDisabilitata={conferma !== null && busy === conferma.pianoId}
      >
        {conferma && (
          <p>
            Generare il ciclo {conferma.cicloCorrente + 1} per{" "}
            <strong>{conferma.clienteNome}</strong> · {conferma.sedeNome}? Verranno create{" "}
            {conferma.visiteAnno} nuove visite pianificate.
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}
