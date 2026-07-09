import Link from "next/link";
import { getClienti, getClientiArchiviati } from "@/lib/db/queries/clienti";
import { canManagePlanning } from "@/lib/auth/rbac";
import { riattivaClienteAction } from "./[id]/actions";
import PageHeader from "@/components/ui/PageHeader";
import AlertBanner from "@/components/ui/AlertBanner";
import EmptyState from "@/components/ui/EmptyState";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { buttonClasses } from "@/components/ui/Button";
import ClientiFiltrati, { type ClienteRiga } from "./ClientiFiltrati";

export default async function ClientiPage({
  searchParams,
}: {
  searchParams: Promise<{ archiviati?: string; msg?: string; err?: string }>;
}) {
  const { archiviati, msg, err } = await searchParams;
  const canManage = await canManagePlanning();
  const vistaArchiviati = archiviati === "1" && canManage;

  const clienti = (vistaArchiviati ? await getClientiArchiviati() : await getClienti()) as ClienteRiga[];

  const sediCella = (c: ClienteRiga) => `${c.n_sedi} sed${c.n_sedi === 1 ? "e" : "i"}`;

  const columns: Column<ClienteRiga>[] = [
    {
      header: "Ragione sociale",
      className: "font-medium text-gray-900",
      cell: (c) =>
        vistaArchiviati ? (
          <span className="inline-flex items-center gap-2">
            {c.ragione_sociale}
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Archiviato
            </span>
          </span>
        ) : (
          <Link href={`/clienti/${c.id}`} className="hover:underline">
            {c.ragione_sociale}
          </Link>
        ),
    },
    { header: "Città", className: "text-gray-700", cell: (c) => c.citta ?? "—" },
    { header: "Sedi", className: "text-gray-700", cell: sediCella },
    {
      header: "Azioni",
      align: "right",
      cell: (c) =>
        vistaArchiviati ? (
          <form action={riattivaClienteAction.bind(null, c.id)} className="inline">
            <button type="submit" className="font-medium text-green-700 hover:underline">
              Riattiva
            </button>
          </form>
        ) : (
          <Link href={`/clienti/${c.id}`} className="font-medium text-brand hover:underline">
            Apri
          </Link>
        ),
    },
  ];

  const vuoto = (
    <EmptyState
      titolo={vistaArchiviati ? "Nessun cliente archiviato" : "Nessun cliente"}
      descrizione={
        vistaArchiviati
          ? "Non ci sono clienti disattivati."
          : canManage
            ? "Crea il primo cliente per iniziare a registrare sopralluoghi."
            : "Non ci sono clienti a te assegnati."
      }
      ctaHref={canManage && !vistaArchiviati ? "/clienti/nuovo" : undefined}
      ctaLabel={canManage && !vistaArchiviati ? "+ Nuovo cliente" : undefined}
    />
  );

  return (
    <main>
      <PageHeader
        titolo={vistaArchiviati ? "Clienti archiviati" : "Clienti"}
        sottotitolo={vistaArchiviati ? "Clienti disattivati, riattivabili." : "Aziende e relative sedi."}
        azioni={
          canManage && !vistaArchiviati ? (
            <Link href="/clienti/nuovo" className={buttonClasses("primary")}>
              + Nuovo cliente
            </Link>
          ) : undefined
        }
      />

      {msg && (
        <AlertBanner variant="success" role="status" className="mb-4">
          {msg}
        </AlertBanner>
      )}
      {err && (
        <AlertBanner variant="danger" role="alert" className="mb-4">
          {err}
        </AlertBanner>
      )}

      {/* Toggle vista attivi/archiviati (solo admin/planner) */}
      {canManage && (
        <div className="mb-4">
          <Link
            href={vistaArchiviati ? "/clienti" : "/clienti?archiviati=1"}
            className="text-sm font-medium text-brand hover:underline"
          >
            {vistaArchiviati ? "← Torna ai clienti attivi" : "Mostra archiviati"}
          </Link>
        </div>
      )}

      {vistaArchiviati ? (
        <DataTable columns={columns} rows={clienti} keyOf={(c) => c.id} vuoto={vuoto} />
      ) : (
        <ClientiFiltrati clienti={clienti} vuoto={vuoto} />
      )}
    </main>
  );
}
