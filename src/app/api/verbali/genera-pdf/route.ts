import { NextResponse } from "next/server";
import { generaPDFVerbale } from "@/lib/pdf/generator";
import { datiTest } from "@/lib/pdf/dati-test";

export async function GET() {
  try {
    const buffer = await generaPDFVerbale(datiTest);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="verbale-test-${datiTest.numero_verbale}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Errore generazione PDF:", error);
    return NextResponse.json(
      { error: "Errore generazione PDF", details: String(error) },
      { status: 500 }
    );
  }
}
