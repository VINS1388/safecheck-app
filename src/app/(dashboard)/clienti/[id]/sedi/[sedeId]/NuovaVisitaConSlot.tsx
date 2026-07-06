"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import type { SlotProponibile } from "@/lib/db/queries/pianificazione";
import { creaVisitaConSlotAction } from "./nuova-visita/actions";

interface ModuloOpzione {
  id: string;
  nomeBreve: string;
}

interface Props {
  clienteId: string;
  sedeId: string;
  slots: SlotProponibile[];
  currentUserId: string;
  // Moduli selezionabili sulla sede (Sprint HACCP 2, C5). ≤1 → nessun selettore
  // (flusso invariato). >1 → selettore "Tipologia" per la visita fuori piano.
  moduli?: ModuloOpzione[];
}

const FUORI_PIANO = "fuori-piano";

/**
 * Selettore OBBLIGATORIO "Collega a piano visite" alla creazione di una nuova
 * visita, mostrato quando la sede ha ≥1 slot proponibile. Nessuna preselezione:
 * l'utente deve scegliere attivamente (Salva disabilitato finché non sceglie).
 */
export default function NuovaVisitaConSlot({ clienteId, sedeId, slots, currentUserId, moduli = [] }: Props) {
  const router = useRouter();
  const [scelta, setScelta] = useState<string>("");
  const [creando, setCreando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // Selettore tipologia solo con >1 modulo. Con 1 modulo si passa quello (o nulla).
  const selettoreModulo = moduli.length > 1;
  const [modulo, setModulo] = useState<string>(moduli.length === 1 ? moduli[0].id : "");

  const slotScelto = slots.find((s) => s.id === scelta) ?? null;
  const mismatch =
    slotScelto && slotScelto.tecnicoId && slotScelto.tecnicoId !== currentUserId
      ? slotScelto.tecnicoNome
      : null;
  // Il modulo è richiesto solo per la visita fuori piano (gli slot ereditano il
  // modulo del proprio piano). Manca solo se selettore attivo, fuori piano, non scelto.
  const moduloMancante = selettoreModulo && scelta === FUORI_PIANO && !modulo;

  async function avvia() {
    if (!scelta) {
      setErrore("Seleziona un'opzione per continuare.");
      return;
    }
    if (moduloMancante) {
      setErrore("Seleziona la tipologia di verbale per la visita fuori piano.");
      return;
    }
    setCreando(true);
    setErrore(null);
    try {
      const res = await creaVisitaConSlotAction(clienteId, sedeId, scelta, modulo || undefined);
      if (res.ok) {
        router.push(`/visite/${res.visitaId}/avvia`);
        return; // resta in stato "Creazione…" durante la navigazione
      }
      setErrore(res.error);
      setCreando(false);
    } catch {
      // Un errore lato server (es. RLS) non deve lasciare il pulsante appeso.
      setErrore("Errore imprevisto durante la creazione della visita. Riprova.");
      setCreando(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">Collega a piano visite</h2>
      <p className="mt-0.5 text-xs text-gray-500">
        Questa sede ha visite pianificate. Scegli lo slot da eseguire, oppure crea una visita fuori piano.
      </p>

      <fieldset className="mt-3 space-y-1.5">
        {slots.map((s) => (
          <label
            key={s.id}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-2.5 text-sm hover:bg-gray-50 has-[:checked]:border-[#1e3a5f] has-[:checked]:bg-[#1e3a5f]/5"
          >
            <input
              type="radio"
              name="slot"
              value={s.id}
              checked={scelta === s.id}
              onChange={(e) => setScelta(e.target.value)}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="font-medium text-gray-900">
                Visita {s.numeroVisita}/{s.totale}
              </span>{" "}
              <span className="text-gray-600">
                — {formatDate(s.dataEffettiva)}
                {s.isSuggerita ? " (suggerita)" : ""} —{" "}
                {s.tecnicoNome ? (
                  <span className="text-gray-700">{s.tecnicoNome}</span>
                ) : (
                  <span className="font-medium text-amber-700">Da assegnare</span>
                )}
              </span>
            </span>
          </label>
        ))}

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 p-2.5 text-sm hover:bg-gray-50 has-[:checked]:border-[#1e3a5f] has-[:checked]:bg-[#1e3a5f]/5">
          <input
            type="radio"
            name="slot"
            value={FUORI_PIANO}
            checked={scelta === FUORI_PIANO}
            onChange={(e) => setScelta(e.target.value)}
          />
          <span className="font-medium text-gray-700">Visita fuori piano</span>
        </label>
      </fieldset>

      {/* Tipologia verbale — solo con >1 modulo sulla sede e per la visita fuori
          piano (gli slot ereditano il modulo del proprio piano). */}
      {selettoreModulo && scelta === FUORI_PIANO && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-700">Tipologia verbale</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {moduli.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 has-[:checked]:border-[#1e3a5f] has-[:checked]:bg-[#1e3a5f]/5"
              >
                <input
                  type="radio"
                  name="modulo"
                  value={m.id}
                  checked={modulo === m.id}
                  onChange={(e) => setModulo(e.target.value)}
                />
                <span className="font-medium text-gray-800">{m.nomeBreve}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {mismatch && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Questo slot è assegnato a {mismatch}. La visita risulterà compilata da te.
        </p>
      )}

      {errore && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errore}</p>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={avvia}
          disabled={creando || !scelta || moduloMancante}
          className="min-h-[40px] rounded-lg bg-[#1e3a5f] px-4 text-sm font-semibold text-white transition enabled:hover:bg-[#16304e] disabled:opacity-50"
        >
          {creando ? "Creazione…" : "Nuova visita"}
        </button>
      </div>
    </div>
  );
}
