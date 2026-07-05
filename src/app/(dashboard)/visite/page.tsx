import { getVisiteFiltrate, type VisitaRiepilogo } from "@/lib/db/queries/visite";
import { parseFiltri, rangePeriodo } from "@/lib/filters";
import { canManagePlanning } from "@/lib/auth/rbac";
import {
  getClientiOpzioni,
  getSediOpzioni,
  getTecniciOpzioni,
} from "@/lib/server/filtri-opzioni";
import { formatDate } from "@/lib/utils";
import StatoBadge, { statoVerbaleUI } from "@/components/ui/StatoBadge";
import EmptyState from "@/components/ui/EmptyState";
import FilterBar, { type FilterConfig } from "@/components/filters/FilterBar";
import AzioniVerbale from "./AzioniVerbale";

const STATI_VERBALE = [
  { value: "bozza", label: "Bozza" },
  { value: "chiuso", label: "Chiuso" },
  { value: "sostituito", label: "Sostituito" },
];

export default async function VisitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // Pagina di sezione (archivio): default di periodo = "sempre" (nessuna finestra
  // implicita che nasconderebbe verbali/bozze più vecchi di 30gg).
  const filtri = parseFiltri(sp, "sempre");
  const oggi = new Date().toISOString().slice(0, 10);
  const range = rangePeriodo(filtri, oggi);
  const mostraTecnico = await canManagePlanning();

  const [visite, clienti, sedi, tecnici] = await Promise.all([
    getVisiteFiltrate({
      clienteId: filtri.cliente,
      sedeId: filtri.sede,
      tecnicoId: mostraTecnico ? filtri.tecnico : undefined, // dimensione off per lo specialist
      stato: filtri.stato,
      dataDa: range.da,
      dataA: range.a,
      soloConNC: filtri.criticita,
    }),
    getClientiOpzioni(),
    getSediOpzioni(),
    mostraTecnico ? getTecniciOpzioni() : Promise.resolve([]),
  ]);

  const config: FilterConfig = {
    cliente: true,
    sede: true,
    tecnico: true, // reso solo se mostraTecnico (admin/planner)
    stato: STATI_VERBALE,
    periodo: true,
    tipologia: [{ value: "sicurezza", label: "Sicurezza" }], // un solo valore → nascosto
    criticita: true,
  };

  const conFiltri =
    !!filtri.cliente || !!filtri.sede || !!filtri.tecnico || !!filtri.stato || !!filtri.criticita || filtri.periodo !== "sempre";

  return (
    <main>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Archivio verbali</h1>
        <p className="text-sm text-gray-600">Sopralluoghi di sicurezza in corso e conclusi.</p>
      </div>

      <FilterBar
        config={config}
        filtri={filtri}
        clienti={clienti}
        sedi={sedi}
        tecnici={tecnici}
        mostraTecnico={mostraTecnico}
        periodoDefault="sempre"
      />

      {visite.length === 0 ? (
        conFiltri ? (
          <EmptyState titolo="Nessun risultato" descrizione="Nessuna visita corrisponde ai filtri selezionati." compatto />
        ) : (
          <EmptyState
            titolo="Nessuna visita"
            descrizione="Apri la scheda di un cliente e avvia una nuova visita da una delle sue sedi."
            ctaHref="/clienti"
            ctaLabel="Vai ai clienti"
          />
        )
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
