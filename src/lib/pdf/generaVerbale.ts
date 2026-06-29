import PDFDocument from "pdfkit";
import type { EsitoRisposta, Nominativi, TemplateSnapshot } from "@/types";
import { FIGURE_SICUREZZA, SEZIONE_NOMINATIVI } from "@/types";

export interface VerbaleRisposta {
  esito: EsitoRisposta | null;
  azione_correttiva: string | null;
  osservazioni: string | null;
}

export interface VerbaleData {
  visita: {
    id: string;
    data_visita: string;
    ora_inizio: string | null;
    note_preliminari: string | null;
    note_finali_visita: string | null;
    numero_verbale: string;
  };
  cliente: { ragione_sociale: string };
  sede: { nome: string; indirizzo: string; citta: string };
  specialist: { nome_completo: string; qualifica: string | null };
  referente_cliente: string | null;
  nominativi: Nominativi;
  template: TemplateSnapshot;
  risposte: Record<string, VerbaleRisposta>;
}

const BRAND = "#1e3a5f";
const GRIGIO = "#6b7280";
const NERO = "#111827";

const COLORE_ESITO: Record<EsitoRisposta, string> = {
  C: "#16a34a", // verde
  PC: "#f59e0b", // arancione
  NC: "#dc2626", // rosso
  NV: GRIGIO,
  NA: GRIGIO,
};

const ETICHETTA_ESITO: Record<EsitoRisposta, string> = {
  C: "Conforme",
  PC: "Parzialmente conforme",
  NC: "Non conforme",
  NV: "Non verificato",
  NA: "Non applicabile",
};

const ESITI: EsitoRisposta[] = ["C", "PC", "NC", "NV", "NA"];

function formatData(d: string): string {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(d));
  } catch {
    return d;
  }
}

type Doc = InstanceType<typeof PDFDocument>;

const MARGINE = 50;

function larghezzaContenuto(doc: Doc): number {
  return doc.page.width - MARGINE * 2;
}

/** Aggiunge una nuova pagina se lo spazio rimasto è inferiore a `necessario`. */
function assicuraSpazio(doc: Doc, necessario: number): void {
  const fondo = doc.page.height - MARGINE - 30; // 30 = area footer
  if (doc.y + necessario > fondo) {
    doc.addPage();
  }
}

/**
 * Genera il verbale di sopralluogo in PDF (server-side, PDFKit).
 * Ritorna un Buffer pronto per upload su storage / download.
 */
export async function generaVerbale(dati: VerbaleData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: MARGINE,
        bufferPages: true,
        info: {
          Title: `Verbale ${dati.visita.numero_verbale}`,
          Author: "SafeCheck",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      renderCopertina(doc, dati);
      renderSezioni(doc, dati);
      renderRilieviConclusivi(doc, dati);
      renderFooters(doc, dati);

      doc.end();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

// ── Copertina ──────────────────────────────────────────────────────────────
function renderCopertina(doc: Doc, dati: VerbaleData): void {
  doc.moveDown(2);
  doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(44).text("SafeCheck");
  doc
    .fillColor(GRIGIO)
    .font("Helvetica")
    .fontSize(11)
    .text("Sicurezza sul lavoro — D.Lgs. 81/2008");

  doc.moveDown(2);
  doc
    .fillColor(NERO)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text("Verbale di Sopralluogo — Sicurezza sul Lavoro");

  doc.moveDown(0.5);
  doc
    .fillColor(BRAND)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(dati.visita.numero_verbale);

  doc.moveDown(1.5);
  riga(doc);
  doc.moveDown(1);

  const specialist = dati.specialist.qualifica
    ? `${dati.specialist.nome_completo} (${dati.specialist.qualifica})`
    : dati.specialist.nome_completo;
  const dataOra = dati.visita.ora_inizio
    ? `${formatData(dati.visita.data_visita)} · ore ${dati.visita.ora_inizio.slice(0, 5)}`
    : formatData(dati.visita.data_visita);

  const campi: [string, string][] = [
    ["Data sopralluogo", dataOra],
    ["Azienda", dati.cliente.ragione_sociale],
    ["Sede", `${dati.sede.nome} — ${dati.sede.indirizzo}, ${dati.sede.citta}`],
    ["Specialist", specialist],
    ["Referente cliente", dati.referente_cliente ?? "—"],
  ];

  for (const [label, valore] of campi) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(GRIGIO).text(label);
    doc
      .font("Helvetica")
      .fontSize(12)
      .fillColor(NERO)
      .text(valore, { width: larghezzaContenuto(doc) });
    doc.moveDown(0.8);
  }

  const notePrelim = dati.visita.note_preliminari?.trim();
  if (notePrelim) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(GRIGIO).text("Note preliminari");
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor(NERO)
      .text(notePrelim, { width: larghezzaContenuto(doc) });
    doc.moveDown(0.8);
  }

  doc.moveDown(0.5);
  riga(doc);
}

// ── Nominativi figure sicurezza (SEZ-01) ─────────────────────────────────
function renderNominativi(doc: Doc, nominativi: Nominativi): void {
  const righe = FIGURE_SICUREZZA.map((f) => {
    const v = nominativi[f.key];
    const testo = Array.isArray(v) ? v.join(", ") : (v ?? "");
    return [f.label, testo.trim()] as [string, string];
  }).filter(([, testo]) => testo.length > 0);

  doc
    .fillColor(NERO)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Nominativi figure della sicurezza");
  doc.moveDown(0.3);

  if (righe.length === 0) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(9.5)
      .fillColor(GRIGIO)
      .text("Nessun nominativo indicato.");
  } else {
    for (const [label, testo] of righe) {
      assicuraSpazio(doc, 16);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(GRIGIO).text(`${label}: `, {
        continued: true,
      });
      doc.font("Helvetica").fontSize(9.5).fillColor(NERO).text(testo);
    }
  }

  doc.moveDown(0.6);
  rigaSottile(doc);
  doc.moveDown(0.6);
}

// ── Sezioni ──────────────────────────────────────────────────────────────
function renderSezioni(doc: Doc, dati: VerbaleData): void {
  const sezioni = [...dati.template.sezioni].sort((a, b) => a.ordine - b.ordine);

  for (const sez of sezioni) {
    doc.addPage();

    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(15)
      .text(`${sez.id} — ${sez.nome}`);
    if (sez.descrizione) {
      doc
        .fillColor(GRIGIO)
        .font("Helvetica")
        .fontSize(9)
        .text(sez.descrizione, { width: larghezzaContenuto(doc) });
    }
    doc.moveDown(0.8);

    // SEZ-01: nominativi figure sicurezza prima delle domande
    if (sez.id === SEZIONE_NOMINATIVI) {
      renderNominativi(doc, dati.nominativi);
    }

    const domande = [...sez.domande].sort((a, b) => a.ordine - b.ordine);
    for (const d of domande) {
      assicuraSpazio(doc, 70);

      const r = dati.risposte[d.id];
      const esito = r?.esito ?? null;

      // Testo domanda
      doc
        .fillColor(NERO)
        .font("Helvetica")
        .fontSize(10.5)
        .text(d.testo, { width: larghezzaContenuto(doc) });
      doc.moveDown(0.2);

      // Risposta evidenziata
      const colore = esito ? COLORE_ESITO[esito] : GRIGIO;
      const testoEsito = esito
        ? `${esito} — ${ETICHETTA_ESITO[esito]}`
        : "Nessuna risposta";
      doc.font("Helvetica-Bold").fontSize(10).fillColor(colore).text(testoEsito);

      // Azione correttiva per NC / PC
      if ((esito === "NC" || esito === "PC") && r?.azione_correttiva) {
        doc.moveDown(0.1);
        doc
          .font("Helvetica-Oblique")
          .fontSize(9.5)
          .fillColor(GRIGIO)
          .text(`Azione correttiva: ${r.azione_correttiva}`, {
            width: larghezzaContenuto(doc),
          });
      }

      // Motivazione per NV / NA
      if ((esito === "NV" || esito === "NA") && r?.osservazioni) {
        doc.moveDown(0.1);
        doc
          .font("Helvetica-Oblique")
          .fontSize(9.5)
          .fillColor(GRIGIO)
          .text(`Motivazione: ${r.osservazioni}`, {
            width: larghezzaContenuto(doc),
          });
      }

      doc.moveDown(0.5);
      rigaSottile(doc);
      doc.moveDown(0.5);
    }
  }
}

// ── Rilievi conclusivi ───────────────────────────────────────────────────
function renderRilieviConclusivi(doc: Doc, dati: VerbaleData): void {
  doc.addPage();

  doc
    .fillColor(BRAND)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("Rilievi conclusivi");
  doc.moveDown(0.8);

  // Tabella riepilogativa
  const sezioni = [...dati.template.sezioni].sort((a, b) => a.ordine - b.ordine);
  const colSez = larghezzaContenuto(doc) - 5 * 42;
  const xStart = MARGINE;

  // header
  let y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(GRIGIO);
  doc.text("Sezione", xStart, y, { width: colSez });
  ESITI.forEach((e, i) => {
    doc.text(e, xStart + colSez + i * 42, y, { width: 42, align: "center" });
  });
  doc.moveDown(0.5);
  rigaSottile(doc);
  doc.moveDown(0.3);

  let totNC = 0;
  let totPC = 0;

  for (const sez of sezioni) {
    const conteggi: Record<EsitoRisposta, number> = {
      C: 0,
      PC: 0,
      NC: 0,
      NV: 0,
      NA: 0,
    };
    for (const d of sez.domande) {
      const esito = dati.risposte[d.id]?.esito;
      if (esito) conteggi[esito] += 1;
    }
    totNC += conteggi.NC;
    totPC += conteggi.PC;

    assicuraSpazio(doc, 24);
    y = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(NERO);
    doc.text(sez.id, xStart, y, { width: colSez });
    ESITI.forEach((e, i) => {
      doc
        .fillColor(conteggi[e] > 0 ? COLORE_ESITO[e] : NERO)
        .text(String(conteggi[e]), xStart + colSez + i * 42, y, {
          width: 42,
          align: "center",
        });
    });
    doc.fillColor(NERO);
    doc.moveDown(0.4);
  }

  doc.moveDown(0.5);
  riga(doc);
  doc.moveDown(0.8);

  // Totali in evidenza
  doc.font("Helvetica-Bold").fontSize(12);
  doc.fillColor(COLORE_ESITO.NC).text(`Non conformità (NC) totali: ${totNC}`);
  doc.moveDown(0.2);
  doc
    .fillColor(COLORE_ESITO.PC)
    .text(`Parzialmente conformi (PC) totali: ${totPC}`);

  // Note finali
  const note = dati.visita.note_finali_visita?.trim();
  if (note) {
    doc.moveDown(1.2);
    doc.fillColor(NERO).font("Helvetica-Bold").fontSize(11).text("Note finali");
    doc.moveDown(0.3);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(NERO)
      .text(note, { width: larghezzaContenuto(doc) });
  }

  // Firme
  doc.moveDown(3);
  assicuraSpazio(doc, 80);
  const meta = larghezzaContenuto(doc) / 2;
  const yFirme = doc.y;
  doc.lineWidth(0.7).strokeColor(GRIGIO);
  doc
    .moveTo(MARGINE, yFirme)
    .lineTo(MARGINE + meta - 30, yFirme)
    .stroke();
  doc
    .moveTo(MARGINE + meta + 10, yFirme)
    .lineTo(MARGINE + meta * 2, yFirme)
    .stroke();
  doc.fillColor(GRIGIO).font("Helvetica").fontSize(9);
  doc.text("Firma Specialist", MARGINE, yFirme + 5, { width: meta - 30 });
  doc.text("Firma Referente", MARGINE + meta + 10, yFirme + 5, {
    width: meta - 10,
  });
}

// ── Footer su ogni pagina ────────────────────────────────────────────────
function renderFooters(doc: Doc, dati: VerbaleData): void {
  const dataGen = formatData(new Date().toISOString().slice(0, 10));
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - MARGINE + 5;
    doc.font("Helvetica").fontSize(8).fillColor(GRIGIO);
    doc.text(
      `${dati.visita.numero_verbale}  ·  Generato il ${dataGen}`,
      MARGINE,
      y,
      { width: larghezzaContenuto(doc) / 2, lineBreak: false }
    );
    doc.text(
      `Pagina ${i + 1} / ${range.count}`,
      MARGINE + larghezzaContenuto(doc) / 2,
      y,
      { width: larghezzaContenuto(doc) / 2, align: "right", lineBreak: false }
    );
  }
}

// ── Helpers grafici ──────────────────────────────────────────────────────
function riga(doc: Doc): void {
  const y = doc.y;
  doc
    .lineWidth(1)
    .strokeColor(BRAND)
    .moveTo(MARGINE, y)
    .lineTo(doc.page.width - MARGINE, y)
    .stroke();
  doc.moveDown(0.5);
}

function rigaSottile(doc: Doc): void {
  const y = doc.y;
  doc
    .lineWidth(0.5)
    .strokeColor("#e5e7eb")
    .moveTo(MARGINE, y)
    .lineTo(doc.page.width - MARGINE, y)
    .stroke();
}
