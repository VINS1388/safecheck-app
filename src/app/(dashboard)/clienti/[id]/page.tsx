import Link from "next/link";
import { notFound } from "next/navigation";
import { getClienteById } from "@/lib/db/queries/clienti";
import { getVisiteByCliente, type VisitaRiepilogo } from "@/lib/db/queries/visite";
import { getPianificazione } from "@/lib/db/queries/pianificazione";
import { formatDate } from "@/lib/utils";
import StatoBadge, { statoVerbaleUI } from "@/components/ui/StatoBadge";
import EmptyState from "@/components/ui/EmptyState";
import AzioniVerbale from "../../visite/AzioniVerbale";
import { nuovaVisitaAction } from "./sedi/[sedeId]/nuova-visita/actions";
import { eliminaSedeAction, impostaSedePrincipaleAction } from "./sedi/actions";

export default async function ClienteDettaglioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { id } = await params;
  const { msg, err } = await searchParams;

  const cliente = await getClienteById(id);
  if (!cliente) notFound();

  const [visite, slots] = await Promise.all([getVisiteByCliente(id), getPianificazione()]);
  const bozze = visite.filter((v) => v.stato === "bozza").length;
  const generati = visite.filter((v) => v.stato_verbale === "chiuso").length;

  // Riepilogo operativo per sede (dai dati già caricati: nessuna query extra).
  const ultimaVisitaPerSede = new Map<string, VisitaRiepilogo>();
  const nVisitePerSede = new Map<string, number>();
  for (const v of visite) {
    nVisitePerSede.set(v.sede_id, (nVisitePerSede.get(v.sede_id) ?? 0) + 1);
    if (!ultimaVisitaPerSede.has(v.sede_id)) ultimaVisitaPerSede.set(v.sede_id, v); // visite già ordinate desc
  }
  const prossimaSlotPerSede = new Map<string, { data: string; suggerita: boolean }>();
  for (const s of slots) {
    if (s.stato === "eseguita" || prossimaSlotPerSede.has(s.sedeId)) continue; // slots già ordinati per data
    prossimaSlotPerSede.set(s.sedeId, {
      data: s.dataPianificata ?? s.dataSuggerita,
      suggerita: s.dataPianificata == null,
    });
  }

  const anagrafica: [string, string | null][] = [
    ["P.IVA", cliente.partita_iva],
    ["Codice fiscale", cliente.codice_fiscale],
    ["Indirizzo sede legale", cliente.indirizzo_sede_legale],
    [
      "Città",
      [cliente.cap, cliente.citta, cliente.provincia ? `(${cliente.provincia})` : null]
        .filter(Boolean)
        .join(" ") || null,
    ],
    ["Referente", cliente.referente_principale],
    ["Telefono", cliente.telefono_referente],
    ["Email", cliente.email_referente],
  ];

  return (
    <main className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link href="/clienti" className="text-sm text-[#1e3a5f] hover:underline">
          ← Clienti
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{cliente.ragione_sociale}</h1>
            <p className="text-sm text-gray-600">
              {[cliente.citta, cliente.provincia].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <Link
            href={`/clienti/${cliente.id}/modifica`}
            className="flex-shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Modifica cliente
          </Link>
        </div>
      </div>

      {msg && (
        <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">{msg}</p>
      )}
      {err && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{err}</p>
      )}

      {/* KPI sintetici */}
      <div className="mb-8 grid grid-cols-3 gap-3">
        <Kpi etichetta="Totale visite" valore={visite.length} />
        <Kpi etichetta="In bozza" valore={bozze} colore={bozze > 0 ? "amber" : "slate"} />
        <Kpi etichetta="Verbali generati" valore={generati} colore="green" />
      </div>

      {/* Anagrafica / sede legale */}
      <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Sede legale</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {anagrafica.map(([label, valore]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-gray-50 py-1">
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="text-right text-sm text-gray-900">{valore || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Sedi operative */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Sedi operative</h2>
        <Link
          href={`/clienti/${cliente.id}/sedi/nuova`}
          className="rounded-lg border border-[#1e3a5f] px-3 py-2 text-sm font-semibold text-[#1e3a5f] transition hover:bg-[#1e3a5f] hover:text-white"
        >
          + Nuova sede
        </Link>
      </div>

      {cliente.sedi.length === 0 ? (
        <EmptyState
          titolo="Nessuna sede"
          descrizione="Aggiungi una sede operativa per avviare un sopralluogo."
          ctaHref={`/clienti/${cliente.id}/sedi/nuova`}
          ctaLabel="+ Nuova sede"
        />
      ) : (
        <div className="space-y-3">
          {cliente.sedi.map((s) => {
            const nVisite = nVisitePerSede.get(s.id) ?? 0;
            const ultima = ultimaVisitaPerSede.get(s.id);
            const prossima = prossimaSlotPerSede.get(s.id);
            return (
              <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/clienti/${cliente.id}/sedi/${s.id}`} className="font-medium text-gray-900 hover:underline">
                        {s.nome}
                      </Link>
                      {s.principale && (
                        <span className="rounded-full bg-[#1e3a5f]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1e3a5f]">
                          Principale
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      {s.indirizzo}
                      {s.citta ? `, ${s.citta}` : ""}
                      {s.provincia ? ` (${s.provincia})` : ""}
                    </p>
                    {/* Riepilogo operativo */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      {ultima ? (
                        <span className="inline-flex items-center gap-1">
                          Ultima: <StatoBadge statoVerbale={ultima.stato_verbale} numeroVerbale={ultima.numero_verbale} /> ·{" "}
                          {formatDate(ultima.data_visita)}
                        </span>
                      ) : (
                        <span>Nessuna visita</span>
                      )}
                      {prossima && (
                        <span>
                          Prossima: <span className="font-medium text-gray-700">{formatDate(prossima.data)}</span>
                          {prossima.suggerita ? " (suggerita)" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <form action={nuovaVisitaAction.bind(null, cliente.id, s.id)}>
                    <button
                      type="submit"
                      className="min-h-[44px] w-full rounded-lg bg-[#1e3a5f] px-4 text-sm font-semibold text-white transition hover:bg-[#16304e] sm:w-auto"
                    >
                      Nuova visita
                    </button>
                  </form>
                </div>

                {/* Azioni gestione sede */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-3 text-sm">
                  <Link href={`/clienti/${cliente.id}/sedi/${s.id}`} className="font-medium text-[#1e3a5f] hover:underline">
                    Apri sede
                  </Link>
                  <Link
                    href={`/clienti/${cliente.id}/sedi/${s.id}/modifica`}
                    className="font-medium text-gray-600 hover:underline"
                  >
                    Modifica
                  </Link>
                  {!s.principale && (
                    <form action={impostaSedePrincipaleAction.bind(null, cliente.id, s.id)}>
                      <button type="submit" className="font-medium text-gray-600 hover:underline">
                        Imposta principale
                      </button>
                    </form>
                  )}
                  {nVisite > 0 ? (
                    <span
                      title="Non eliminabile: ci sono visite collegate (integrità storica)."
                      className="cursor-not-allowed text-gray-300"
                    >
                      Elimina
                    </span>
                  ) : (
                    <form action={eliminaSedeAction.bind(null, cliente.id, s.id)}>
                      <button type="submit" className="font-medium text-red-600 hover:underline">
                        Elimina
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Verbali */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-gray-900">Verbali</h2>
        {visite.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              titolo="Nessun verbale"
              descrizione="Avvia un sopralluogo da una sede per generare il primo verbale."
            />
          </div>
        ) : (
          <>
            {/* Card stack — mobile */}
            <div className="mt-4 space-y-3 sm:hidden">
              {visite.map((v) => (
                <div key={v.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{v.sede_nome}</p>
                      <p className="text-xs text-gray-500">{formatDate(v.data_visita)}</p>
                    </div>
                    <StatoBadge statoVerbale={v.stato_verbale} numeroVerbale={v.numero_verbale} />
                  </div>
                  <div className="mt-3 border-t border-gray-100 pt-3 text-right">
                    <AzioniVerbale visitaId={v.id} stato={statoVerbaleUI(v)} />
                  </div>
                </div>
              ))}
            </div>

            {/* Tabella — desktop */}
            <div className="mt-4 hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:block">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Stato</th>
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
      </div>
    </main>
  );
}

function Kpi({
  etichetta,
  valore,
  colore = "slate",
}: {
  etichetta: string;
  valore: number;
  colore?: "slate" | "amber" | "green";
}) {
  const stili = {
    slate: "text-gray-900",
    amber: "text-amber-600",
    green: "text-green-600",
  } as const;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-center shadow-sm">
      <div className={`text-2xl font-bold ${stili[colore]}`}>{valore}</div>
      <div className="text-xs text-gray-500">{etichetta}</div>
    </div>
  );
}
