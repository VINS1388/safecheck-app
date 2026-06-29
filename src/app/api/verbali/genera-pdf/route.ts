import { NextResponse } from "next/server";

export async function POST() {
  // TODO: implementare la generazione PDF server-side (@react-pdf/renderer)
  return NextResponse.json({ ok: false, message: "Not implemented" }, { status: 501 });
}
