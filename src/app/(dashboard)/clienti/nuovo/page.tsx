import Link from "next/link";
import { creaClienteAction } from "./actions";
import PageHeader from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";

export default function NuovoClientePage() {
  return (
    <main className="mx-auto max-w-2xl">
      <PageHeader titolo="Nuovo cliente" backHref="/clienti" backLabel="Clienti" />

      <Card padding="lg">
        <form action={creaClienteAction} className="space-y-4">
          <Field label="Ragione sociale" required>
            <Input name="ragione_sociale" required placeholder="Pane Pizza Srl" />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Città" required className="sm:col-span-2">
              <Input name="citta" required placeholder="Roma" />
            </Field>
            <Field label="Provincia" required>
              <Input name="provincia" required maxLength={2} placeholder="RM" className="uppercase" />
            </Field>
          </div>

          <hr className="border-gray-100" />
          <p className="text-xs uppercase tracking-wide text-gray-400">Campi opzionali</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Partita IVA">
              <Input name="partita_iva" placeholder="01234567890" />
            </Field>
            <Field label="Referente">
              <Input name="referente_principale" />
            </Field>
          </div>

          <Field label="Indirizzo sede legale">
            <Input name="indirizzo_sede_legale" />
          </Field>

          <Field label="Email referente">
            <Input name="email_referente" type="email" placeholder="referente@azienda.it" />
          </Field>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/clienti" className={buttonClasses("secondary")}>
              Annulla
            </Link>
            <button type="submit" className={buttonClasses("primary")}>
              Salva cliente
            </button>
          </div>
        </form>
      </Card>
    </main>
  );
}
