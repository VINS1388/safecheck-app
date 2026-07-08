import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getDashboardTecnico,
  getDashboardGestione,
  type BozzaRiga,
  type SlotRigaDash,
  type VisitaRiga,
  type CoperturaRiga,
  type CaricoRiga,
  type RilievoRiga,
} from "@/lib/server/dashboard";
import { parseFiltri, rangePeriodo } from "@/lib/filters";
import { formatDate } from "@/lib/utils";
import EmptyState from "@/components/ui/EmptyState";
import StatoBadge from "@/components/ui/StatoBadge";
import FilterBar from "@/components/filters/FilterBar";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { user, profilo } = await getCurrentUser();
  const nome = profilo?.nome_completo ?? user?.email ?? "Utente";
  const ruolo = profilo?.ruolo ?? "specialist";
  const oggi = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Benvenuto, {nome}</h1>
          <p className="mt-1 text-sm text-gray-500">Cosa richiede la tua attenzione adesso.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CTA href="/clienti" primario>
            Nuova visita
          </CTA>
          <CTA href="/pianificazione">Pianificazione</CTA>
          <CTA href="/visite">Archivio verbali</CTA>
        </div>
      </div>

      {ruolo === "specialist" ? (
        <TecnicoView data={await getDashboardTecnico(user!.id, oggi)} />
      ) : (
        <GestioneView
          data={await getDashboardGestione(ruolo as "planner" | "admin", oggi, rangePeriodo(parseFiltri(sp), oggi))}
          filtri={parseFiltri(sp)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════ TECNICO ══════════════════════════════
function TecnicoView({
  data,
}: {
  data: Awaited<ReturnType<typeof getDashboardTecnico>>;
}) {
  const agendaVuota =
    !data.prossima && data.inRitardo.totale === 0 && data.oggi.totale === 0 && data.settimana.totale === 0;

  return (
    <div className="mt-8 space-y-6">
      {/* Prossima visita in evidenza — la call-to-action del tecnico */}
      {data.prossima && <ProssimaCard s={data.prossima} />}

      {/* Agenda a bucket — sostituisce la finestra piatta 14gg */}
      {data.inRitardo.totale > 0 && (
        <Blocco titolo="In ritardo" contatore={data.inRitardo.totale} sottotitolo="data pianificata già passata" href="/pianificazione">
          <ul className="space-y-2">{data.inRitardo.righe.map((s) => <SlotItem key={s.id} s={s} />)}</ul>
        </Blocco>
      )}

      <Blocco titolo="Oggi" contatore={data.oggi.totale} href="/pianificazione">
        {data.oggi.righe.length === 0 ? (
          <EmptyState compatto titolo="Niente in agenda per oggi" />
        ) : (
          <ul className="space-y-2">{data.oggi.righe.map((s) => <SlotItem key={s.id} s={s} />)}</ul>
        )}
      </Blocco>

      <Blocco titolo="Questa settimana" contatore={data.settimana.totale} sottotitolo="prossimi 7 giorni" href="/pianificazione">
        {data.settimana.righe.length === 0 ? (
          <EmptyState compatto titolo="Nessuna visita nei prossimi 7 giorni" />
        ) : (
          <ul className="space-y-2">{data.settimana.righe.map((s) => <SlotItem key={s.id} s={s} />)}</ul>
        )}
      </Blocco>

      {agendaVuota && (
        <EmptyState titolo="Agenda libera" descrizione="Non hai visite in ritardo, oggi o nei prossimi 7 giorni." />
      )}

      <Blocco titolo="Da completare" contatore={data.daCompletare.totale} href="/visite?stato=bozza">
        {data.daCompletare.righe.length === 0 ? (
          <EmptyState compatto titolo="Nessuna bozza aperta" descrizione="Avvia un sopralluogo da una sede per iniziare un verbale." ctaHref="/clienti" ctaLabel="Vai ai clienti" />
        ) : (
          <ul className="space-y-2">{data.daCompletare.righe.map((b) => <BozzaItem key={b.id} b={b} />)}</ul>
        )}
      </Blocco>

      <Blocco titolo="Chiuse di recente" href="/visite">
        {data.chiuse.length === 0 ? (
          <EmptyState compatto titolo="Nessun verbale chiuso" />
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {data.chiuse.map((v) => <ChiusaItem key={v.id} v={v} />)}
          </ul>
        )}
      </Blocco>

      <RilieviBlocco rilievi={data.rilievi} />

      {/* Sezione SECONDARIA, in fondo — visibile solo se ci sono slot prendibili.
          Isolata e facilmente disattivabile (diventerà preferenza organizzativa). */}
      {data.slotDisponibili.length > 0 && (
        <Blocco titolo="Slot disponibili" sottotitolo="che puoi prendere in carico">
          <ul className="space-y-2">
            {data.slotDisponibili.map((s) => (
              <li key={s.id}>
                <Link href={`/clienti/${s.clienteId}/sedi/${s.sedeId}`} className="flex min-h-[48px] items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{s.clienteNome}</p>
                    <p className="truncate text-xs text-gray-500">{s.sedeNome}</p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-gray-500">{formatDate(s.dataEff)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Blocco>
      )}
    </div>
  );
}

// ══════════════════════════════════ GESTIONE (planner/admin) ═════════════════
function GestioneView({
  data,
  filtri,
}: {
  data: Awaited<ReturnType<typeof getDashboardGestione>>;
  filtri: ReturnType<typeof parseFiltri>;
}) {
  return (
    <div className="mt-6">
      {/* Selettore periodo (guida Carico tecnici e, per l'admin, i KPI temporali) */}
      <FilterBar config={{ periodo: true }} filtri={filtri} periodoDefault="30gg" />

      {/* Fascia KPI admin (temporale, guidata dal periodo) */}
      {data.kpi && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi etichetta="Visite chiuse" valore={data.kpi.visiteChiuse} sotto="nel periodo" />
          <Kpi etichetta="NC rilevate" valore={data.kpi.ncRilevate} colore="red" sotto="nel periodo" info="Non conformità nei verbali chiusi del periodo (standard + per-impresa). Non è il conteggio delle NC ancora da risolvere." />
          <Kpi etichetta="Bozze aperte" valore={data.kpi.bozzeAperte} sotto="stato corrente" />
          <Kpi etichetta="Slot scoperti" valore={data.kpi.slotScoperti} colore="amber" sotto="stato corrente" />
        </div>
      )}

      {/* Fascia KPI planner (snapshot operativo — indipendente dal periodo) */}
      {data.plannerKpi && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi etichetta="Slot scoperti" valore={data.plannerKpi.slotScoperti} colore="amber" sotto="senza tecnico" />
          <Kpi etichetta="Slot in ritardo" valore={data.plannerKpi.slotInRitardo} colore="red" sotto="data già passata" />
          <Kpi etichetta="Sedi in ritardo" valore={data.plannerKpi.sediInRitardo} colore="red" sotto="stato corrente" />
          <Kpi etichetta="Bozze vecchie" valore={data.plannerKpi.bozzeVecchie} colore="amber" sotto="oltre 7 giorni" />
        </div>
      )}

      <div className="space-y-6">
        <Blocco titolo="Slot da assegnare" contatore={data.slotDaAssegnare.totale} href="/pianificazione?stato=da_assegnare">
          {data.slotDaAssegnare.righe.length === 0 ? (
            <EmptyState compatto titolo="Tutti gli slot sono assegnati" />
          ) : (
            <ul className="space-y-2">{data.slotDaAssegnare.righe.map((s) => <SlotItem key={s.id} s={s} daAssegnare />)}</ul>
          )}
        </Blocco>

        <Blocco titolo="Copertura piani" contatore={data.copertura.totale} sottotitolo="sedi con slot scoperti o in ritardo">
          {data.copertura.righe.length === 0 ? (
            <EmptyState compatto titolo="Copertura completa" descrizione="Nessuna sede con slot scoperti o in ritardo." />
          ) : (
            <ul className="space-y-2">{data.copertura.righe.map((c) => <CoperturaItem key={c.sedeId} c={c} />)}</ul>
          )}
        </Blocco>

        <Blocco titolo="Carico tecnici" sottotitolo="visite assegnate nel periodo">
          {data.carico.length === 0 ? (
            <EmptyState compatto titolo="Nessuna assegnazione nel periodo" />
          ) : (
            <ul className="space-y-2">{data.carico.map((t) => <CaricoItem key={t.tecnicoId} t={t} />)}</ul>
          )}
        </Blocco>

        <Blocco titolo="Bozze vecchie" contatore={data.bozzeVecchie.totale} sottotitolo="aperte da oltre 7 giorni" href="/visite?stato=bozza">
          {data.bozzeVecchie.righe.length === 0 ? (
            <EmptyState compatto titolo="Nessuna bozza in ritardo" />
          ) : (
            <ul className="space-y-2">{data.bozzeVecchie.righe.map((b) => <BozzaItem key={b.id} b={b} />)}</ul>
          )}
        </Blocco>

        <RilieviBlocco rilievi={data.rilievi} />
      </div>
    </div>
  );
}

// ── Item riga ────────────────────────────────────────────────────────────────
function ProssimaCard({ s }: { s: SlotRigaDash }) {
  return (
    <section>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Prossima visita</p>
      <Link
        href={`/clienti/${s.clienteId}/sedi/${s.sedeId}`}
        className="flex min-h-[64px] items-center justify-between gap-3 rounded-xl bg-brand p-4 text-white shadow-sm transition hover:bg-brand-hover"
      >
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{s.clienteNome}</p>
          <p className="truncate text-sm text-white/80">{s.sedeNome}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className={`text-sm font-semibold ${s.scaduta ? "text-red-200" : "text-white"}`}>{formatDate(s.dataEff)}</p>
          <span className="text-xs text-white/70">Apri sede →</span>
        </div>
      </Link>
    </section>
  );
}

function BozzaItem({ b }: { b: BozzaRiga }) {
  return (
    <li>
      <Link href={`/visite/${b.id}/avvia`} className="flex min-h-[48px] items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{b.clienteNome}</p>
          <p className="truncate text-xs text-gray-500">
            {b.sedeNome} · {formatDate(b.dataVisita)}
            {b.vecchia && <span className="ml-1 font-medium text-amber-600">· aperta da {b.giorni} giorni</span>}
          </p>
        </div>
        <span className="flex-shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">Riprendi</span>
      </Link>
    </li>
  );
}

function SlotItem({ s, daAssegnare }: { s: SlotRigaDash; daAssegnare?: boolean }) {
  return (
    <li className="flex min-h-[48px] items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{s.clienteNome}</p>
        <p className="truncate text-xs text-gray-500">{s.sedeNome}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className={`text-sm font-medium ${s.scaduta ? "text-red-600" : "text-gray-800"}`}>{formatDate(s.dataEff)}</p>
        {daAssegnare && <span className="text-[11px] font-semibold text-amber-600">Da assegnare</span>}
      </div>
    </li>
  );
}

function ChiusaItem({ v }: { v: VisitaRiga }) {
  return (
    <li className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{v.clienteNome}</p>
        <p className="truncate text-xs text-gray-500">{v.sedeNome} · {formatDate(v.dataVisita)}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <StatoBadge statoVerbale={v.statoVerbale} numeroVerbale={v.numeroVerbale} />
        <Link href={`/visite/${v.id}/riepilogo`} className="text-sm font-medium text-brand hover:underline">Apri</Link>
      </div>
    </li>
  );
}

function CoperturaItem({ c }: { c: CoperturaRiga }) {
  return (
    <li>
      <Link href={`/pianificazione?sede=${c.sedeId}`} className="flex min-h-[48px] items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{c.clienteNome}</p>
          <p className="truncate text-xs text-gray-500">{c.sedeNome}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 text-xs">
          {c.scoperti > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">{c.scoperti} scoperti</span>}
          {c.inRitardo > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">{c.inRitardo} in ritardo</span>}
        </div>
      </Link>
    </li>
  );
}

function CaricoItem({ t }: { t: CaricoRiga }) {
  return (
    <li>
      <Link href={`/pianificazione?tecnico=${t.tecnicoId}`} className="flex min-h-[48px] items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
        <p className="truncate text-sm font-medium text-gray-900">{t.tecnicoNome}</p>
        <span className="flex-shrink-0 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">{t.assegnate} visite</span>
      </Link>
    </li>
  );
}

// Feed SOLO INFORMATIVO dei rilievi (NC/PC) nei verbali generati di recente.
// Nessuna semantica di stato/presa in carico/scadenza: si apre il verbale in
// consultazione. Etichetta fissa: "Rilievi recenti" (vedi mandato S4).
function RilieviBlocco({ rilievi }: { rilievi: RilievoRiga[] }) {
  if (rilievi.length === 0) return null;
  return (
    <Blocco titolo="Rilievi recenti" sottotitolo="NC e PC nei verbali generati di recente — solo consultazione">
      <ul className="space-y-2">{rilievi.map((r) => <RilievoItem key={r.visitaId} r={r} />)}</ul>
    </Blocco>
  );
}

function RilievoItem({ r }: { r: RilievoRiga }) {
  return (
    <li>
      <Link href={`/visite/${r.visitaId}/riepilogo`} className="flex min-h-[48px] items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{r.clienteNome}</p>
          <p className="truncate text-xs text-gray-500">
            {r.sedeNome} · {r.numeroVerbale ?? "—"} · {formatDate(r.dataVisita)}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 text-xs">
          {r.nc > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">{r.nc} NC</span>}
          {r.pc > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">{r.pc} PC</span>}
        </div>
      </Link>
    </li>
  );
}

// ── Primitive UI ─────────────────────────────────────────────────────────────
function CTA({ href, children, primario }: { href: string; children: React.ReactNode; primario?: boolean }) {
  return (
    <Link
      href={href}
      className={
        primario
          ? "flex min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover"
          : "flex min-h-[44px] items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
      }
    >
      {children}
    </Link>
  );
}

function Blocco({
  titolo,
  contatore,
  sottotitolo,
  href,
  children,
}: {
  titolo: string;
  contatore?: number;
  sottotitolo?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {titolo}
            {contatore != null && contatore > 0 && <span className="ml-2 text-sm font-normal text-gray-400">{contatore}</span>}
          </h2>
          {sottotitolo && <p className="text-xs text-gray-400">{sottotitolo}</p>}
        </div>
        {href && (
          <Link href={href} className="flex-shrink-0 text-xs font-medium text-brand hover:underline">
            Vedi tutte →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  etichetta,
  valore,
  sotto,
  info,
  colore = "slate",
}: {
  etichetta: string;
  valore: number;
  sotto?: string;
  info?: string;
  colore?: "slate" | "red" | "amber";
}) {
  const stili = { slate: "text-brand", red: "text-red-600", amber: "text-amber-600" } as const;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-1">
        <p className="text-sm font-medium text-gray-500">{etichetta}</p>
        {info && (
          <span title={info} className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] font-bold text-gray-400">
            i
          </span>
        )}
      </div>
      <p className={`mt-2 text-3xl font-bold ${stili[colore]}`}>{valore}</p>
      {sotto && <p className="mt-0.5 text-xs text-gray-400">{sotto}</p>}
    </div>
  );
}
