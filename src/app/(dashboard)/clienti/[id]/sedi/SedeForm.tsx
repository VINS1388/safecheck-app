import Link from "next/link";
import type { Sede } from "@/lib/db/queries/sedi";

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]";

/**
 * Form condiviso creazione/modifica sede operativa. `action` è la server
 * action (già bound agli eventuali argomenti). Se `hiddenClienteId` è
 * presente viene aggiunto un campo nascosto (flusso creazione).
 */
export default function SedeForm({
  action,
  clienteId,
  sede,
  hiddenClienteId,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  clienteId: string;
  sede?: Sede;
  hiddenClienteId?: string;
  submitLabel: string;
}) {
  return (
    <form
      action={action}
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-6"
    >
      {hiddenClienteId && (
        <input type="hidden" name="cliente_id" value={hiddenClienteId} />
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Nome sede <span className="text-red-500">*</span>
        </label>
        <input
          name="nome"
          required
          defaultValue={sede?.nome ?? ""}
          placeholder="Punto vendita Via Roma"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Indirizzo <span className="text-red-500">*</span>
        </label>
        <input
          name="indirizzo"
          required
          defaultValue={sede?.indirizzo ?? ""}
          placeholder="Via Roma 42"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">
            Città <span className="text-red-500">*</span>
          </label>
          <input
            name="citta"
            required
            defaultValue={sede?.citta ?? ""}
            placeholder="Roma"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">CAP</label>
          <input
            name="cap"
            defaultValue={sede?.cap ?? ""}
            placeholder="00100"
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Provincia</label>
          <input
            name="provincia"
            maxLength={2}
            defaultValue={sede?.provincia ?? ""}
            placeholder="RM"
            className={`${inputCls} uppercase`}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">
            Referente sede
          </label>
          <input
            name="referente_sede"
            defaultValue={sede?.referente_sede ?? ""}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Telefono referente
        </label>
        <input
          name="telefono_referente"
          defaultValue={sede?.telefono_referente ?? ""}
          placeholder="06 1234567"
          className={inputCls}
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href={`/clienti/${clienteId}`}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Annulla
        </Link>
        <button
          type="submit"
          className="rounded-md bg-[#1e3a5f] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#16304e]"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
