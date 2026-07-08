import Link from "next/link";
import { notFound } from "next/navigation";
import { getClienteById } from "@/lib/db/queries/clienti";
import { getSedeById } from "@/lib/db/queries/sedi";
import { getVisiteBySede } from "@/lib/db/queries/visite";
import { getPianoBySede, getSlotByPianoCiclo, getTecnici, getSlotProponibiliBySede } from "@/lib/db/queries/pianificazione";
import { getModuliSede, getModuliSelezionabiliVisita } from "@/lib/db/queries/moduli";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManagePlanning } from "@/lib/auth/rbac";
import { formatDate } from "@/lib/utils";
import { ETICHETTE_STATO_SLOT } from "@/types";
import StatoBadge, { statoVerbaleUI, type StatoVerbaleUI } from "@/components/ui/StatoBadge";
import EmptyState from "@/components/ui/EmptyState";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { buttonClasses } from "@/components/ui/Button";
import AzioniVerbale from "../../../../visite/AzioniVerbale";
import type { VisitaRiepilogo } from "@/lib/db/queries/visite";
import { nuovaVisitaAction } from "./nuova-visita/actions";
import NuovaVisitaConSlot from "./NuovaVisitaConSlot";
import ServiziAttivi from "./ServiziAttivi";
import DuplicaUltimo from "./DuplicaUltimo";

export default async function SedeDettaglioPage({
  params,
}: {
  params: Promise<{ id: string; sedeId: string }>;
}) {
  const { id, sedeId } = await params;

  const sede = await getSedeById(sedeId);
  if (!sede || sede.cliente_id !== id) notFound();

  const [cliente, visite, piano, tecnici, slotProponibili, { user }, moduliSede, moduliSelezionabili, canManage] = await Promise.all([
    getClienteById(id),
    getVisiteBySede(sedeId),
    getPianoBySede(sedeId),
    getTecnici(),
    getSlotProponibiliBySede(sedeId),
    getCurrentUser(),
    getModuliSede(sedeId),
    getModuliSelezionabiliVisita(sedeId),
    canManagePlanning(),
  ]);
  // Selettore tipologia solo se la sede offre >1 modulo (Sprint HACCP 2, C5).
  const moduliOpzioni = moduliSelezionabili.map((m) => ({ id: m.id, nomeBreve: m.nomeBreve }));
  const slots = piano ? await getSlotByPianoCiclo(piano.id, piano.cicloCorrente) : [];
  const prossimoSlot = slots.find((s) => s.stato !== "eseguita") ?? null;
  const tecnicoNome = piano?.tecnicoAssegnatoId
    ? tecnici.find((t) => t.id === piano.tecnicoAssegnatoId)?.nomeCompleto ?? null
    : null;

  const ultimoChiuso = visite.find((v) => v.stato_verbale === "chiuso") ?? null;

  return (
    <main className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link href={`/clienti/${id}`} className="text-sm text-brand hover:underline">
          ← {cliente?.ragione_sociale ?? "Scheda cliente"}
        </Link>
        <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-900">{sede.nome}</h1>
              {sede.principale && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                  Principale
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">
              {sede.indirizzo}
              {sede.citta ? `, ${sede.citta}` : ""}
              {sede.provincia ? ` (${sede.provincia})` : ""}
            </p>
            {(sede.referente_sede || sede.telefono_referente) && (
              <p className="mt-0.5 text-xs text-gray-500">
                {[sede.referente_sede, sede.telefono_referente].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <Link
            href={`/clienti/${id}/sedi/${sedeId}/modifica`}
            className={`flex-shrink-0 ${buttonClasses("secondary")}`}
          >
            Modifica sede
          </Link>
        </div>
      </div>

      {/* Nuova visita: selettore slot se la sede ha visite pianificate proponibili,
          altrimenti creazione diretta "fuori piano" (zero frizione). */}
      <div className="mb-8 space-y-3">
        {user && (slotProponibili.length > 0 || moduliOpzioni.length > 1) ? (
          // Con slot proponibili OPPURE >1 modulo: componente con scelta slot e/o
          // tipologia (fuori piano). Con >1 modulo e 0 slot mostra solo fuori piano.
          <NuovaVisitaConSlot
            clienteId={id}
            sedeId={sedeId}
            slots={slotProponibili}
            currentUserId={user.id}
            moduli={moduliOpzioni}
          />
        ) : (
          // Sede mono-modulo senza slot proponibili: creazione diretta (invariato).
          <form action={nuovaVisitaAction.bind(null, id, sedeId, moduliOpzioni[0]?.id)}>
            <button type="submit" className={buttonClasses("primary")}>
              Nuova visita
            </button>
          </form>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {ultimoChiuso && <DuplicaUltimo visitaId={ultimoChiuso.id} />}
          <Link href="/visite" className={buttonClasses("secondary")}>
            Apri archivio
          </Link>
          <Link href="/pianificazione" className={buttonClasses("secondary")}>
            Apri pianificazione
          </Link>
        </div>
      </div>

      {/* Servizi attivi (moduli) — toggle admin/planner, sola lettura tecnico */}
      <ServiziAttivi clienteId={id} sedeId={sedeId} moduli={moduliSede} canManage={canManage} />

      {/* Piano visite (se configurato) */}
      {piano && (
        <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Piano visite</h2>
            <Link
              href={`/clienti/${id}/sedi/${sedeId}/modifica`}
              className="text-xs font-medium text-brand hover:underline"
            >
              Configura →
            </Link>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {piano.visiteAnno} visite/anno · ciclo {piano.cicloCorrente}
            {tecnicoNome ? ` · ${tecnicoNome}` : ""}
          </p>
          {prossimoSlot ? (
            <p className="mt-2 text-sm">
              <span className="text-gray-500">Prossima pianificata:</span>{" "}
              <span className="font-medium text-gray-900">
                {formatDate(prossimoSlot.dataPianificata ?? prossimoSlot.dataSuggerita)}
              </span>{" "}
              <span className="text-xs text-gray-400">({ETICHETTE_STATO_SLOT[prossimoSlot.stato]})</span>
              {prossimoSlot.visitaId && (
                <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                  bozza in corso
                </span>
              )}
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-500">Ciclo corrente completato.</p>
          )}
        </section>
      )}

      {/* Visite collegate — stesso pattern canonico di /visite (DataTable +
          AzioniVerbale). Il link "Briefing" (raggiungibile solo da qui) resta
          come azione aggiuntiva sulle bozze. */}
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Visite e verbali</h2>
      <VerbaliSede visite={visite} />
    </main>
  );
}

function AzioniSede({ v }: { v: VisitaRiepilogo }) {
  const stato: StatoVerbaleUI = statoVerbaleUI(v);
  return (
    <div className="inline-flex items-center justify-end gap-4">
      {stato === "bozza" && (
        <Link href={`/visite/${v.id}/briefing`} className="font-medium text-gray-600 hover:underline">
          Briefing
        </Link>
      )}
      <AzioniVerbale visitaId={v.id} stato={stato} />
    </div>
  );
}

function VerbaliSede({ visite }: { visite: VisitaRiepilogo[] }) {
  const columns: Column<VisitaRiepilogo>[] = [
    {
      header: "Stato",
      cell: (v) => <StatoBadge statoVerbale={v.stato_verbale} numeroVerbale={v.numero_verbale} />,
    },
    { header: "Data", className: "text-gray-700", cell: (v) => formatDate(v.data_visita) },
    { header: "Azioni", align: "right", cell: (v) => <AzioniSede v={v} /> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={visite}
      keyOf={(v) => v.id}
      renderCard={(v) => (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <StatoBadge statoVerbale={v.stato_verbale} numeroVerbale={v.numero_verbale} />
              <p className="mt-1 text-sm text-gray-500">{formatDate(v.data_visita)}</p>
            </div>
          </div>
          <div className="mt-3 border-t border-gray-100 pt-3 text-right">
            <AzioniSede v={v} />
          </div>
        </div>
      )}
      vuoto={
        <EmptyState
          titolo="Nessuna visita per questa sede"
          descrizione="Avvia il primo sopralluogo con il pulsante “Nuova visita”."
        />
      }
    />
  );
}
