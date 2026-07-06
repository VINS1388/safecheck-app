import Link from "next/link";
import { getClienti, getClientiArchiviati } from "@/lib/db/queries/clienti";
import { canManagePlanning } from "@/lib/auth/rbac";
import { riattivaClienteAction } from "./[id]/actions";

export default async function ClientiPage({
  searchParams,
}: {
  searchParams: Promise<{ archiviati?: string; msg?: string; err?: string }>;
}) {
  const { archiviati, msg, err } = await searchParams;
  const canManage = await canManagePlanning();
  const vistaArchiviati = archiviati === "1" && canManage;

  const clienti = vistaArchiviati ? await getClientiArchiviati() : await getClienti();

  return (
    <main>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Clienti{vistaArchiviati ? " archiviati" : ""}
          </h1>
          <p className="text-sm text-gray-600">
            {vistaArchiviati ? "Clienti disattivati, riattivabili." : "Aziende e relative sedi."}
          </p>
        </div>
        {canManage && !vistaArchiviati && (
          <Link
            href="/clienti/nuovo"
            className="flex min-h-[44px] flex-shrink-0 items-center rounded-lg bg-[#1e3a5f] px-4 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            + Nuovo cliente
          </Link>
        )}
      </div>

      {msg && (
        <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">{msg}</p>
      )}
      {err && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{err}</p>
      )}

      {/* Toggle vista attivi/archiviati (solo admin/planner) */}
      {canManage && (
        <div className="mb-4">
          <Link
            href={vistaArchiviati ? "/clienti" : "/clienti?archiviati=1"}
            className="text-sm font-medium text-[#1e3a5f] hover:underline"
          >
            {vistaArchiviati ? "← Torna ai clienti attivi" : "Mostra archiviati"}
          </Link>
        </div>
      )}

      {clienti.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-900">
            {vistaArchiviati ? "Nessun cliente archiviato" : "Nessun cliente"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {vistaArchiviati
              ? "Non ci sono clienti disattivati."
              : canManage
                ? "Crea il primo cliente per iniziare a registrare sopralluoghi."
                : "Non ci sono clienti a te assegnati."}
          </p>
          {canManage && !vistaArchiviati && (
            <Link
              href="/clienti/nuovo"
              className="mt-4 inline-block min-h-[44px] rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#16304e]"
            >
              + Nuovo cliente
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Card stack — mobile */}
          <div className="space-y-3 sm:hidden">
            {clienti.map((c) =>
              vistaArchiviati ? (
                <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="font-medium text-gray-900">{c.ragione_sociale}</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {c.citta ?? "—"} · {c.n_sedi} sed{c.n_sedi === 1 ? "e" : "i"}
                  </p>
                  <form action={riattivaClienteAction.bind(null, c.id)} className="mt-3">
                    <button
                      type="submit"
                      className="rounded-md border border-green-300 bg-white px-3 py-1.5 text-sm font-medium text-green-700 transition hover:bg-green-600 hover:text-white"
                    >
                      Riattiva
                    </button>
                  </form>
                </div>
              ) : (
                <Link
                  key={c.id}
                  href={`/clienti/${c.id}`}
                  className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <p className="font-medium text-gray-900">{c.ragione_sociale}</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {c.citta ?? "—"} · {c.n_sedi} sed{c.n_sedi === 1 ? "e" : "i"}
                  </p>
                </Link>
              )
            )}
          </div>

          {/* Tabella — desktop */}
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white sm:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Ragione sociale</th>
                  <th className="px-4 py-3 font-medium">Città</th>
                  <th className="px-4 py-3 text-center font-medium">Sedi</th>
                  <th className="px-4 py-3 text-right font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clienti.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {vistaArchiviati ? (
                        <span className="flex items-center gap-2">
                          {c.ragione_sociale}
                          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            Archiviato
                          </span>
                        </span>
                      ) : (
                        <Link href={`/clienti/${c.id}`} className="hover:underline">
                          {c.ragione_sociale}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{c.citta ?? "—"}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{c.n_sedi}</td>
                    <td className="px-4 py-3 text-right">
                      {vistaArchiviati ? (
                        <form action={riattivaClienteAction.bind(null, c.id)} className="inline">
                          <button
                            type="submit"
                            className="font-medium text-green-700 hover:underline"
                          >
                            Riattiva
                          </button>
                        </form>
                      ) : (
                        <Link
                          href={`/clienti/${c.id}`}
                          className="font-medium text-[#1e3a5f] hover:underline"
                        >
                          Apri
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
