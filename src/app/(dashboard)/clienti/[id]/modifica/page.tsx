import Link from "next/link";
import { notFound } from "next/navigation";
import { getClienteById, contaVisiteCliente, dipendenzeCliente } from "@/lib/db/queries/clienti";
import { isAdmin } from "@/lib/auth/rbac";
import {
  aggiornaClienteAction,
  disattivaClienteAction,
  eliminaClienteFisicoAction,
} from "../actions";
import BottoneConfermaAzione from "@/components/ui/BottoneConfermaAzione";

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export default async function ModificaClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cliente = await getClienteById(id);
  if (!cliente) notFound();

  const nSediAttive = cliente.sedi.length; // getClienteById risolve solo le sedi attive
  const [nVisite, admin, dip] = await Promise.all([
    contaVisiteCliente(id),
    isAdmin(),
    dipendenzeCliente(id),
  ]);

  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href={`/clienti/${id}`} className="text-sm text-brand hover:underline">
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
            className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
          >
            Salva modifiche
          </button>
        </div>
      </form>

      {/* Zona gestione: disattivazione (soft, reversibile — archiviazione) */}
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-sm font-semibold text-amber-900">Disattiva cliente</h2>
        <p className="mt-1 text-xs text-amber-800">
          Il cliente viene archiviato e rimosso dagli elenchi attivi. Non viene
          cancellato nulla: puoi riattivarlo in qualsiasi momento dalla vista
          &laquo;Archiviati&raquo;.
        </p>
        <div className="mt-3">
          <BottoneConfermaAzione
            azione={disattivaClienteAction.bind(null, id)}
            etichetta="Disattiva cliente"
            titolo="Disattiva cliente"
            testoConferma="Disattiva"
            variante="rosso"
            classeTrigger="rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-600 hover:text-white"
            messaggio={
              <>
                <p>
                  <strong>{cliente.ragione_sociale}</strong> verrà archiviato e non comparirà più
                  negli elenchi attivi. L&apos;operazione è reversibile.
                </p>
                {(nSediAttive > 0 || nVisite > 0) && (
                  <p className="rounded-md bg-amber-100 px-3 py-2 text-amber-900">
                    Elementi collegati che resteranno nel sistema:{" "}
                    {nSediAttive > 0 && (
                      <strong>
                        {nSediAttive} sed{nSediAttive === 1 ? "e attiva" : "i attive"}
                      </strong>
                    )}
                    {nSediAttive > 0 && nVisite > 0 && " · "}
                    {nVisite > 0 && (
                      <strong>
                        {nVisite} visit{nVisite === 1 ? "a" : "e"}
                      </strong>
                    )}
                    . Non verranno eliminati; torneranno accessibili alla riattivazione.
                  </p>
                )}
              </>
            }
          />
        </div>
      </div>

      {/* Eliminazione FISICA — solo admin, solo se il cliente è pulito */}
      {admin && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="text-sm font-semibold text-red-800">Elimina definitivamente</h2>
          {dip.eliminabile ? (
            <>
              <p className="mt-1 text-xs text-red-700">
                Il cliente non ha elementi collegati. L&apos;eliminazione è definitiva e non
                reversibile.
              </p>
              <div className="mt-3">
                <BottoneConfermaAzione
                  azione={eliminaClienteFisicoAction.bind(null, id)}
                  etichetta="Elimina definitivamente"
                  titolo="Eliminare definitivamente il cliente?"
                  testoConferma="Elimina definitivamente"
                  variante="rosso"
                  classeTrigger="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-600 hover:text-white"
                  messaggio={
                    <p>
                      <strong>{cliente.ragione_sociale}</strong> verrà rimosso definitivamente dal
                      database. L&apos;operazione <strong>non è reversibile</strong>. Se vuoi solo
                      nasconderlo, usa invece la disattivazione.
                    </p>
                  }
                />
              </div>
            </>
          ) : (
            <p className="mt-1 text-xs text-red-700">
              Non eliminabile: il cliente ha elementi collegati
              {[
                dip.sedi ? `${dip.sedi} sedi` : null,
                dip.visite ? `${dip.visite} visite` : null,
                dip.templateCliente || dip.templateSede ? "template" : null,
                dip.scadenze ? `${dip.scadenze} scadenze` : null,
              ]
                .filter(Boolean)
                .join(", ")}
              . Usa la disattivazione per archiviarlo.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
