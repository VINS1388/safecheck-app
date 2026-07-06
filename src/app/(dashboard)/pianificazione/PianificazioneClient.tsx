"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn, formatDate } from "@/lib/utils";
import { differenzaGiorni } from "@/lib/scadenze/calcola";
import { ETICHETTE_STATO_SLOT } from "@/types";
import type { StatoSlot } from "@/types";
import { salvaSlotAction, ripristinaDefaultSlotAction } from "./actions";

export interface SlotRiga {
  id: string;
  clienteId: string;
  clienteNome: string;
  sedeNome: string;
  numeroVisita: number;
  cicloNumero: number;
  dataSuggerita: string;
  dataPianificata: string | null;
  stato: StatoSlot;
  visitaId: string | null;
  tecnicoId: string | null;
  tecnicoNome: string | null;
  tecnicoDisattivato: boolean; // tecnico assegnato ma ora disattivato (slot storico)
  tecnicoPersonalizzato: boolean;
}

interface Props {
  slots: SlotRiga[]; // già filtrati server-side dalla FilterBar (URL)
  tecnici: { id: string; nome: string }[];
  oggi: string; // ISO yyyy-mm-dd (data server)
  canManage: boolean; // admin/planner: può modificare data/tecnico degli slot
}

type Urgenza = "scaduta" | "vicina" | "ok" | "neutro";

const BADGE_STATO: Record<StatoSlot, string> = {
  da_pianificare: "bg-gray-100 text-gray-600",
  pianificata: "bg-blue-100 text-blue-700",
  eseguita: "bg-green-100 text-green-700",
};

const BORDO_URGENZA: Record<Urgenza, string> = {
  scaduta: "border-l-4 border-l-red-500",
  vicina: "border-l-4 border-l-amber-400",
  ok: "border-l-4 border-l-green-400",
  neutro: "border-l-4 border-l-gray-200",
};

/**
 * Stato derivato "in lavorazione" (Opzione A): lo slot ha una bozza collegata
 * (visita_id) ma non è ancora eseguito. È un overlay ORTOGONALE al ciclo di vita
 * DB dello slot — resta genuinamente `pianificata`/`da_pianificare` — non un 4°
 * valore enum.
 */
function inLavorazione(s: SlotRiga): boolean {
  return s.visitaId != null && s.stato !== "eseguita";
}

function urgenzaDi(s: SlotRiga, oggi: string): Urgenza {
  if (s.stato === "eseguita") return "neutro";
  // Bozza già in corso su questo slot: non è un ritardo di pianificazione →
  // niente allarme rosso/amber, il lavoro è avviato.
  if (inLavorazione(s)) return "neutro";
  const eff = s.dataPianificata ?? s.dataSuggerita;
  if (eff < oggi) return "scaduta";
  return differenzaGiorni(eff, oggi) <= 30 ? "vicina" : "ok";
}

export default function PianificazioneClient({ slots, tecnici, oggi, canManage }: Props) {
  const router = useRouter();
  const [asc, setAsc] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState("");
  const [editTecnico, setEditTecnico] = useState<string>(""); // "" = da assegnare
  const [editTecnicoIniziale, setEditTecnicoIniziale] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // I filtri (cliente/sede/tecnico/stato/periodo) sono applicati server-side dalla
  // FilterBar (URL): qui resta solo l'ordinamento per data effettiva.
  const righe = useMemo(() => {
    return [...slots].sort((a, b) => {
      const da = a.dataPianificata ?? a.dataSuggerita;
      const db = b.dataPianificata ?? b.dataSuggerita;
      return asc ? da.localeCompare(db) : db.localeCompare(da);
    });
  }, [slots, asc]);

  function apriEdit(s: SlotRiga) {
    setEditId(s.id);
    setEditData(s.dataPianificata ?? s.dataSuggerita);
    const iniziale = s.tecnicoId ?? "";
    setEditTecnico(iniziale);
    setEditTecnicoIniziale(iniziale);
    setErrore(null);
  }

  function chiudiEdit() {
    setEditId(null);
    setEditData("");
    setEditTecnico("");
    setEditTecnicoIniziale("");
    setErrore(null);
  }

  async function salvaSlot(s: SlotRiga) {
    if (!editData) {
      setErrore("Seleziona una data.");
      return;
    }
    // Dirty-tracking: passa solo i campi realmente modificati. Confronto sul
    // valore iniziale dello slot, non sulla presenza nel form — così salvare la
    // sola data non altera il tecnico né il flag di personalizzazione.
    const dataDirty = editData !== (s.dataPianificata ?? "");
    const tecnicoDirty = editTecnico !== editTecnicoIniziale;
    if (!dataDirty && !tecnicoDirty) {
      chiudiEdit();
      return;
    }
    setSalvando(true);
    setErrore(null);
    const res = await salvaSlotAction(s.id, {
      ...(dataDirty ? { dataPianificata: editData } : {}),
      ...(tecnicoDirty ? { tecnico: { id: editTecnico || null } } : {}),
    });
    setSalvando(false);
    if (res.ok) {
      chiudiEdit();
      router.refresh();
    } else {
      setErrore(res.error);
    }
  }

  async function ripristinaDefault(slotId: string) {
    setSalvando(true);
    setErrore(null);
    const res = await ripristinaDefaultSlotAction(slotId);
    setSalvando(false);
    if (res.ok) {
      chiudiEdit();
      router.refresh();
    } else {
      setErrore(res.error);
    }
  }

  return (
    <div>
      {/* Ordinamento (i filtri sono nella FilterBar sopra) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAsc((v) => !v)}
          className="min-h-[40px] rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Data {asc ? "↑ crescente" : "↓ decrescente"}
        </button>
        <span className="ml-auto text-sm text-gray-500">{righe.length} visite</span>
      </div>

      {errore && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errore}</p>
      )}

      {righe.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
          Nessuna visita pianificata con questi filtri.
        </p>
      ) : (
        <ul className="space-y-2">
          {righe.map((s) => {
            const u = urgenzaDi(s, oggi);
            const dataEff = s.dataPianificata ?? s.dataSuggerita;
            // La modifica di data/tecnico è governance: solo admin/planner.
            const modificabile = canManage && s.stato !== "eseguita";
            const lavorazione = inLavorazione(s);
            const inEdit = editId === s.id;
            return (
              <li
                key={s.id}
                className={cn("rounded-lg border border-gray-200 bg-white p-3 shadow-sm", BORDO_URGENZA[u])}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {s.clienteNome} <span className="font-normal text-gray-500">· {s.sedeNome}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      Visita {s.numeroVisita} (ciclo {s.cicloNumero})
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                      {s.tecnicoId ? (
                        s.tecnicoDisattivato ? (
                          <span
                            className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-600"
                            title="Il tecnico assegnato è stato disattivato: lo slot resta assegnato a lui finché non viene riassegnato manualmente."
                          >
                            {s.tecnicoNome ? `${s.tecnicoNome} · ` : ""}Tecnico disattivato
                          </span>
                        ) : (
                          <span className="text-gray-600">{s.tecnicoNome ?? "—"}</span>
                        )
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          Da assegnare
                        </span>
                      )}
                      {s.tecnicoPersonalizzato && (
                        <span
                          title="Assegnato manualmente — non seguirà i cambi di tecnico predefinito del piano"
                          aria-label="Assegnato manualmente"
                          className="text-[#1e3a5f]"
                        >
                          📌
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={cn("text-sm font-medium", u === "scaduta" ? "text-red-600" : "text-gray-800")}>
                        {formatDate(dataEff)}
                      </p>
                      {!s.dataPianificata && <p className="text-[11px] text-gray-400">(suggerita)</p>}
                    </div>
                    {lavorazione ? (
                      <span
                        className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700"
                        title="Bozza collegata a questo slot, non ancora chiusa"
                      >
                        In lavorazione
                      </span>
                    ) : (
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", BADGE_STATO[s.stato])}>
                        {ETICHETTE_STATO_SLOT[s.stato]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Azioni. Modifica data/tecnico = solo admin/planner (modificabile).
                    I link di navigazione (Apri verbale/bozza) restano per tutti. */}
                {modificabile && inEdit ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        Data
                      </label>
                      <input
                        type="date"
                        value={editData}
                        onChange={(e) => setEditData(e.target.value)}
                        className="min-h-[38px] rounded-lg border border-gray-300 px-2 text-sm"
                      />
                      <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        Tecnico
                      </label>
                      <select
                        value={editTecnico}
                        onChange={(e) => setEditTecnico(e.target.value)}
                        className="min-h-[38px] rounded-lg border border-gray-300 px-2 text-sm"
                      >
                        <option value="">Da assegnare</option>
                        {/* Slot storico assegnato a un tecnico disattivato: opzione
                            disabilitata (non riassegnabile) solo per mostrare il valore
                            corrente finché l'admin non sceglie un tecnico attivo. */}
                        {s.tecnicoDisattivato && s.tecnicoId && (
                          <option value={s.tecnicoId} disabled>
                            {(s.tecnicoNome ?? "Tecnico") + " · disattivato"}
                          </option>
                        )}
                        {tecnici.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => salvaSlot(s)}
                        disabled={salvando}
                        className="min-h-[38px] rounded-lg bg-[#1e3a5f] px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {salvando ? "…" : "Salva"}
                      </button>
                      <button
                        type="button"
                        onClick={chiudiEdit}
                        className="min-h-[38px] rounded-lg border border-gray-300 px-3 text-xs text-gray-600"
                      >
                        Annulla
                      </button>
                      {s.tecnicoPersonalizzato && (
                        <button
                          type="button"
                          onClick={() => ripristinaDefault(s.id)}
                          disabled={salvando}
                          className="ml-auto text-xs font-medium text-gray-500 hover:text-[#1e3a5f] hover:underline disabled:opacity-50"
                        >
                          Ripristina tecnico predefinito del piano
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    {modificabile && (
                      <button
                        type="button"
                        onClick={() => apriEdit(s)}
                        className="text-xs font-medium text-[#1e3a5f] hover:underline"
                      >
                        {s.dataPianificata ? "Modifica data / tecnico" : "Pianifica (data / tecnico)"}
                      </button>
                    )}
                    {s.stato === "eseguita" && s.visitaId && (
                      <Link
                        href={`/visite/${s.visitaId}/checklist`}
                        className="text-xs font-medium text-[#1e3a5f] hover:underline"
                      >
                        Apri verbale →
                      </Link>
                    )}
                    {lavorazione && s.visitaId && (
                      <Link
                        href={`/visite/${s.visitaId}/avvia`}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        Apri bozza →
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
