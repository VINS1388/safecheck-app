import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVisitaById } from "@/lib/db/queries/visite";
import {
  BUCKET_VERBALI,
  getVerbalePdfByVisita,
} from "@/lib/db/queries/verbali";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Autenticazione
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // 2. Verifica accesso alla visita (RLS) e recupera il numero verbale
  const visita = await getVisitaById(id);
  if (!visita) {
    return NextResponse.json({ error: "Visita non trovata" }, { status: 404 });
  }

  // 3. Record verbale
  const record = await getVerbalePdfByVisita(id);
  if (!record) {
    return NextResponse.json(
      { error: "Nessun verbale PDF per questa visita" },
      { status: 404 }
    );
  }

  // 4. Download dal bucket privato (service role: nessun URL pubblico)
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET_VERBALI)
    .download(record.storage_path);
  if (error || !data) {
    return NextResponse.json(
      { error: "File verbale non disponibile nello storage" },
      { status: 404 }
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  const filename = `${visita.numero_verbale ?? "verbale"}.pdf`;

  // 5. Stream del PDF tramite route autenticata
  return new NextResponse(new Uint8Array(arrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(arrayBuffer.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
