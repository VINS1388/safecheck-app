"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ModuloSede } from "@/lib/db/queries/moduli";
import { setModuloSedeAction } from "./servizi-actions";

/**
 * Sezione "Servizi attivi" della scheda sede. Mostra i moduli attivabili con il
 * loro stato sulla sede. admin/planner: toggle; tecnico: sola lettura. Con un
 * solo modulo attivabile resta minimale (una riga), non invadente.
 */
export default function ServiziAttivi({
  clienteId,
  sedeId,
  moduli,
  canManage,
}: {
  clienteId: string;
  sedeId: string;
  moduli: ModuloSede[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  if (moduli.length === 0) return null;

  async function toggle(moduloId: string, attivo: boolean) {
    setBusy(moduloId);
    setErrore(null);
    const res = await setModuloSedeAction(clienteId, sedeId, moduloId, attivo);
    setBusy(null);
    if (res.ok) router.refresh();
    else setErrore(res.error);
  }

  return (
    <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">Servizi attivi</h2>
      <p className="mt-0.5 text-xs text-gray-500">Moduli di ispezione abilitati su questa sede.</p>

      {errore && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errore}</p>}

      <ul className="mt-3 space-y-2">
        {moduli.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{m.nomeCommerciale}</p>
            </div>
            {canManage ? (
              <button
                type="button"
                role="switch"
                aria-checked={m.attivoSede}
                disabled={busy === m.id}
                onClick={() => toggle(m.id, !m.attivoSede)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition disabled:opacity-50 ${
                  m.attivoSede ? "bg-brand" : "bg-gray-300"
                }`}
                title={m.attivoSede ? "Attivo — clicca per disattivare" : "Disattivato — clicca per attivare"}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                    m.attivoSede ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            ) : (
              <span
                className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  m.attivoSede ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {m.attivoSede ? "Attivo" : "Disattivato"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
