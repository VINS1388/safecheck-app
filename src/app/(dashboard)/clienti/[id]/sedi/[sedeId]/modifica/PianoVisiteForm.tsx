"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn, formatDate } from "@/lib/utils";
import { ETICHETTE_STATO_SLOT } from "@/types";
import type { PianoVisite, StatoSlot, TecnicoOption, VisitaPianificata } from "@/types";
import { salvaPianoAction } from "./actions";

interface Props {
  clienteId: string;
  sedeId: string;
  piano: PianoVisite | null;
  tecnici: TecnicoOption[];
  slots: VisitaPianificata[]; // ciclo corrente
}

const CADENZE = [1, 2, 3, 4, 6, 12];

const INPUT =
  "min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]";

const BADGE_SLOT: Record<StatoSlot, string> = {
  da_pianificare: "bg-gray-100 text-gray-600",
  pianificata: "bg-blue-100 text-blue-700",
  eseguita: "bg-green-100 text-green-700",
};

export default function PianoVisiteForm({ clienteId, sedeId, piano, tecnici, slots }: Props) {
  const router = useRouter();
  const [dataInizio, setDataInizio] = useState(piano?.dataInizioCiclo ?? "");
  const [visiteAnno, setVisiteAnno] = useState(piano?.visiteAnno ?? 2);
  const [tecnico, setTecnico] = useState(piano?.tecnicoAssegnatoId ?? "");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; testo: string } | null>(null);

  const nonEseguiti = slots.filter((s) => s.stato !== "eseguita").length;

  async function salva() {
    if (!dataInizio) {
      setMsg({ tipo: "err", testo: "Inserisci la data di inizio ciclo." });
      return;
    }
    // Conferma esplicita quando si modifica un piano esistente (ricalcolo).
    if (piano) {
      const ok = window.confirm(
        `Verranno rigenerate le date per le ${nonEseguiti} visite non ancora eseguite di questo ciclo. Le visite già eseguite non vengono toccate.`
      );
      if (!ok) return;
    }
    setSalvando(true);
    setMsg(null);
    const res = await salvaPianoAction(clienteId, {
      sedeId,
      dataInizioCiclo: dataInizio,
      visiteAnno,
      tecnicoAssegnatoId: tecnico || null,
    });
    setSalvando(false);
    if (res.ok) {
      setMsg({
        tipo: "ok",
        testo: res.ricalcolato ? "Piano aggiornato e date ricalcolate." : "Piano creato e visite generate.",
      });
      router.refresh();
    } else {
      setMsg({ tipo: "err", testo: res.error });
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Piano visite</h2>
      <p className="mt-0.5 text-sm text-gray-500">
        Contratto di N visite/anno per questa sede. Le date vengono distribuite
        automaticamente sul ciclo e compaiono nella pagina Pianificazione.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Data inizio ciclo contrattuale <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={dataInizio}
            onChange={(e) => setDataInizio(e.target.value)}
            className={`mt-1 ${INPUT}`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Visite / anno</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {CADENZE.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setVisiteAnno(n)}
                className={cn(
                  "min-h-[40px] min-w-[48px] rounded-lg border px-3 text-sm font-semibold transition",
                  visiteAnno === n
                    ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Tecnico assegnato</label>
          <select value={tecnico} onChange={(e) => setTecnico(e.target.value)} className={`mt-1 ${INPUT}`}>
            <option value="">— Nessuno —</option>
            {tecnici.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nomeCompleto} ({t.ruolo})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={salva}
            disabled={salvando}
            className="min-h-[44px] rounded-lg bg-[#1e3a5f] px-5 text-sm font-semibold text-white transition enabled:hover:bg-[#16304e] disabled:opacity-50"
          >
            {salvando ? "Salvataggio…" : piano ? "Aggiorna piano" : "Salva piano"}
          </button>
          {msg && (
            <span className={cn("text-sm", msg.tipo === "ok" ? "text-green-600" : "text-red-600")}>
              {msg.testo}
            </span>
          )}
        </div>
      </div>

      {/* Anteprima slot del ciclo corrente */}
      {piano && slots.length > 0 && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Ciclo {piano.cicloCorrente} — {slots.length} visite
          </p>
          <ul className="mt-2 space-y-1.5">
            {slots.map((s) => {
              const data = s.dataPianificata ?? s.dataSuggerita;
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-700">
                    Visita {s.numeroVisita} · {formatDate(data)}
                    {!s.dataPianificata && <span className="text-gray-400"> (suggerita)</span>}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", BADGE_SLOT[s.stato])}>
                    {ETICHETTE_STATO_SLOT[s.stato]}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
