"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import DataTable, { type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";

// Sprint 18.1 — fascia ricerca + facet per la lista clienti ATTIVI. Componente
// isolato (Opzione A): NON estende la FilterBar/lib/filters condivise, così le
// altre pagine che le usano restano intatte. Filtro puramente presentazionale su
// dati già scopati server-side per ruolo (getClienti). Stile allineato ai token
// del design system (stessi input/select/spacing del resto della piattaforma).

export interface ClienteRiga {
  id: string;
  ragione_sociale: string;
  citta: string | null;
  n_sedi: number;
}

type FacetSedi = "tutte" | "con" | "senza";

const controlCls =
  "min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

interface Props {
  clienti: ClienteRiga[];
  /** Empty-state mostrato quando NON esistono clienti attivi (lista non filtrata). */
  vuoto: React.ReactNode;
}

export default function ClientiFiltrati({ clienti, vuoto }: Props) {
  const [q, setQ] = useState("");
  const [facet, setFacet] = useState<FacetSedi>("tutte");

  const filtrati = useMemo(() => {
    const query = q.trim().toLowerCase();
    return clienti.filter((c) => {
      if (query) {
        const testo = `${c.ragione_sociale} ${c.citta ?? ""}`.toLowerCase();
        if (!testo.includes(query)) return false;
      }
      if (facet === "con" && c.n_sedi === 0) return false;
      if (facet === "senza" && c.n_sedi > 0) return false;
      return true;
    });
  }, [clienti, q, facet]);

  const attivi = q.trim() !== "" || facet !== "tutte";

  const columns: Column<ClienteRiga>[] = [
    {
      header: "Ragione sociale",
      className: "font-medium text-gray-900",
      cell: (c) => (
        <Link href={`/clienti/${c.id}`} className="hover:underline">
          {c.ragione_sociale}
        </Link>
      ),
    },
    { header: "Città", className: "text-gray-700", cell: (c) => c.citta ?? "—" },
    {
      header: "Sedi",
      className: "text-gray-700",
      cell: (c) => `${c.n_sedi} sed${c.n_sedi === 1 ? "e" : "i"}`,
    },
    {
      header: "Azioni",
      align: "right",
      cell: (c) => (
        <Link href={`/clienti/${c.id}`} className="font-medium text-brand hover:underline">
          Apri
        </Link>
      ),
    },
  ];

  // Nessun cliente attivo del tutto: nessuna ricerca da offrire → empty-state pieno.
  if (clienti.length === 0) return <>{vuoto}</>;

  const nessunRisultato = (
    <EmptyState
      titolo="Nessun cliente trovato"
      descrizione="Nessun cliente corrisponde alla ricerca o al filtro selezionato."
      compatto
    />
  );

  return (
    <div>
      {/* Fascia ricerca + filtri */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="clienti-ricerca" className="mb-1 block text-xs font-medium text-gray-500">
            Cerca
          </label>
          <input
            id="clienti-ricerca"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ragione sociale o città…"
            className={controlCls}
          />
        </div>
        <div className="sm:w-56">
          <label htmlFor="clienti-sedi" className="mb-1 block text-xs font-medium text-gray-500">
            Sedi operative
          </label>
          <select
            id="clienti-sedi"
            value={facet}
            onChange={(e) => setFacet(e.target.value as FacetSedi)}
            className={controlCls}
          >
            <option value="tutte">Tutte</option>
            <option value="con">Con sedi</option>
            <option value="senza">Senza sedi</option>
          </select>
        </div>
      </div>

      {/* Conteggio risultati quando un filtro è attivo */}
      {attivi && (
        <p className="mb-3 text-sm text-gray-500">
          {filtrati.length} client{filtrati.length === 1 ? "e" : "i"} su {clienti.length}
        </p>
      )}

      <DataTable columns={columns} rows={filtrati} keyOf={(c) => c.id} vuoto={nessunRisultato} />
    </div>
  );
}
