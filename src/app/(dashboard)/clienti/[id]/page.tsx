import Link from "next/link";
import { notFound } from "next/navigation";
import { getClienteById } from "@/lib/db/queries/clienti";
import { nuovaVisitaAction } from "./sedi/[sedeId]/nuova-visita/actions";

export default async function ClienteDettaglioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cliente = await getClienteById(id);
  if (!cliente) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link href="/clienti" className="text-sm text-[#1e3a5f] hover:underline">
          ← Clienti
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          {cliente.ragione_sociale}
        </h1>
        <p className="text-sm text-gray-600">
          {[cliente.citta, cliente.provincia].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Sedi</h2>
        <Link
          href={`/clienti/${cliente.id}/sedi/nuova`}
          className="rounded-md border border-[#1e3a5f] px-3 py-1.5 text-sm font-semibold text-[#1e3a5f] transition hover:bg-[#1e3a5f] hover:text-white"
        >
          + Nuova sede
        </Link>
      </div>

      {cliente.sedi.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-900">Nessuna sede</p>
          <p className="mt-1 text-sm text-gray-500">
            Aggiungi una sede per avviare un sopralluogo.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cliente.sedi.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-gray-900">{s.nome}</p>
                <p className="text-sm text-gray-600">
                  {s.indirizzo}
                  {s.citta ? `, ${s.citta}` : ""}
                </p>
              </div>
              <form action={nuovaVisitaAction.bind(null, cliente.id, s.id)}>
                <button
                  type="submit"
                  className="rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#16304e]"
                >
                  Nuova visita
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
