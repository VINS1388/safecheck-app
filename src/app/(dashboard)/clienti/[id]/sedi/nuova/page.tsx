import Link from "next/link";
import { creaSedeAction } from "./actions";

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]";

export default async function NuovaSedePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          href={`/clienti/${id}`}
          className="text-sm text-[#1e3a5f] hover:underline"
        >
          ← Scheda cliente
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Nuova sede</h1>
      </div>

      <form
        action={creaSedeAction}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-6"
      >
        <input type="hidden" name="cliente_id" value={id} />

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Nome sede <span className="text-red-500">*</span>
          </label>
          <input
            name="nome"
            required
            placeholder="Sede principale"
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
            placeholder="Via Roma 42"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              Città <span className="text-red-500">*</span>
            </label>
            <input name="citta" required placeholder="Roma" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">CAP</label>
            <input name="cap" placeholder="00100" className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Provincia
            </label>
            <input
              name="provincia"
              maxLength={2}
              placeholder="RM"
              className={`${inputCls} uppercase`}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              Referente sede
            </label>
            <input name="referente_sede" className={inputCls} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href={`/clienti/${id}`}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Annulla
          </Link>
          <button
            type="submit"
            className="rounded-md bg-[#1e3a5f] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Salva sede
          </button>
        </div>
      </form>
    </main>
  );
}
