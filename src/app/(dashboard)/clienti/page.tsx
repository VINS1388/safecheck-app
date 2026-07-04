import Link from "next/link";
import { getClienti } from "@/lib/db/queries/clienti";
import { canManagePlanning } from "@/lib/auth/rbac";

export default async function ClientiPage() {
  const [clienti, canManage] = await Promise.all([getClienti(), canManagePlanning()]);

  return (
    <main>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Clienti</h1>
          <p className="text-sm text-gray-600">Aziende e relative sedi.</p>
        </div>
        {canManage && (
          <Link
            href="/clienti/nuovo"
            className="flex min-h-[44px] flex-shrink-0 items-center rounded-lg bg-[#1e3a5f] px-4 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            + Nuovo cliente
          </Link>
        )}
      </div>

      {clienti.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-900">Nessun cliente</p>
          <p className="mt-1 text-sm text-gray-500">
            {canManage
              ? "Crea il primo cliente per iniziare a registrare sopralluoghi."
              : "Non ci sono clienti a te assegnati."}
          </p>
          {canManage && (
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
            {clienti.map((c) => (
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
                  <th className="px-4 py-3 text-right font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clienti.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link href={`/clienti/${c.id}`} className="hover:underline">
                        {c.ragione_sociale}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{c.citta ?? "—"}</td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {c.n_sedi}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/clienti/${c.id}`}
                        className="font-medium text-[#1e3a5f] hover:underline"
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
    </main>
  );
}
