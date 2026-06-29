import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { VerbalePDF } from "@/components/pdf/VerbalePDF";
import type { DatiVerbale } from "@/types/verbale";

export async function generaPDFVerbale(dati: DatiVerbale): Promise<Buffer> {
  const element = createElement(VerbalePDF, { dati }) as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}
