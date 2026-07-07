"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { DashboardCliente } from "@/lib/db/queries/clienti";

export default function DashboardClienti({
  clienti,
}: {
  clienti: DashboardCliente[];
}) {
  const [q, setQ] = useState("");

  const filtrati = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return clienti;
    return clienti.filter((c) => c.ragione_sociale.toLowerCase().includes(t));
  }, [q, clienti]);

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Clienti</h2>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca cliente…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:w-64"
        />
      </div>

      {filtrati.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-900">
            {clienti.length === 0 ? "Nessun cliente" : "Nessun risultato"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {clienti.length === 0
              ? "Crea il primo cliente per iniziare."
              : "Nessun cliente corrisponde alla ricerca."}
          </p>
        </div>
      ) : (
        <>
          {/* Card stack — mobile */}
          <div className="space-y-3 sm:hidden">
            {filtrati.map((c) => (
              <Link
                key={c.id}
                href={`/clienti/${c.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-brand/30"
              >
                <p className="font-medium text-gray-900">{c.ragione_sociale}</p>
                <p className="mt-0.5 text-sm text-gray-500">{c.citta ?? "—"}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                  <span>{c.n_sedi} sed{Number(c.n_sedi) === 1 ? "e" : "i"}</span>
                  <span>{c.n_verbali} verbal{Number(c.n_verbali) === 1 ? "e" : "i"}</span>
                  <span className="text-gray-400">
                    Ultimo: {c.ultima_visita ? formatDate(c.ultima_visita) : "—"}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Tabella — desktop */}
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white sm:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Ragione sociale</th>
                  <th className="px-4 py-3 font-medium">Città</th>
                  <th className="px-4 py-3 text-center font-medium">Sedi</th>
                  <th className="px-4 py-3 text-center font-medium">Verbali</th>
                  <th className="px-4 py-3 font-medium">Ultimo sopralluogo</th>
                  <th className="px-4 py-3 text-right font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrati.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link href={`/clienti/${c.id}`} className="hover:underline">
                        {c.ragione_sociale}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{c.citta ?? "—"}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{c.n_sedi}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{c.n_verbali}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.ultima_visita ? formatDate(c.ultima_visita) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/clienti/${c.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        Apri
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
