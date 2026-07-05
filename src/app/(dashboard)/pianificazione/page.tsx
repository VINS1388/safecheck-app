import {
  getPianificazioneFiltrata,
  getPianiConStato,
  getTecnici,
} from "@/lib/db/queries/pianificazione";
import { canManagePlanning } from "@/lib/auth/rbac";
import { parseFiltri, rangePeriodo } from "@/lib/filters";
import {
  getClientiOpzioni,
  getSediOpzioni,
  getTecniciOpzioni,
} from "@/lib/server/filtri-opzioni";
import FilterBar, { type FilterConfig } from "@/components/filters/FilterBar";
import PianificazioneClient, { type SlotRiga } from "./PianificazioneClient";
import PianiContrattuali from "./PianiContrattuali";

const STATI_SLOT = [
  { value: "da_assegnare", label: "Da assegnare" },
  { value: "da_pianificare", label: "Da pianificare" },
  { value: "pianificata", label: "Pianificate" },
  { value: "in_lavorazione", label: "In lavorazione" },
  { value: "eseguita", label: "Eseguite" },
];

export default async function PianificazionePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const oggi = new Date().toISOString().slice(0, 10);
  // Pagina forward-looking: default periodo = "sempre" (non nascondere gli slot
  // futuri con una finestra "ultimi 30 giorni").
  const sp = await searchParams;
  const filtri = parseFiltri(sp, "sempre");
  const range = rangePeriodo(filtri, oggi);
  const canManage = await canManagePlanning();

  const [slots, clienti, sedi, tecniciRoster, tecniciRLS, piani] = await Promise.all([
    getPianificazioneFiltrata({
      clienteId: filtri.cliente,
      sedeId: filtri.sede,
      tecnicoId: canManage ? filtri.tecnico : undefined,
      stato: filtri.stato,
      dataDa: range.da,
      dataA: range.a,
    }),
    getClientiOpzioni(),
    getSediOpzioni(),
    getTecniciOpzioni(), // roster completo (admin/planner), [] per lo specialist
    getTecnici(), // via RLS: dà il "sé stesso" allo specialist per il nome del proprio slot
    canManage ? getPianiConStato(oggi) : Promise.resolve([]),
  ]);

  // Nome tecnico: unione roster (admin/planner) + RLS (self per lo specialist).
  const tecnicoNome = new Map<string, string>();
  for (const t of tecniciRLS) tecnicoNome.set(t.id, t.nomeCompleto);
  for (const t of tecniciRoster) tecnicoNome.set(t.value, t.label);

  const righe: SlotRiga[] = slots.map((s) => ({
    id: s.id,
    clienteId: s.clienteId,
    clienteNome: s.clienteNome,
    sedeNome: s.sedeNome,
    numeroVisita: s.numeroVisita,
    cicloNumero: s.cicloNumero,
    dataSuggerita: s.dataSuggerita,
    dataPianificata: s.dataPianificata,
    stato: s.stato,
    visitaId: s.visitaId,
    tecnicoId: s.tecnicoId,
    tecnicoNome: s.tecnicoId ? tecnicoNome.get(s.tecnicoId) ?? null : null,
    tecnicoPersonalizzato: s.tecnicoPersonalizzato,
  }));

  const config: FilterConfig = {
    cliente: true,
    sede: true,
    tecnico: true, // reso solo se canManage (admin/planner)
    stato: STATI_SLOT,
    periodo: true,
  };

  return (
    <main className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Pianificazione visite</h1>
        <p className="mt-1 text-sm text-gray-500">
          Visite previste dai piani contrattuali, ordinate per data più vicina.
          Rosso = scaduta · Amber = entro 30 giorni.
        </p>
      </div>

      {canManage && <PianiContrattuali piani={piani} />}

      <FilterBar
        config={config}
        filtri={filtri}
        clienti={clienti}
        sedi={sedi}
        tecnici={tecniciRoster}
        mostraTecnico={canManage}
        periodoDefault="sempre"
      />

      <PianificazioneClient
        slots={righe}
        tecnici={tecniciRoster.map((t) => ({ id: t.value, nome: t.label }))}
        oggi={oggi}
        canManage={canManage}
      />
    </main>
  );
}
