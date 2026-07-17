import { notFound } from "next/navigation";
import { getSedeById } from "@/lib/db/queries/sedi";
import {
  getPianoBySede,
  getSlotByPianoCiclo,
} from "@/lib/db/queries/pianificazione";
import { getTecniciAssegnabili } from "@/lib/server/filtri-opzioni";
import SedeForm from "../../SedeForm";
import { aggiornaSedeAction } from "../../actions";
import PianoVisiteForm from "./PianoVisiteForm";
import PageHeader from "@/components/ui/PageHeader";

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

  const [piano, tecnici] = await Promise.all([getPianoBySede(sedeId), getTecniciAssegnabili()]);
  const slots = piano ? await getSlotByPianoCiclo(piano.id, piano.cicloCorrente) : [];

  return (
    <main className="mx-auto max-w-2xl">
      <PageHeader titolo="Modifica sede" backHref={`/clienti/${id}`} backLabel="Scheda cliente" />

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
