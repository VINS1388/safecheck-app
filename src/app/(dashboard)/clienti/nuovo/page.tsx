import Link from "next/link";
import { creaClienteAction } from "./actions";

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]";

export default function NuovoClientePage() {
  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href="/clienti" className="text-sm text-[#1e3a5f] hover:underline">
          ← Clienti
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          Nuovo cliente
        </h1>
      </div>

      <form
        action={creaClienteAction}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-6"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Ragione sociale <span className="text-red-500">*</span>
          </label>
          <input
            name="ragione_sociale"
            required
            placeholder="Pane Pizza Srl"
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
            <label className="block text-sm font-medium text-gray-700">
              Provincia <span className="text-red-500">*</span>
            </label>
            <input
              name="provincia"
              required
              maxLength={2}
              placeholder="RM"
              className={`${inputCls} uppercase`}
            />
          </div>
        </div>

        <hr className="border-gray-100" />
        <p className="text-xs uppercase tracking-wide text-gray-400">
          Campi opzionali
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Partita IVA
            </label>
            <input name="partita_iva" placeholder="01234567890" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Referente
            </label>
            <input name="referente_principale" className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Indirizzo sede legale
          </label>
          <input name="indirizzo_sede_legale" className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Email referente
          </label>
          <input
            name="email_referente"
            type="email"
            placeholder="referente@azienda.it"
            className={inputCls}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/clienti"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Annulla
          </Link>
          <button
            type="submit"
            className="rounded-md bg-[#1e3a5f] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Salva cliente
          </button>
        </div>
      </form>
    </main>
  );
}
