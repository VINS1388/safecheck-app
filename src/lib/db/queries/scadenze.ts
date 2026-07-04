import { createClient } from "@/lib/supabase/server";
import { getScopeVisibilita } from "@/lib/auth/scope";
import type {
  Scadenza,
  StatoScadenza,
  TipoScadenza,
  FiltroScadenze,
} from "@/lib/scadenze/calcola";

// Vista read-only sulle scadenze (Sprint 12.3). Fonte di verità: Supabase.
// RLS single-tenant (auth.uid() IS NOT NULL) — qui nessun controllo permessi
// replicato, solo lettura. Nessuna scrittura in questo sprint (le scadenze
// manuali arriveranno con Sprint 13).

/** Scadenza arricchita con i nomi di cliente/sede per la lista. */
export interface ScadenzaRiga extends Scadenza {
  clienteNome: string | null;
  sedeNome: string | null;
}

interface ScadenzaRow {
  id: string;
  tipo: string;
  cliente_id: string | null;
  sede_id: string | null;
  riferimento_tipo: string;
  riferimento_id: string;
  data_riferimento: string | null;
  periodicita_mesi: number | null;
  data_scadenza: string;
  stato: string;
  note: string | null;
  clienti: { ragione_sociale: string } | { ragione_sociale: string }[] | null;
  sedi: { nome: string } | { nome: string }[] | null;
}

function nome(rel: { [k: string]: string } | { [k: string]: string }[] | null, key: string): string | null {
  if (!rel) return null;
  const r = Array.isArray(rel) ? rel[0] : rel;
  return (r?.[key] as string) ?? null;
}

function mapRiga(r: ScadenzaRow): ScadenzaRiga {
  return {
    id: r.id,
    tipo: r.tipo as TipoScadenza,
    clienteId: r.cliente_id,
    sedeId: r.sede_id,
    riferimentoTipo: r.riferimento_tipo,
    riferimentoId: r.riferimento_id,
    dataRiferimento: r.data_riferimento,
    periodicitaMesi: r.periodicita_mesi,
    dataScadenza: r.data_scadenza,
    stato: r.stato as StatoScadenza,
    note: r.note,
    clienteNome: nome(r.clienti, "ragione_sociale"),
    sedeNome: nome(r.sedi, "nome"),
  };
}

/**
 * Scadenze ordinate per data_scadenza crescente, filtrabili per
 * stato/cliente/sede. La vista usa di default `stato='attiva'`.
 */
export async function getScadenze(filtro: FiltroScadenze = {}): Promise<ScadenzaRiga[]> {
  const supabase = await createClient();

  // Sprint 16: il tecnico vede solo le scadenze delle sedi raggiungibili
  // (coerente con la futura RLS su scadenze); admin/planner vedono tutto.
  const scope = await getScopeVisibilita();
  if (scope.mode === "none") return [];

  let q = supabase
    .from("scadenze")
    .select(
      "id, tipo, cliente_id, sede_id, riferimento_tipo, riferimento_id, data_riferimento, periodicita_mesi, data_scadenza, stato, note, clienti(ragione_sociale), sedi(nome)"
    )
    .order("data_scadenza", { ascending: true });

  if (scope.mode === "tecnico") {
    if (scope.sedeIds.size === 0) return [];
    q = q.in("sede_id", Array.from(scope.sedeIds));
  }

  if (filtro.stato) q = q.eq("stato", filtro.stato);
  if (filtro.clienteId) q = q.eq("cliente_id", filtro.clienteId);
  if (filtro.sedeId) q = q.eq("sede_id", filtro.sedeId);

  const { data, error } = await q;
  if (error || !data) return [];
  return (data as unknown as ScadenzaRow[]).map(mapRiga);
}
