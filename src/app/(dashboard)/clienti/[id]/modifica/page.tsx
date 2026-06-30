import Link from "next/link";
import { notFound } from "next/navigation";
import { getClienteById } from "@/lib/db/queries/clienti";
import { aggiornaClienteAction, eliminaClienteAction } from "../actions";

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]";

export default async function ModificaClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cliente = await getClienteById(id);
  if (!cliente) notFound();

  const nVisite = cliente.sedi.length; // info; il blocco vero è server-side sulle visite

  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href={`/clienti/${id}`} className="text-sm text-[#1e3a5f] hover:underline">
          ← Scheda cliente
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Modifica cliente</h1>
        <p className="text-sm text-gray-500">Anagrafica e sede legale.</p>
      </div>

      <form
        action={aggiornaClienteAction.bind(null, id)}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-6"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Ragione sociale <span className="text-red-500">*</span>
          </label>
          <input name="ragione_sociale" required defaultValue={cliente.ragione_sociale} className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Partita IVA</label>
            <input name="partita_iva" defaultValue={cliente.partita_iva ?? ""} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Codice fiscale</label>
            <input name="codice_fiscale" defaultValue={cliente.codice_fiscale ?? ""} className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Indirizzo sede legale
          </label>
          <input name="indirizzo_sede_legale" defaultValue={cliente.indirizzo_sede_legale ?? ""} className={inputCls} />
        </div>

        <div className="grid grid-cols-6 gap-4">
          <div className="col-span-3">
            <label className="block text-sm font-medium text-gray-700">
              Città <span className="text-red-500">*</span>
            </label>
            <input name="citta" required defaultValue={cliente.citta ?? ""} className={inputCls} />
          </div>
          <div className="col-span-1">
            <label className="block text-sm font-medium text-gray-700">CAP</label>
            <input name="cap" defaultValue={cliente.cap ?? ""} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              Provincia <span className="text-red-500">*</span>
            </label>
            <input name="provincia" required maxLength={2} defaultValue={cliente.provincia ?? ""} className={`${inputCls} uppercase`} />
          </div>
        </div>

        <hr className="border-gray-100" />
        <p className="text-xs uppercase tracking-wide text-gray-400">Referente</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Referente</label>
            <input name="referente_principale" defaultValue={cliente.referente_principale ?? ""} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Telefono referente</label>
            <input name="telefono_referente" defaultValue={cliente.telefono_referente ?? ""} className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Email referente</label>
          <input name="email_referente" type="email" defaultValue={cliente.email_referente ?? ""} className={inputCls} />
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
            Salva modifiche
          </button>
        </div>
      </form>

      {/* Zona pericolo: eliminazione (soft-delete, bloccata se ci sono visite) */}
      <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5">
        <h2 className="text-sm font-semibold text-red-800">Elimina cliente</h2>
        <p className="mt-1 text-xs text-red-700">
          Il cliente viene disattivato e rimosso dagli elenchi. Operazione
          bloccata se esistono visite collegate (integrità storica dei verbali).
          {nVisite > 0 ? ` Sedi operative associate: ${nVisite}.` : ""}
        </p>
        <form action={eliminaClienteAction.bind(null, id)} className="mt-3">
          <button
            type="submit"
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-600 hover:text-white"
          >
            Elimina cliente
          </button>
        </form>
      </div>
    </main>
  );
}
