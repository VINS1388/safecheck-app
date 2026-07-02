import { getVisiteUtente, type VisitaRiepilogo } from "@/lib/db/queries/visite";
import { formatDate } from "@/lib/utils";
import StatoBadge, { statoVerbaleUI } from "@/components/ui/StatoBadge";
import EmptyState from "@/components/ui/EmptyState";
import AzioniVerbale from "./AzioniVerbale";

export default async function VisitePage() {
  const visite = await getVisiteUtente();

  return (
    <main>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Archivio verbali</h1>
        <p className="text-sm text-gray-600">Sopralluoghi di sicurezza in corso e conclusi.</p>
      </div>

      {visite.length === 0 ? (
        <EmptyState
          titolo="Nessuna visita"
          descrizione="Apri la scheda di un cliente e avvia una nuova visita da una delle sue sedi."
          ctaHref="/clienti"
          ctaLabel="Vai ai clienti"
        />
      ) : (
        <>
          {/* Card stack — mobile */}
          <div className="space-y-3 sm:hidden">
            {visite.map((v) => (
              <VisitaCard key={v.id} v={v} />
            ))}
          </div>

          {/* Tabella — desktop */}
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Stato</th>
                  <th className="px-4 py-3 font-medium">Azienda</th>
                  <th className="px-4 py-3 font-medium">Sede</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 text-right font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visite.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <StatoBadge statoVerbale={v.stato_verbale} numeroVerbale={v.numero_verbale} />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{v.cliente_nome}</td>
                    <td className="px-4 py-3 text-gray-700">{v.sede_nome}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(v.data_visita)}</td>
                    <td className="px-4 py-3 text-right">
                      <AzioniVerbale visitaId={v.id} stato={statoVerbaleUI(v)} />
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

function VisitaCard({ v }: { v: VisitaRiepilogo }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{v.cliente_nome}</p>
          <p className="truncate text-sm text-gray-600">{v.sede_nome}</p>
          <p className="mt-0.5 text-xs text-gray-500">{formatDate(v.data_visita)}</p>
        </div>
        <StatoBadge statoVerbale={v.stato_verbale} numeroVerbale={v.numero_verbale} />
      </div>
      <div className="mt-3 border-t border-gray-100 pt-3 text-right">
        <AzioniVerbale visitaId={v.id} stato={statoVerbaleUI(v)} />
      </div>
    </div>
  );
}
