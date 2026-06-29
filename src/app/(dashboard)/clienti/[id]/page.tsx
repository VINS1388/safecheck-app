import Link from "next/link";
import { notFound } from "next/navigation";
import { getClienteById } from "@/lib/db/queries/clienti";
import { getVisiteByCliente, type VisitaRiepilogo } from "@/lib/db/queries/visite";
import { formatDate } from "@/lib/utils";
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

  const visite = await getVisiteByCliente(id);
  const bozze = visite.filter((v) => v.stato === "bozza").length;
  const generati = visite.filter((v) => v.numero_verbale != null).length;

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

      {/* Sedi */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Sedi</h2>
        <Link
          href={`/clienti/${cliente.id}/sedi/nuova`}
          className="rounded-lg border border-[#1e3a5f] px-3 py-2 text-sm font-semibold text-[#1e3a5f] transition hover:bg-[#1e3a5f] hover:text-white"
        >
          + Nuova sede
        </Link>
      </div>

      {cliente.sedi.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
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
              className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{s.nome}</p>
                <p className="text-sm text-gray-600">
                  {s.indirizzo}
                  {s.citta ? `, ${s.citta}` : ""}
                </p>
              </div>
              <form action={nuovaVisitaAction.bind(null, cliente.id, s.id)}>
                <button
                  type="submit"
                  className="min-h-[48px] w-full rounded-lg bg-[#1e3a5f] px-4 text-sm font-semibold text-white transition hover:bg-[#16304e] sm:w-auto"
                >
                  Nuova visita
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* Verbali */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-gray-900">Verbali</h2>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <Kpi etichetta="Totale visite" valore={visite.length} />
          <Kpi etichetta="In bozza" valore={bozze} colore="blue" />
          <Kpi etichetta="Verbali generati" valore={generati} colore="green" />
        </div>

        {visite.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
            <p className="text-sm font-medium text-gray-900">Nessun verbale</p>
            <p className="mt-1 text-sm text-gray-500">
              Avvia un sopralluogo da una sede per generare il primo verbale.
            </p>
          </div>
        ) : (
          <>
            {/* Card stack — mobile */}
            <div className="mt-4 space-y-3 sm:hidden">
              {visite.map((v) => (
                <VerbaleCard key={v.id} v={v} />
              ))}
            </div>

            {/* Tabella — desktop */}
            <div className="mt-4 hidden overflow-hidden rounded-xl border border-gray-200 bg-white sm:block">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Sede</th>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Verbale</th>
                    <th className="px-4 py-3 text-right font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visite.map((v) => (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{v.sede_nome}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatDate(v.data_visita)}
                      </td>
                      <td className="px-4 py-3">
                        <BadgeVerbale v={v} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AzioniVerbale v={v} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function BadgeVerbale({ v }: { v: VisitaRiepilogo }) {
  if (v.numero_verbale != null) {
    return (
      <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
        {v.numero_verbale}
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
      Bozza
    </span>
  );
}

function AzioniVerbale({ v }: { v: VisitaRiepilogo }) {
  if (v.numero_verbale != null) {
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

function VerbaleCard({ v }: { v: VisitaRiepilogo }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{v.sede_nome}</p>
          <p className="text-xs text-gray-500">{formatDate(v.data_visita)}</p>
        </div>
        <BadgeVerbale v={v} />
      </div>
      <div className="mt-3 border-t border-gray-100 pt-3 text-right">
        <AzioniVerbale v={v} />
      </div>
    </div>
  );
}

function Kpi({
  etichetta,
  valore,
  colore = "slate",
}: {
  etichetta: string;
  valore: number;
  colore?: "slate" | "blue" | "green";
}) {
  const stili = {
    slate: "text-gray-900",
    blue: "text-blue-600",
    green: "text-green-600",
  } as const;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-center">
      <div className={`text-2xl font-bold ${stili[colore]}`}>{valore}</div>
      <div className="text-xs text-gray-500">{etichetta}</div>
    </div>
  );
}
