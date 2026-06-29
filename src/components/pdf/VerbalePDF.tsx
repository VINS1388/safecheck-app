import { Document } from "@react-pdf/renderer";
import { PaginaCopertina } from "./Copertina";
import { PaginaRiepilogo } from "./RiepilogoEsecutivo";
import { PaginaDettaglio } from "./DettaglioSezioni";
import { PaginaFirme } from "./Firme";
import type { DatiVerbale } from "@/types/verbale";

export function VerbalePDF({ dati }: { dati: DatiVerbale }) {
  return (
    <Document
      title={`Verbale ${dati.numero_verbale}`}
      author="SafeCheck"
      subject="Verbale di sopralluogo sicurezza sul lavoro"
    >
      <PaginaCopertina dati={dati} />
      <PaginaRiepilogo dati={dati} />
      <PaginaDettaglio dati={dati} />
      <PaginaFirme dati={dati} />
    </Document>
  );
}
