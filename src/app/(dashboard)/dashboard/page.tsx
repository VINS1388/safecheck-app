import { getCurrentUser } from "@/lib/auth/current-user";
import { getDashboardKpi, getDashboardClienti } from "@/lib/db/queries/clienti";
import { formatDate } from "@/lib/utils";
import DashboardClienti from "./DashboardClienti";

export default async function DashboardPage() {
  const { user, profilo } = await getCurrentUser();
  const nome = profilo?.nome_completo ?? user?.email ?? "Utente";

  const [kpi, clienti] = await Promise.all([
    getDashboardKpi(),
    getDashboardClienti(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Benvenuto, {nome}</h1>
      <p className="mt-1 text-sm text-gray-500">Quadro sintetico dello studio.</p>

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

      {/* Elenco clienti con ricerca */}
      <div className="mt-8">
        <DashboardClienti clienti={clienti} />
      </div>
    </div>
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
      <p className={`mt-2 text-3xl font-bold ${stili[colore]}`}>
        {testo ?? valore}
      </p>
      {sotto && <p className="mt-0.5 text-xs text-gray-400">{sotto}</p>}
    </div>
  );
}
