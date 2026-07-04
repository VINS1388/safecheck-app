import {
  getPianificazione,
  getPianiConStato,
  getTecnici,
} from "@/lib/db/queries/pianificazione";
import PianificazioneClient, { type SlotRiga } from "./PianificazioneClient";
import PianiContrattuali from "./PianiContrattuali";

export default async function PianificazionePage() {
  const oggi = new Date().toISOString().slice(0, 10);
  const [slots, tecnici, piani] = await Promise.all([
    getPianificazione(),
    getTecnici(),
    getPianiConStato(oggi),
  ]);
  const tecnicoNome = new Map(tecnici.map((t) => [t.id, t.nomeCompleto]));

  const righe: SlotRiga[] = slots.map((s) => ({
    id: s.id,
    clienteId: s.clienteId,
    clienteNome: s.clienteNome,
    sedeNome: s.sedeNome,
    numeroVisita: s.numeroVisita,
    cicloNumero: s.cicloNumero,
    dataSuggerita: s.dataSuggerita,
    dataPianificata: s.dataPianificata,
    stato: s.stato,
    visitaId: s.visitaId,
    tecnicoId: s.tecnicoId,
    tecnicoNome: s.tecnicoId ? tecnicoNome.get(s.tecnicoId) ?? null : null,
    tecnicoPersonalizzato: s.tecnicoPersonalizzato,
  }));

  const tecniciOpzioni = tecnici.map((t) => ({ id: t.id, nome: t.nomeCompleto }));

  // Clienti unici (per il filtro), ordinati per nome.
  const clientiFiltro = Array.from(
    new Map(slots.map((s) => [s.clienteId, s.clienteNome])).entries()
  )
    .filter(([id]) => id)
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <main className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Pianificazione visite</h1>
        <p className="mt-1 text-sm text-gray-500">
          Visite previste dai piani contrattuali, ordinate per data più vicina.
          Rosso = scaduta · Amber = entro 30 giorni.
        </p>
      </div>

      <PianiContrattuali piani={piani} />
      <PianificazioneClient slots={righe} clientiFiltro={clientiFiltro} tecnici={tecniciOpzioni} oggi={oggi} />
    </main>
  );
}
