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
import PageHeader from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";

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
      <PageHeader
        titolo="Modifica cliente"
        sottotitolo="Anagrafica e sede legale."
        backHref={`/clienti/${id}`}
        backLabel="Scheda cliente"
      />

      <Card padding="lg">
        <form action={aggiornaClienteAction.bind(null, id)} className="space-y-4">
          <Field label="Ragione sociale" required>
            <Input name="ragione_sociale" required defaultValue={cliente.ragione_sociale} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Partita IVA">
              <Input name="partita_iva" defaultValue={cliente.partita_iva ?? ""} />
            </Field>
            <Field label="Codice fiscale">
              <Input name="codice_fiscale" defaultValue={cliente.codice_fiscale ?? ""} />
            </Field>
          </div>

          <Field label="Indirizzo sede legale">
            <Input name="indirizzo_sede_legale" defaultValue={cliente.indirizzo_sede_legale ?? ""} />
          </Field>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
            <Field label="Città" required className="col-span-2 sm:col-span-3">
              <Input name="citta" required defaultValue={cliente.citta ?? ""} />
            </Field>
            <Field label="CAP" className="col-span-1">
              <Input name="cap" defaultValue={cliente.cap ?? ""} />
            </Field>
            <Field label="Provincia" required className="col-span-1 sm:col-span-2">
              <Input name="provincia" required maxLength={2} defaultValue={cliente.provincia ?? ""} className="uppercase" />
            </Field>
          </div>

          <hr className="border-gray-100" />
          <p className="text-xs uppercase tracking-wide text-gray-400">Referente</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Referente">
              <Input name="referente_principale" defaultValue={cliente.referente_principale ?? ""} />
            </Field>
            <Field label="Telefono referente">
              <Input name="telefono_referente" defaultValue={cliente.telefono_referente ?? ""} />
            </Field>
          </div>

          <Field label="Email referente">
            <Input name="email_referente" type="email" defaultValue={cliente.email_referente ?? ""} />
          </Field>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href={`/clienti/${id}`} className={buttonClasses("secondary")}>
              Annulla
            </Link>
            <button type="submit" className={buttonClasses("primary")}>
              Salva modifiche
            </button>
          </div>
        </form>
      </Card>

      {/* Zona gestione: disattivazione (soft, reversibile — archiviazione) */}
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
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
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
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
