import Link from "next/link";
import { notFound } from "next/navigation";
import { getVisitaById, getVisiteBySede } from "@/lib/db/queries/visite";
import { getPianificazione } from "@/lib/db/queries/pianificazione";
import { formatDate } from "@/lib/utils";
import { ETICHETTE_STATO_SLOT } from "@/types";
import StatoBadge from "@/components/ui/StatoBadge";

// Briefing pre-sopralluogo (Sprint 15.1, P2.1). Server component, nessun stato,
// nessuna logica di blocco: dati mancanti → "—" o campo omesso, mai errore.
// Non è obbligatorio nel flusso: il tecnico può andare diretto alla checklist.

export default async function BriefingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const visita = await getVisitaById(id);
  if (!visita) notFound();

  const [sedeVisite, slots] = await Promise.all([
    getVisiteBySede(visita.sede_id),
    getPianificazione(),
  ]);

  const ultimoChiuso = sedeVisite.find((v) => v.id !== id && v.stato_verbale === "chiuso") ?? null;
  const bozzaAperta = sedeVisite.find((v) => v.id !== id && v.stato === "bozza") ?? null;
  const prossimaSlot =
    slots.find((s) => s.sedeId === visita.sede_id && s.stato !== "eseguita") ?? null;

  return (
    <main className="mx-auto max-w-xl">
      <div className="mb-6">
        <Link href={`/clienti/${visita.cliente_id}/sedi/${visita.sede_id}`} className="text-sm text-[#1e3a5f] hover:underline">
          ← Scheda sede
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Briefing sopralluogo</h1>
        <p className="mt-1 text-sm text-gray-500">Riepilogo di contesto prima di iniziare in campo.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        {/* Gerarchia: cliente → sede → data */}
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Cliente</p>
        <p className="text-lg font-semibold text-gray-900">{visita.cliente_nome || "—"}</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo etichetta="Sede">
            <span className="font-medium text-gray-900">{visita.sede_nome || "—"}</span>
            {(visita.sede_indirizzo || visita.sede_citta) && (
              <span className="block text-sm text-gray-600">
                {[visita.sede_indirizzo, visita.sede_citta].filter(Boolean).join(", ")}
              </span>
            )}
          </Campo>
          <Campo etichetta="Data visita">
            <span className="font-medium text-gray-900">{formatDate(visita.data_visita)}</span>
            {visita.ora_inizio && <span className="block text-sm text-gray-600">ore {visita.ora_inizio.slice(0, 5)}</span>}
          </Campo>
        </div>

        {/* Contesto storico */}
        <div className="mt-5 space-y-3 border-t border-gray-100 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Contesto</p>

          <Contesto etichetta="Ultimo verbale chiuso">
            {ultimoChiuso ? (
              <Link href={`/visite/${ultimoChiuso.id}/riepilogo`} className="inline-flex items-center gap-2 text-[#1e3a5f] hover:underline">
                <StatoBadge statoVerbale={ultimoChiuso.stato_verbale} numeroVerbale={ultimoChiuso.numero_verbale} />
                <span className="text-sm">{formatDate(ultimoChiuso.data_visita)}</span>
              </Link>
            ) : (
              <span className="text-sm text-gray-400">—</span>
            )}
          </Contesto>

          {bozzaAperta && (
            <Contesto etichetta="Bozza aperta">
              <Link href={`/visite/${bozzaAperta.id}/avvia`} className="text-sm text-[#1e3a5f] hover:underline">
                Riprendi bozza del {formatDate(bozzaAperta.data_visita)}
              </Link>
            </Contesto>
          )}

          <Contesto etichetta="Prossima visita pianificata">
            {prossimaSlot ? (
              <span className="text-sm text-gray-900">
                {formatDate(prossimaSlot.dataPianificata ?? prossimaSlot.dataSuggerita)}{" "}
                <span className="text-xs text-gray-400">({ETICHETTE_STATO_SLOT[prossimaSlot.stato]})</span>
              </span>
            ) : (
              <span className="text-sm text-gray-400">—</span>
            )}
          </Contesto>
        </div>

        {/* Unica call-to-action */}
        <div className="mt-6">
          <Link
            href={`/visite/${id}/checklist`}
            className="flex min-h-[48px] w-full items-center justify-center rounded-lg bg-[#1e3a5f] text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Inizia sopralluogo
          </Link>
        </div>
      </div>
    </main>
  );
}

function Campo({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{etichetta}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Contesto({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-500">{etichetta}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}
