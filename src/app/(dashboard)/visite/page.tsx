import Link from "next/link";
import { getVisiteUtente, type VisitaRiepilogo } from "@/lib/db/queries/visite";
import { formatDate } from "@/lib/utils";

export default async function VisitePage() {
  const visite = await getVisiteUtente();

  return (
    <main>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Visite</h1>
        <p className="text-sm text-gray-600">
          Sopralluoghi di sicurezza in corso e conclusi.
        </p>
      </div>

      {visite.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-900">Nessuna visita</p>
          <p className="mt-1 text-sm text-gray-500">
            Apri la scheda di un cliente e avvia una{" "}
            <span className="font-medium">Nuova visita</span> da una delle sue
            sedi.
          </p>
          <Link
            href="/clienti"
            className="mt-4 inline-block min-h-[44px] rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Vai ai clienti
          </Link>
        </div>
      ) : (
        <>
          {/* Card stack — mobile */}
          <div className="space-y-3 sm:hidden">
            {visite.map((v) => (
              <VisitaCard key={v.id} v={v} />
            ))}
          </div>

          {/* Tabella — desktop */}
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white sm:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Azienda</th>
                  <th className="px-4 py-3 font-medium">Sede</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Verbale</th>
                  <th className="px-4 py-3 text-right font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visite.map((v) => {
                  const chiusa = v.numero_verbale != null;
                  return (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {v.cliente_nome}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{v.sede_nome}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatDate(v.data_visita)}
                      </td>
                      <td className="px-4 py-3">
                        <BadgeVerbale v={v} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Azioni v={v} chiusa={chiusa} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

function BadgeVerbale({ v }: { v: VisitaRiepilogo }) {
  if (v.numero_verbale != null) {
    return (
      <a
        href={`/api/visite/${v.id}/download-pdf`}
        className="font-medium text-[#1e3a5f] hover:underline"
      >
        {v.numero_verbale}
      </a>
    );
  }
  return (
    <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
      Bozza
    </span>
  );
}

function Azioni({ v, chiusa }: { v: VisitaRiepilogo; chiusa: boolean }) {
  if (chiusa) {
    return (
      <span className="inline-flex items-center gap-4">
        <a
          href={`/api/visite/${v.id}/download-pdf`}
          className="font-medium text-[#1e3a5f] hover:underline"
        >
          Scarica PDF
        </a>
        <span
          title="Disponibile nello Sprint 8"
          className="cursor-not-allowed text-gray-300"
        >
          Duplica
        </span>
      </span>
    );
  }
  return (
    <Link
      href={`/visite/${v.id}/avvia`}
      className="font-medium text-[#1e3a5f] hover:underline"
    >
      Continua
    </Link>
  );
}

function VisitaCard({ v }: { v: VisitaRiepilogo }) {
  const chiusa = v.numero_verbale != null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{v.cliente_nome}</p>
          <p className="truncate text-sm text-gray-600">{v.sede_nome}</p>
          <p className="mt-0.5 text-xs text-gray-500">{formatDate(v.data_visita)}</p>
        </div>
        <BadgeVerbale v={v} />
      </div>
      <div className="mt-3 border-t border-gray-100 pt-3 text-right">
        <Azioni v={v} chiusa={chiusa} />
      </div>
    </div>
  );
}
