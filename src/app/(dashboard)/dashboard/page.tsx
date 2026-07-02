import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDashboardKpi, getDashboardClienti } from "@/lib/db/queries/clienti";
import { getVisiteUtente } from "@/lib/db/queries/visite";
import { getPianificazione } from "@/lib/db/queries/pianificazione";
import { formatDate } from "@/lib/utils";
import { differenzaGiorni } from "@/lib/scadenze/calcola";
import { ETICHETTE_STATO_SLOT } from "@/types";
import StatoBadge from "@/components/ui/StatoBadge";
import EmptyState from "@/components/ui/EmptyState";
import DashboardClienti from "./DashboardClienti";

const GIORNI_BOZZA_VECCHIA = 14;

export default async function DashboardPage() {
  const { user, profilo } = await getCurrentUser();
  const nome = profilo?.nome_completo ?? user?.email ?? "Utente";
  const oggi = new Date().toISOString().slice(0, 10);

  const [kpi, clienti, visite, slots] = await Promise.all([
    getDashboardKpi(),
    getDashboardClienti(),
    getVisiteUtente(),
    getPianificazione(),
  ]);

  const bozze = visite.filter((v) => v.stato === "bozza");
  const chiusi = visite.filter((v) => v.stato_verbale === "chiuso").slice(0, 5);
  const prossime = slots.filter((s) => s.stato !== "eseguita").slice(0, 5);

  return (
    <div>
      {/* Intestazione + azioni principali */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Benvenuto, {nome}</h1>
          <p className="mt-1 text-sm text-gray-500">Quadro operativo dello studio.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CTA href="/clienti" primario>
            Nuova visita
          </CTA>
          <CTA href="/pianificazione">Pianificazione</CTA>
          <CTA href="/visite">Archivio verbali</CTA>
        </div>
      </div>

      {/* KPI aggregati di studio */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi etichetta="Clienti attivi" valore={kpi.clienti_attivi} />
        <Kpi etichetta="Verbali totali" valore={kpi.verbali_totali} sotto="tutti gli stati" />
        <Kpi
          etichetta="NC rilevate"
          valore={kpi.nc_verbali_chiusi}
          colore="red"
          sotto="nei verbali chiusi"
          info="Conteggio grezzo delle non conformità rilevate nei verbali chiusi. Non esiste ancora il concetto di NC 'risolta' (arriva con l'NC tracking): non rappresenta le NC ancora da risolvere."
        />
        <Kpi
          etichetta="Ultimo sopralluogo"
          testo={kpi.ultimo_sopralluogo ? formatDate(kpi.ultimo_sopralluogo) : "—"}
        />
      </div>

      {/* Due colonne operative: bozze + prossime visite */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Sezione titolo="Bozze da completare" contatore={bozze.length}>
          {bozze.length === 0 ? (
            <EmptyState
              compatto
              titolo="Nessuna bozza aperta"
              descrizione="Avvia un sopralluogo da una sede per iniziare un nuovo verbale."
              ctaHref="/clienti"
              ctaLabel="Vai ai clienti"
            />
          ) : (
            <ul className="space-y-2">
              {bozze.map((v) => {
                const giorni = differenzaGiorni(oggi, v.data_visita);
                const vecchia = giorni >= GIORNI_BOZZA_VECCHIA;
                return (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{v.cliente_nome}</p>
                      <p className="truncate text-xs text-gray-500">
                        {v.sede_nome} · {formatDate(v.data_visita)}
                        {vecchia && (
                          <span className="ml-1 font-medium text-amber-600">· aperta da {giorni} giorni</span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Link
                        href={`/visite/${v.id}/briefing`}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        Briefing
                      </Link>
                      <Link
                        href={`/visite/${v.id}/avvia`}
                        className="rounded-lg bg-[#1e3a5f] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#16304e]"
                      >
                        Riprendi
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Sezione>

        <Sezione titolo="Prossime visite pianificate" contatore={prossime.length} href="/pianificazione">
          {prossime.length === 0 ? (
            <EmptyState
              compatto
              titolo="Nessuna visita pianificata"
              descrizione="Configura un piano visite nella scheda di una sede."
              ctaHref="/pianificazione"
              ctaLabel="Apri pianificazione"
            />
          ) : (
            <ul className="space-y-2">
              {prossime.map((s) => {
                const data = s.dataPianificata ?? s.dataSuggerita;
                const scaduta = s.dataPianificata == null && data < oggi;
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{s.clienteNome}</p>
                      <p className="truncate text-xs text-gray-500">{s.sedeNome}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className={`text-sm font-medium ${scaduta ? "text-red-600" : "text-gray-800"}`}>
                        {formatDate(data)}
                      </p>
                      <p className="text-[11px] text-gray-400">{ETICHETTE_STATO_SLOT[s.stato]}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Sezione>
      </div>

      {/* Ultimi verbali chiusi */}
      <div className="mt-8">
        <Sezione titolo="Ultimi verbali chiusi" contatore={chiusi.length} href="/visite">
          {chiusi.length === 0 ? (
            <EmptyState
              compatto
              titolo="Nessun verbale chiuso"
              descrizione="I verbali generati compariranno qui, con download PDF rapido."
            />
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {chiusi.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{v.cliente_nome}</p>
                    <p className="truncate text-xs text-gray-500">
                      {v.sede_nome} · {formatDate(v.data_visita)}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <StatoBadge statoVerbale={v.stato_verbale} numeroVerbale={v.numero_verbale} />
                    <Link href={`/visite/${v.id}/riepilogo`} className="text-sm font-medium text-[#1e3a5f] hover:underline">
                      Apri
                    </Link>
                    <a
                      href={`/api/visite/${v.id}/download-pdf`}
                      className="text-sm font-medium text-[#1e3a5f] hover:underline"
                    >
                      PDF
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Sezione>
      </div>

      {/* Elenco clienti con ricerca */}
      <div className="mt-8">
        <DashboardClienti clienti={clienti} />
      </div>
    </div>
  );
}

function CTA({ href, children, primario }: { href: string; children: React.ReactNode; primario?: boolean }) {
  return (
    <Link
      href={href}
      className={
        primario
          ? "min-h-[40px] rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          : "min-h-[40px] rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
      }
    >
      {children}
    </Link>
  );
}

function Sezione({
  titolo,
  contatore,
  href,
  children,
}: {
  titolo: string;
  contatore?: number;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          {titolo}
          {contatore != null && contatore > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">{contatore}</span>
          )}
        </h2>
        {href && (
          <Link href={href} className="text-xs font-medium text-[#1e3a5f] hover:underline">
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
  testo,
  sotto,
  info,
  colore = "slate",
}: {
  etichetta: string;
  valore?: number;
  testo?: string;
  sotto?: string;
  info?: string;
  colore?: "slate" | "red";
}) {
  const stili = { slate: "text-[#1e3a5f]", red: "text-red-600" } as const;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-1">
        <p className="text-sm font-medium text-gray-500">{etichetta}</p>
        {info && (
          <span
            title={info}
            className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] font-bold text-gray-400"
          >
            i
          </span>
        )}
      </div>
      <p className={`mt-2 text-3xl font-bold ${stili[colore]}`}>{testo ?? valore}</p>
      {sotto && <p className="mt-0.5 text-xs text-gray-400">{sotto}</p>}
    </div>
  );
}
