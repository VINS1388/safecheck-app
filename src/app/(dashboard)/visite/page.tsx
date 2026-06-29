import Link from "next/link";
import { getVisiteUtente, type StatoVisita } from "@/lib/db/queries/visite";
import { formatDate } from "@/lib/utils";

const STILE_STATO: Record<StatoVisita, string> = {
  pianificata: "bg-gray-100 text-gray-700",
  in_corso: "bg-blue-100 text-blue-700",
  bozza: "bg-amber-100 text-amber-800",
  completata: "bg-green-100 text-green-700",
  verbale_generato: "bg-[#1e3a5f] text-white",
};

const ETICHETTA_STATO: Record<StatoVisita, string> = {
  pianificata: "Pianificata",
  in_corso: "In corso",
  bozza: "Bozza",
  completata: "Completata",
  verbale_generato: "Verbale generato",
};

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
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-900">Nessuna visita</p>
          <p className="mt-1 text-sm text-gray-500">
            Apri la scheda di un cliente e avvia una{" "}
            <span className="font-medium">Nuova visita</span> da una delle sue
            sedi.
          </p>
          <Link
            href="/clienti"
            className="mt-4 inline-block rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Vai ai clienti
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Azienda</th>
                <th className="px-4 py-3 font-medium">Sede</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Stato</th>
                <th className="px-4 py-3 text-right font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visite.map((v) => {
                const leggibile =
                  v.stato === "completata" || v.stato === "verbale_generato";
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
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STILE_STATO[v.stato]}`}
                      >
                        {ETICHETTA_STATO[v.stato]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/visite/${v.id}/${leggibile ? "riepilogo" : "checklist"}`}
                        className="font-medium text-[#1e3a5f] hover:underline"
                      >
                        {leggibile ? "Leggi" : "Continua"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
