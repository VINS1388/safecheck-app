import Link from "next/link";
import { notFound } from "next/navigation";
import { getSedeById } from "@/lib/db/queries/sedi";
import {
  getPianoBySede,
  getSlotByPianoCiclo,
  getTecnici,
} from "@/lib/db/queries/pianificazione";
import SedeForm from "../../SedeForm";
import { aggiornaSedeAction } from "../../actions";
import PianoVisiteForm from "./PianoVisiteForm";

export default async function ModificaSedePage({
  params,
}: {
  params: Promise<{ id: string; sedeId: string }>;
}) {
  const { id, sedeId } = await params;

  const sede = await getSedeById(sedeId);
  if (!sede || sede.cliente_id !== id) {
    notFound();
  }

  const [piano, tecnici] = await Promise.all([getPianoBySede(sedeId), getTecnici()]);
  const slots = piano ? await getSlotByPianoCiclo(piano.id, piano.cicloCorrente) : [];

  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href={`/clienti/${id}`} className="text-sm text-brand hover:underline">
          ← Scheda cliente
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Modifica sede</h1>
      </div>

      <SedeForm
        action={aggiornaSedeAction.bind(null, id, sedeId)}
        clienteId={id}
        sede={sede}
        submitLabel="Salva modifiche"
      />

      <PianoVisiteForm
        clienteId={id}
        sedeId={sedeId}
        piano={piano}
        tecnici={tecnici}
        slots={slots}
      />
    </main>
  );
}
