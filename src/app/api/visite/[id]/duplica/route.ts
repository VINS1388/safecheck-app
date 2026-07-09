import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVisitaById } from "@/lib/db/queries/visite";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";

export const runtime = "nodejs";

/**
 * POST /api/visite/:id/duplica
 * Deep clone di un verbale CHIUSO verso una nuova bozza indipendente
 * (genealogia: derivato_da). Nessun limite al numero di duplicazioni.
 * Validazione stato sempre server-side: 403 se non chiuso.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // getVisitaById è RLS-bound: null se non di proprietà del chiamante.
  const visita = await getVisitaById(id);
  if (!visita) {
    return NextResponse.json({ error: "Verbale non trovato" }, { status: 404 });
  }

  // Duplica disponibile SOLO da verbale chiuso (stato_verbale = 'chiuso').
  if (visita.stato_verbale !== "chiuso") {
    return NextResponse.json(
      { error: "La duplicazione è disponibile solo da un verbale chiuso." },
      { status: 403 }
    );
  }

  const { data: nuovoId, error } = await supabase.rpc("clona_visita", {
    p_source_id: id,
    p_sostitutivo: false,
  });
  if (error || !nuovoId) {
    return NextResponse.json(
      { error: `Duplicazione fallita: ${error?.message ?? "errore sconosciuto"}` },
      { status: 500 }
    );
  }

  // Audit (best-effort): UN solo evento, entity = il verbale SORGENTE duplicato.
  await logAuditEvent({
    entityType: "verbale",
    entityId: id,
    eventType: "verbale.duplicato",
    actorUserId: user.id,
    payload: { originale_id: id, nuovo_id: nuovoId },
  });

  return NextResponse.json({ success: true, visita_id: nuovoId });
}
