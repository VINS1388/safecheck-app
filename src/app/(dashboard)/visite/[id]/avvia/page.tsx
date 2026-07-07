import { notFound, redirect } from "next/navigation";
import { getVisitaById } from "@/lib/db/queries/visite";
import { avviaSopralluogoAction } from "./actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const roCls =
  "mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600";
const labelCls = "block text-sm font-medium text-gray-700";

function oggiISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AvviaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const visita = await getVisitaById(id);
  if (!visita) notFound();

  // Visita già chiusa: non ha senso ri-avviare.
  if (visita.stato !== "bozza") {
    redirect(`/visite/${id}/riepilogo`);
  }

  const dataDefault = visita.data_visita || oggiISO();
  const oraDefault = (visita.ora_inizio ?? "").slice(0, 5);
  const qualificaDefault = visita.qualifica_tecnico ?? "RSPP";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <span className="text-2xl font-bold tracking-tight text-brand">
          SafeCheck
        </span>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">
          Verbale di sopralluogo — Sicurezza sul lavoro
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Conferma i dati prima di iniziare la checklist.
        </p>
      </div>

      <form
        action={avviaSopralluogoAction.bind(null, id)}
        className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        {/* Consulente */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Nome consulente</label>
            <input className={roCls} value={visita.specialist_nome} readOnly />
          </div>
          <div>
            <label className={labelCls}>Qualifica tecnico</label>
            <input
              name="qualifica_tecnico"
              defaultValue={qualificaDefault}
              placeholder="RSPP"
              className={inputCls}
            />
          </div>
        </div>

        {/* Cliente / sede (sola lettura) */}
        <div>
          <label className={labelCls}>Cliente</label>
          <input className={roCls} value={visita.cliente_nome} readOnly />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Sede</label>
            <input className={roCls} value={visita.sede_nome} readOnly />
          </div>
          <div>
            <label className={labelCls}>Indirizzo sede</label>
            <input
              className={roCls}
              value={[visita.sede_indirizzo, visita.sede_citta]
                .filter(Boolean)
                .join(", ")}
              readOnly
            />
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Referente / data / ora */}
        <div>
          <label className={labelCls}>
            Referente cliente <span className="text-red-500">*</span>
          </label>
          <input
            name="referente_cliente"
            required
            defaultValue={visita.referente_cliente ?? ""}
            placeholder="Nome e cognome del referente in sede"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>
              Data sopralluogo <span className="text-red-500">*</span>
            </label>
            <input
              name="data_visita"
              type="date"
              required
              defaultValue={dataDefault}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Ora inizio</label>
            <input
              name="ora_inizio"
              type="time"
              defaultValue={oraDefault}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Note preliminari</label>
          <textarea
            name="note_preliminari"
            rows={3}
            defaultValue={visita.note_preliminari ?? ""}
            placeholder="Eventuali note prima di iniziare (opzionale)"
            className={inputCls + " resize-y"}
          />
        </div>

        <button
          type="submit"
          className="min-h-[48px] w-full rounded-lg bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          Inizia sopralluogo
        </button>
      </form>
    </div>
  );
}
