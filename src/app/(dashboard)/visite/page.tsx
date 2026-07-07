import { getVisiteFiltrate, type VisitaRiepilogo } from "@/lib/db/queries/visite";
import { parseFiltri, rangePeriodo } from "@/lib/filters";
import { canManagePlanning } from "@/lib/auth/rbac";
import {
  getClientiOpzioni,
  getSediOpzioni,
  getTecniciOpzioni,
} from "@/lib/server/filtri-opzioni";
import { getModuliAttivabili } from "@/lib/db/queries/moduli";
import { formatDate } from "@/lib/utils";
import StatoBadge, { statoVerbaleUI } from "@/components/ui/StatoBadge";
import BadgeModulo from "@/components/ui/BadgeModulo";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
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

  const [visite, clienti, sedi, tecnici, moduli] = await Promise.all([
    getVisiteFiltrate({
      clienteId: filtri.cliente,
      sedeId: filtri.sede,
      tecnicoId: mostraTecnico ? filtri.tecnico : undefined, // dimensione off per lo specialist
      moduloId: filtri.tipologia, // tipologia = modulo (auto-nascosta con un solo modulo)
      stato: filtri.stato,
      dataDa: range.da,
      dataA: range.a,
      soloConNC: filtri.criticita,
    }),
    getClientiOpzioni(),
    getSediOpzioni(),
    mostraTecnico ? getTecniciOpzioni() : Promise.resolve([]),
    getModuliAttivabili(),
  ]);

  const config: FilterConfig = {
    cliente: true,
    sede: true,
    tecnico: true, // reso solo se mostraTecnico (admin/planner)
    stato: STATI_VERBALE,
    periodo: true,
    // Tipologia = modulo: opzioni dai moduli attivabili. Con un solo modulo la
    // FilterBar auto-nasconde la dimensione (mostraTipologia = length > 1).
    tipologia: moduli.map((m) => ({ value: m.id, label: m.nomeBreve })),
    criticita: true,
  };

  const conFiltri =
    !!filtri.cliente || !!filtri.sede || !!filtri.tecnico || !!filtri.stato || !!filtri.criticita || filtri.periodo !== "sempre";

  const mostraModulo = moduli.length > 1;

  // Colonne tabella desktop — stessa struttura/ordine/dati del render precedente.
  const columns: Column<VisitaRiepilogo>[] = [
    {
      header: "Stato",
      cell: (v) => <StatoBadge statoVerbale={v.stato_verbale} numeroVerbale={v.numero_verbale} />,
    },
    {
      header: "Azienda",
      className: "font-medium text-gray-900",
      cell: (v) => (
        <span className="inline-flex items-center gap-2">
          {v.cliente_nome}
          <BadgeModulo nomeBreve={v.moduloNomeBreve ?? ""} famiglia={v.moduloFamiglia} mostra={mostraModulo} />
        </span>
      ),
    },
    { header: "Sede", className: "text-gray-700", cell: (v) => v.sede_nome },
    { header: "Data", className: "text-gray-700", cell: (v) => formatDate(v.data_visita) },
    {
      header: "Azioni",
      align: "right",
      cell: (v) => <AzioniVerbale visitaId={v.id} stato={statoVerbaleUI(v)} />,
    },
  ];

  const vuoto = conFiltri ? (
    <EmptyState titolo="Nessun risultato" descrizione="Nessuna visita corrisponde ai filtri selezionati." compatto />
  ) : (
    <EmptyState
      titolo="Nessuna visita"
      descrizione="Apri la scheda di un cliente e avvia una nuova visita da una delle sue sedi."
      ctaHref="/clienti"
      ctaLabel="Vai ai clienti"
    />
  );

  return (
    <main>
      <PageHeader titolo="Archivio verbali" sottotitolo="Sopralluoghi di sicurezza in corso e conclusi." />

      <FilterBar
        config={config}
        filtri={filtri}
        clienti={clienti}
        sedi={sedi}
        tecnici={tecnici}
        mostraTecnico={mostraTecnico}
        periodoDefault="sempre"
      />

      <DataTable
        columns={columns}
        rows={visite}
        keyOf={(v) => v.id}
        renderCard={(v) => <VisitaCard v={v} mostraModulo={mostraModulo} />}
        vuoto={vuoto}
      />
    </main>
  );
}

function VisitaCard({ v, mostraModulo }: { v: VisitaRiepilogo; mostraModulo: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-medium text-gray-900">
            <span className="truncate">{v.cliente_nome}</span>
            <BadgeModulo nomeBreve={v.moduloNomeBreve ?? ""} famiglia={v.moduloFamiglia} mostra={mostraModulo} />
          </p>
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
