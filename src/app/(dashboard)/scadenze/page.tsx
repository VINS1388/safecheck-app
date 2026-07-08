import Link from "next/link";
import { getScadenze } from "@/lib/db/queries/scadenze";
import { getClienti } from "@/lib/db/queries/clienti";
import { isScaduta } from "@/lib/scadenze/calcola";
import { formatDate } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { Field, Select } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";

const ETICHETTA_TIPO: Record<string, string> = {
  formazione: "Formazione",
  certificazione: "Certificazione",
  azione_correttiva: "Azione correttiva",
  visita_pianificata: "Visita pianificata",
  altro: "Altro",
};

type ScadenzaRiga = Awaited<ReturnType<typeof getScadenze>>[number];

export default async function ScadenzePage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const { cliente } = await searchParams;
  const clienteId = cliente || undefined;

  const [scadenze, clienti] = await Promise.all([
    getScadenze({ stato: "attiva", clienteId }),
    getClienti(),
  ]);

  // "Oggi" lato server (UTC su Vercel) per evidenziare le scadenze già passate.
  const oggi = new Date().toISOString().slice(0, 10);

  const columns: Column<ScadenzaRiga>[] = [
    {
      header: "Scadenza",
      className: "whitespace-nowrap",
      cell: (s) => {
        const scaduta = isScaduta(s.dataScadenza, oggi);
        return (
          <span className="inline-flex items-center gap-2">
            <span className={scaduta ? "font-semibold text-red-600" : "font-medium text-gray-900"}>
              {formatDate(s.dataScadenza)}
            </span>
            {scaduta && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                SCADUTA
              </span>
            )}
          </span>
        );
      },
    },
    { header: "Tipo", className: "text-gray-700", cell: (s) => ETICHETTA_TIPO[s.tipo] ?? s.tipo },
    { header: "Cliente", className: "text-gray-700", cell: (s) => s.clienteNome ?? "—" },
    { header: "Sede", className: "text-gray-700", cell: (s) => s.sedeNome ?? "—" },
    {
      header: "Periodicità",
      className: "text-gray-700",
      cell: (s) => (s.periodicitaMesi != null ? `${s.periodicitaMesi} mesi` : "manuale"),
    },
    { header: "Note", className: "text-gray-500", cell: (s) => s.note ?? "—" },
  ];

  const vuoto = (
    <EmptyState
      titolo="Nessuna scadenza registrata"
      descrizione={
        clienteId
          ? "Nessuna scadenza attiva per il cliente selezionato."
          : "Non ci sono scadenze attive nel sistema."
      }
    />
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader titolo="Scadenze" sottotitolo="Scadenze attive, ordinate per data. Sola lettura." />

      {/* Filtro per cliente (GET, nessun JS). */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Cliente" className="min-w-[220px]">
          <Select name="cliente" defaultValue={clienteId ?? ""}>
            <option value="">Tutti i clienti</option>
            {clienti.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ragione_sociale}
              </option>
            ))}
          </Select>
        </Field>
        <button type="submit" className={buttonClasses("primary")}>
          Filtra
        </button>
        {clienteId && (
          <Link href="/scadenze" className={buttonClasses("ghost")}>
            Azzera
          </Link>
        )}
      </form>

      <DataTable columns={columns} rows={scadenze} keyOf={(s) => s.id} vuoto={vuoto} />
    </div>
  );
}
