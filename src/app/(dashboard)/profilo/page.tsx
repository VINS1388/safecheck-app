import { redirect } from "next/navigation";
import { getProfiloCorrente } from "@/lib/server/profilo";
import { getProfiloOrganizzazione } from "@/lib/server/org-profilo";
import { aggiornaProfiloAction } from "./actions";
import PageHeader from "@/components/ui/PageHeader";
import { Card, SectionCard } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import AlertBanner from "@/components/ui/AlertBanner";
import { buttonClasses } from "@/components/ui/Button";

export const metadata = { title: "Il mio profilo · SafeCheck" };

const RUOLO_LABEL: Record<string, string> = {
  admin: "Amministratore",
  planner: "Pianificatore",
  specialist: "Tecnico",
};

/**
 * Pagina /profilo (Sprint 16.6). Self-service: ogni utente attivo vede e modifica
 * i propri dati anagrafici (nome/telefono/qualifica). Email e ruolo in sola lettura
 * (email = fuori scope Auth; ruolo = governance admin da /organizzazione).
 */
export default async function ProfiloPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { msg, err } = await searchParams;
  const [profilo, org] = await Promise.all([getProfiloCorrente(), getProfiloOrganizzazione()]);
  if (!profilo) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl">
      <PageHeader
        titolo="Il mio profilo"
        sottotitolo="Aggiorna i tuoi dati anagrafici. Email e ruolo sono gestiti dall'amministratore."
      />

      {msg && (
        <AlertBanner variant="success" role="status" className="mb-4">
          {msg}
        </AlertBanner>
      )}
      {err && (
        <AlertBanner variant="danger" role="alert" className="mb-4">
          {err}
        </AlertBanner>
      )}

      <Card padding="lg">
        <form action={aggiornaProfiloAction} className="space-y-4">
          <Field label="Nome completo" required>
            <Input name="nome_completo" required defaultValue={profilo.nome_completo} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Telefono">
              <Input name="telefono" defaultValue={profilo.telefono ?? ""} placeholder="+39 …" />
            </Field>
            <Field label="Qualifica">
              <Input name="qualifica" defaultValue={profilo.qualifica ?? ""} placeholder="es. RSPP" />
            </Field>
          </div>

          <hr className="border-gray-100" />
          <p className="text-xs uppercase tracking-wide text-gray-400">Gestiti dall&apos;amministratore</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email">
              <Input value={profilo.email} disabled />
            </Field>
            <Field label="Ruolo">
              <Input value={RUOLO_LABEL[profilo.ruolo] ?? profilo.ruolo} disabled />
            </Field>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" className={buttonClasses("primary")}>
              Salva modifiche
            </button>
          </div>
        </form>
      </Card>

      {/* Organizzazione (sola lettura per tutti; la modifica è in area admin) */}
      {org && (
        <SectionCard titolo="Organizzazione" className="mt-6">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {(
              [
                ["Ragione sociale", org.ragione_sociale],
                ["P.IVA", org.partita_iva],
                [
                  "Sede",
                  [org.indirizzo, org.cap, org.citta, org.provincia ? `(${org.provincia})` : null]
                    .filter(Boolean)
                    .join(" ") || null,
                ],
                ["Email", org.email],
                ["Telefono", org.telefono],
              ] as [string, string | null][]
            ).map(([label, valore]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-gray-50 py-1">
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="text-right text-sm text-gray-900">{valore || "—"}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      )}
    </main>
  );
}
