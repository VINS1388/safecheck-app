import Link from "next/link";
import { getScadenze } from "@/lib/db/queries/scadenze";
import { getClienti } from "@/lib/db/queries/clienti";
import { isScaduta } from "@/lib/scadenze/calcola";
import { formatDate } from "@/lib/utils";

const ETICHETTA_TIPO: Record<string, string> = {
  formazione: "Formazione",
  certificazione: "Certificazione",
  azione_correttiva: "Azione correttiva",
  visita_pianificata: "Visita pianificata",
  altro: "Altro",
};

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

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Scadenze</h1>
        <p className="text-sm text-gray-600">
          Scadenze attive, ordinate per data. Sola lettura.
        </p>
      </div>

      {/* Filtro per cliente (GET, nessun JS). */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700">Cliente</label>
          <select
            name="cliente"
            defaultValue={clienteId ?? ""}
            className="mt-1 min-h-[40px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="">Tutti i clienti</option>
            {clienti.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ragione_sociale}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="min-h-[40px] rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90"
        >
          Filtra
        </button>
        {clienteId && (
          <Link href="/scadenze" className="min-h-[40px] py-2 text-sm text-brand hover:underline">
            Azzera
          </Link>
        )}
      </form>

      {scadenze.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          Nessuna scadenza attiva{clienteId ? " per il cliente selezionato" : ""}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Scadenza</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Sede</th>
                <th className="px-4 py-3 font-medium">Periodicità</th>
                <th className="px-4 py-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scadenze.map((s) => {
                const scaduta = isScaduta(s.dataScadenza, oggi);
                return (
                  <tr key={s.id} className="text-gray-900">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={scaduta ? "font-semibold text-red-600" : "font-medium"}>
                        {formatDate(s.dataScadenza)}
                      </span>
                      {scaduta && (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          SCADUTA
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{ETICHETTA_TIPO[s.tipo] ?? s.tipo}</td>
                    <td className="px-4 py-3 text-gray-700">{s.clienteNome ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{s.sedeNome ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {s.periodicitaMesi != null ? `${s.periodicitaMesi} mesi` : "manuale"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{s.note ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
