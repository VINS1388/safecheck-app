import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVisitaById } from "@/lib/db/queries/visite";

export const runtime = "nodejs";

/**
 * POST /api/visite/:id/sostitutivo
 * Deep clone di un verbale CHIUSO verso una nuova bozza (genealogia:
 * sostituisce). L'originale passa a "sostituito" e punta al nuovo.
 * Un verbale chiuso può avere AL MASSIMO UN sostitutivo.
 * Validazione sempre server-side: 403 se non chiuso oppure se già sostituito.
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

  const visita = await getVisitaById(id);
  if (!visita) {
    return NextResponse.json({ error: "Verbale non trovato" }, { status: 404 });
  }

  if (visita.stato_verbale !== "chiuso") {
    return NextResponse.json(
      { error: "Il sostitutivo è disponibile solo da un verbale chiuso." },
      { status: 403 }
    );
  }

  // Al massimo un sostitutivo per verbale (difesa anche a livello route).
  if (visita.sostituito_da) {
    return NextResponse.json(
      { error: "Questo verbale è già stato sostituito." },
      { status: 403 }
    );
  }

  const { data: nuovoId, error } = await supabase.rpc("clona_visita", {
    p_source_id: id,
    p_sostitutivo: true,
  });
  if (error || !nuovoId) {
    return NextResponse.json(
      { error: `Creazione sostitutivo fallita: ${error?.message ?? "errore sconosciuto"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, visita_id: nuovoId });
}
