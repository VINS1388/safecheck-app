import Link from "next/link";
import type { Sede } from "@/lib/db/queries/sedi";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";

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
    <Card padding="lg">
      <form action={action} className="space-y-4">
        {hiddenClienteId && (
          <input type="hidden" name="cliente_id" value={hiddenClienteId} />
        )}

        <Field label="Nome sede" required>
          <Input name="nome" required defaultValue={sede?.nome ?? ""} placeholder="Punto vendita Via Roma" />
        </Field>

        <Field label="Indirizzo" required>
          <Input name="indirizzo" required defaultValue={sede?.indirizzo ?? ""} placeholder="Via Roma 42" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Città" required className="sm:col-span-2">
            <Input name="citta" required defaultValue={sede?.citta ?? ""} placeholder="Roma" />
          </Field>
          <Field label="CAP">
            <Input name="cap" defaultValue={sede?.cap ?? ""} placeholder="00100" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Provincia">
            <Input name="provincia" maxLength={2} defaultValue={sede?.provincia ?? ""} placeholder="RM" className="uppercase" />
          </Field>
          <Field label="Referente sede" className="sm:col-span-2">
            <Input name="referente_sede" defaultValue={sede?.referente_sede ?? ""} />
          </Field>
        </div>

        <Field label="Telefono referente">
          <Input name="telefono_referente" defaultValue={sede?.telefono_referente ?? ""} placeholder="06 1234567" />
        </Field>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href={`/clienti/${clienteId}`} className={buttonClasses("secondary")}>
            Annulla
          </Link>
          <button type="submit" className={buttonClasses("primary")}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Card>
  );
}
