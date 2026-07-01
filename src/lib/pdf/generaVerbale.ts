import PDFDocument from "pdfkit";
import type {
  EsitoRisposta,
  ImpresaAppalto,
  Lavoratore,
  LivelloRischio,
  NominativiStrutturati,
  RispostaImpresaAppalto,
  TemplateSnapshot,
} from "@/types";
import {
  FIGURE_SICUREZZA,
  SEZIONE_NOMINATIVI,
  ETICHETTE_TIPO_IMPRESA,
} from "@/types";
import { sezioneCollassata, domandaGateAttiva } from "@/lib/checklist/completa";
import { normalizzaNominativi } from "@/lib/nominativi";
import { istanzeFormazione, genericheFormazione } from "@/lib/checklist/formazione";
import { valutaConformitaDaScadenza } from "@/lib/scadenze/calcola";

export interface VerbaleRisposta {
  esito: EsitoRisposta | null;
  azione_correttiva: string | null;
  osservazione_evidenza: string | null;
  osservazioni: string | null;
  data_verifica?: string | null; // SEZ-03 formazione per-nominativo (Sprint 12)
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
  nominativi: NominativiStrutturati;
  template: TemplateSnapshot;
  risposte: Record<string, VerbaleRisposta>;
  // SEZ-08 multi-impresa (Sprint 9.1). Assenti per visite legacy v1.
  impreseAppalto?: ImpresaAppalto[];
  risposteImprese?: RispostaImpresaAppalto[];
  // Formazione lavoratori (Sprint 14). Assenti per visite legacy ≤ v8.
  lavoratori?: Lavoratore[];
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

/** Data compatta gg/mm/aaaa (per le celle di tabella). */
function formatDataBreve(d: string): string {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(d));
  } catch {
    return d;
  }
}

const ETICHETTA_RISCHIO: Record<LivelloRischio, string> = {
  basso: "Basso",
  medio: "Medio",
  alto: "Alto",
};

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

      // Difensivo: normalizza i nominativi (accetta sia il formato strutturato
      // {id,nome} sia eventuali input legacy a stringhe).
      dati = { ...dati, nominativi: normalizzaNominativi(dati.nominativi) };

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
function renderNominativi(doc: Doc, nominativi: NominativiStrutturati): void {
  const righe = FIGURE_SICUREZZA.map((f) => {
    const testo = (nominativi[f.key] ?? []).map((n) => n.nome).join(", ");
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

// Altezza stimata di "intestazione sezione + prima domanda": sotto questa
// soglia non vale la pena iniziare una sezione in fondo alla pagina.
const SOGLIA_NUOVA_SEZIONE = 140;

// ── Sezioni ──────────────────────────────────────────────────────────────
function renderSezioni(doc: Doc, dati: VerbaleData): void {
  const sezioni = [...dati.template.sezioni].sort((a, b) => a.ordine - b.ordine);

  sezioni.forEach((sez, idx) => {
    // La prima sezione inizia sempre su una nuova pagina (dopo la copertina).
    // Le successive continuano sulla pagina corrente se c'è spazio per
    // l'intestazione + la prima domanda, altrimenti vanno a nuova pagina:
    // così si evitano pagine semi-vuote.
    if (idx === 0) {
      doc.addPage();
    } else {
      doc.moveDown(0.6);
      assicuraSpazio(doc, SOGLIA_NUOVA_SEZIONE);
    }
    doc.x = MARGINE;

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

    // Logica condizionale di sezione: se la filtro è NA, stampa solo la domanda
    // filtro (con il suo esito NA) e ometti le altre domande non pertinenti.
    const valoreFiltro = sez.domanda_filtro
      ? dati.risposte[sez.domanda_filtro]?.esito ?? null
      : null;
    const collassata = sezioneCollassata(sez, valoreFiltro);
    // Multi-impresa espansa: come per il collasso, fra le card di sezione si
    // stampa solo la domanda filtro; le D-08-002..009 vanno per impresa sotto.
    const soloFiltro = collassata || (Boolean(sez.multi_impresa) && !collassata);

    // Formazione: id delle domande generiche dirette attive (D-03-005 esclusa
    // quando DL/RSPP sono fusi → gestita come istanza per-nominativo sotto).
    const genFormIds = sez.formazione_per_nominativo
      ? new Set(genericheFormazione(sez, dati.nominativi).map((d) => d.id))
      : null;

    const domande = [...sez.domande]
      .sort((a, b) => a.ordine - b.ordine)
      .filter((d) => !soloFiltro || d.id === sez.domanda_filtro)
      // Formazione per-nominativo: restano dirette solo le generiche attive.
      .filter((d) => !genFormIds || genFormIds.has(d.id))
      // Gate condizionale: omette le sotto-domande non attive (es. sorveglianza
      // sanitaria se la filtro D-01-012 è NA/NV).
      .filter((d) => !d.gated_by || domandaGateAttiva(d, dati.risposte[d.gated_by]?.esito ?? null));
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

      // Campo testo libero (es. elenco imprese appaltatrici): stampato a
      // prescindere dall'esito, con la label del campo_extra. Usa la stessa
      // colonna `osservazione_evidenza`, quindi è alternativo al blocco standard.
      const campoTestoLibero = d.campo_extra?.tipo === "testo_libero";
      if (campoTestoLibero && r?.osservazione_evidenza) {
        doc.moveDown(0.1);
        doc
          .font("Helvetica-Oblique")
          .fontSize(9.5)
          .fillColor(GRIGIO)
          .text(`${d.campo_extra?.label ?? "Annotazione"}: ${r.osservazione_evidenza}`, {
            width: larghezzaContenuto(doc),
          });
      }

      // Osservazione / descrizione evidenza (opzionale) per NC / PC
      if (
        !campoTestoLibero &&
        (esito === "NC" || esito === "PC") &&
        r?.osservazione_evidenza
      ) {
        doc.moveDown(0.1);
        doc
          .font("Helvetica-Oblique")
          .fontSize(9.5)
          .fillColor(GRIGIO)
          .text(`Osservazione: ${r.osservazione_evidenza}`, {
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

      // Campo data (es. sopralluogo annuale MC, D-01-016).
      if (d.campo_data && r?.data_verifica) {
        doc.moveDown(0.1);
        doc
          .font("Helvetica-Oblique")
          .fontSize(9.5)
          .fillColor(GRIGIO)
          .text(`Data: ${formatData(r.data_verifica)}`);
      }

      doc.moveDown(0.5);
      rigaSottile(doc);
      doc.moveDown(0.5);
    }

    // Multi-impresa (Sprint 9.1): dopo la domanda filtro, una sotto-sezione per
    // ogni impresa con le sue risposte alle domande D-08-002..009.
    if (sez.multi_impresa && !collassata) {
      renderImpreseAppalto(doc, sez, dati);
    }

    // Formazione per-nominativo (Sprint 12): domande di formazione raggruppate
    // per figura, una riga per ogni nominativo di SEZ-01.
    if (sez.formazione_per_nominativo) {
      renderFormazioneNominativi(doc, sez, dati);
      // Formazione lavoratori (Sprint 14): tabella riepilogativa dopo le altre
      // domande di formazione. Self-gated (solo snapshot v9+ con D-03-001 iterata).
      renderTabellaLavoratori(doc, sez, dati);
    }
  });
}

// ── Formazione per-nominativo (SEZ-03) ────────────────────────────────────
function renderFormazioneNominativi(
  doc: Doc,
  sez: VerbaleData["template"]["sezioni"][number],
  dati: VerbaleData
): void {
  const istanze = [...istanzeFormazione(sez, dati.nominativi)].sort(
    (a, b) => a.ordine - b.ordine
  );
  if (istanze.length === 0) return;

  // Raggruppa per figura mantenendo l'ordine di prima occorrenza.
  const gruppi: { label: string; key: string; lista: typeof istanze }[] = [];
  for (const i of istanze) {
    let g = gruppi.find((x) => x.key === i.figuraKey);
    if (!g) {
      g = { label: i.figuraLabel, key: i.figuraKey, lista: [] };
      gruppi.push(g);
    }
    g.lista.push(i);
  }

  for (const g of gruppi) {
    assicuraSpazio(doc, 40);
    doc.x = MARGINE;
    doc.fillColor(NERO).font("Helvetica-Bold").fontSize(11).text(g.label);
    doc.moveDown(0.3);

    for (const ist of g.lista) {
      assicuraSpazio(doc, 50);
      doc.x = MARGINE;
      const r = dati.risposte[ist.compositeId] ?? null;
      const esito = r?.esito ?? null;

      doc
        .fillColor(NERO)
        .font("Helvetica")
        .fontSize(10.5)
        .text(ist.testo, { width: larghezzaContenuto(doc) });
      doc.moveDown(0.2);

      const colore = esito ? COLORE_ESITO[esito] : GRIGIO;
      const testoEsito = esito ? `${esito} — ${ETICHETTA_ESITO[esito]}` : "Nessuna risposta";
      doc.font("Helvetica-Bold").fontSize(10).fillColor(colore).text(testoEsito);

      if ((esito === "NC" || esito === "PC") && r?.azione_correttiva) {
        doc.moveDown(0.1);
        doc.font("Helvetica-Oblique").fontSize(9.5).fillColor(GRIGIO).text(
          `Azione correttiva: ${r.azione_correttiva}`,
          { width: larghezzaContenuto(doc) }
        );
      }
      if ((esito === "NV" || esito === "NA") && r?.osservazioni) {
        doc.moveDown(0.1);
        doc.font("Helvetica-Oblique").fontSize(9.5).fillColor(GRIGIO).text(
          `Motivazione: ${r.osservazioni}`,
          { width: larghezzaContenuto(doc) }
        );
      }
      if (r?.data_verifica) {
        doc.moveDown(0.1);
        doc
          .font("Helvetica-Oblique")
          .fontSize(9.5)
          .fillColor(GRIGIO)
          .text(`Data verifica formazione: ${formatData(r.data_verifica)}`);
      }

      doc.moveDown(0.5);
      rigaSottile(doc);
      doc.moveDown(0.5);
    }
    doc.moveDown(0.3);
  }
}

// ── Tabella formazione lavoratori (SEZ-03, Sprint 14) ─────────────────────
const COL_LAV = [
  { key: "nome", label: "Nome e cognome", x: MARGINE, w: 130 },
  { key: "mansione", label: "Mansione", x: MARGINE + 130, w: 115 },
  { key: "rischio", label: "Rischio", x: MARGINE + 245, w: 55 },
  { key: "data", label: "Data formazione", x: MARGINE + 300, w: 105 },
  { key: "stato", label: "Stato", x: MARGINE + 405, w: 90 },
] as const;

// Evidenziazione riga per esito (NC rosso chiaro, PC amber chiaro, C bianco).
const BG_STATO: Record<"C" | "PC" | "NC", string | null> = {
  C: null,
  PC: "#fef3c7",
  NC: "#fee2e2",
};

const RIGA_LAV = 20;

function renderTabellaLavoratori(
  doc: Doc,
  sez: VerbaleData["template"]["sezioni"][number],
  dati: VerbaleData
): void {
  const nodo = sez.domande.find((d) => d.formazione_lavoratori);
  if (!nodo) return; // snapshot legacy ≤ v8: nessuna formazione lavoratori

  assicuraSpazio(doc, 60);
  doc.x = MARGINE;
  doc.fillColor(NERO).font("Helvetica-Bold").fontSize(11).text("Formazione lavoratori");
  doc.moveDown(0.4);

  const lavoratori = dati.lavoratori ?? [];
  if (lavoratori.length === 0) {
    doc
      .fillColor(GRIGIO)
      .font("Helvetica-Oblique")
      .fontSize(9.5)
      .text("Nessun lavoratore registrato.");
    doc.moveDown(0.5);
    return;
  }

  const larghezza = larghezzaContenuto(doc);
  const cell = (testo: string, x: number, y: number, w: number) =>
    doc.text(testo, x + 4, y + 6, { width: w - 8, lineBreak: false, ellipsis: true });

  const intestazione = (y: number) => {
    doc.rect(MARGINE, y, larghezza, RIGA_LAV).fill("#f3f4f6");
    doc.fillColor(GRIGIO).font("Helvetica-Bold").fontSize(8.5);
    for (const c of COL_LAV) cell(c.label, c.x, y, c.w);
  };

  const fondo = doc.page.height - MARGINE - 30;
  let y = doc.y;
  intestazione(y);
  y += RIGA_LAV;

  for (const l of lavoratori) {
    if (y + RIGA_LAV > fondo) {
      doc.addPage();
      y = MARGINE;
      intestazione(y);
      y += RIGA_LAV;
    }
    const esito = l.dataFormazione
      ? valutaConformitaDaScadenza(
          l.dataFormazione,
          nodo.periodicita_mesi ?? null,
          dati.visita.data_visita,
          nodo.soglia_pc_giorni ?? 60
        )
      : null;
    const bg = esito ? BG_STATO[esito] : null;
    if (bg) doc.rect(MARGINE, y, larghezza, RIGA_LAV).fill(bg);

    doc.fillColor(NERO).font("Helvetica").fontSize(9);
    cell(l.nome, COL_LAV[0].x, y, COL_LAV[0].w);
    cell(l.mansione || "—", COL_LAV[1].x, y, COL_LAV[1].w);
    cell(ETICHETTA_RISCHIO[l.livelloRischio], COL_LAV[2].x, y, COL_LAV[2].w);
    cell(l.dataFormazione ? formatDataBreve(l.dataFormazione) : "—", COL_LAV[3].x, y, COL_LAV[3].w);

    doc.fillColor(esito ? COLORE_ESITO[esito] : GRIGIO).font("Helvetica-Bold");
    cell(esito ?? "—", COL_LAV[4].x, y, COL_LAV[4].w);

    doc
      .moveTo(MARGINE, y + RIGA_LAV)
      .lineTo(MARGINE + larghezza, y + RIGA_LAV)
      .strokeColor("#e5e7eb")
      .lineWidth(0.5)
      .stroke();
    y += RIGA_LAV;
  }

  doc.y = y;
  doc.moveDown(0.6);
}

// ── Sotto-sezioni per impresa (SEZ-08 multi-impresa) ──────────────────────
function renderImpreseAppalto(doc: Doc, sez: VerbaleData["template"]["sezioni"][number], dati: VerbaleData): void {
  const imprese = [...(dati.impreseAppalto ?? [])].sort((a, b) => a.ordine - b.ordine);
  const domande = [...sez.domande]
    .filter((d) => d.id !== sez.domanda_filtro)
    .sort((a, b) => a.ordine - b.ordine);

  // Indicizza le risposte per impresa+domanda.
  const perImpresa = new Map<string, Map<string, RispostaImpresaAppalto>>();
  for (const r of dati.risposteImprese ?? []) {
    if (!perImpresa.has(r.impresaId)) perImpresa.set(r.impresaId, new Map());
    perImpresa.get(r.impresaId)!.set(r.domandaId, r);
  }

  if (imprese.length === 0) {
    doc.x = MARGINE;
    doc
      .font("Helvetica-Oblique")
      .fontSize(9.5)
      .fillColor(GRIGIO)
      .text("Nessuna impresa in appalto registrata.", { width: larghezzaContenuto(doc) });
    doc.moveDown(0.5);
    return;
  }

  imprese.forEach((imp) => {
    assicuraSpazio(doc, 80);
    doc.x = MARGINE;

    // Intestazione impresa
    const tipo = ETICHETTE_TIPO_IMPRESA[imp.tipoImpresa] ?? imp.tipoImpresa;
    doc
      .fillColor(NERO)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(imp.ragioneSociale, { width: larghezzaContenuto(doc) });
    doc.fillColor(GRIGIO).font("Helvetica-Oblique").fontSize(9).text(tipo);
    doc.moveDown(0.4);

    const risp = perImpresa.get(imp.id);
    for (const d of domande) {
      assicuraSpazio(doc, 60);
      doc.x = MARGINE;
      const r = risp?.get(d.id) ?? null;
      const esito = r?.esito ?? null;

      doc
        .fillColor(NERO)
        .font("Helvetica")
        .fontSize(10.5)
        .text(d.testo, { width: larghezzaContenuto(doc) });
      doc.moveDown(0.2);

      const colore = esito ? COLORE_ESITO[esito] : GRIGIO;
      const testoEsito = esito ? `${esito} — ${ETICHETTA_ESITO[esito]}` : "Nessuna risposta";
      doc.font("Helvetica-Bold").fontSize(10).fillColor(colore).text(testoEsito);

      if ((esito === "NC" || esito === "PC") && r?.azioneCorrettiva) {
        doc.moveDown(0.1);
        doc
          .font("Helvetica-Oblique")
          .fontSize(9.5)
          .fillColor(GRIGIO)
          .text(`Azione correttiva: ${r.azioneCorrettiva}`, {
            width: larghezzaContenuto(doc),
          });
      }
      if ((esito === "NV" || esito === "NA") && r?.osservazione) {
        doc.moveDown(0.1);
        doc
          .font("Helvetica-Oblique")
          .fontSize(9.5)
          .fillColor(GRIGIO)
          .text(`Motivazione: ${r.osservazione}`, { width: larghezzaContenuto(doc) });
      }

      doc.moveDown(0.5);
      rigaSottile(doc);
      doc.moveDown(0.5);
    }
    doc.moveDown(0.4);
  });
}

// Box "totale" con numero grande e label sotto (es. "28" / "NC totali").
function boxTotale(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  numero: number,
  label: string,
  colore: string
): void {
  const h = 56;
  doc.lineWidth(1).strokeColor("#e5e7eb").roundedRect(x, y, w, h, 6).stroke();
  doc
    .fillColor(colore)
    .font("Helvetica-Bold")
    .fontSize(24)
    .text(String(numero), x, y + 10, { width: w, align: "center" });
  doc
    .fillColor(GRIGIO)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(label, x, y + 40, { width: w, align: "center" });
}

// ── Rilievi conclusivi ───────────────────────────────────────────────────
function renderRilieviConclusivi(doc: Doc, dati: VerbaleData): void {
  // Va a nuova pagina solo se il blocco (titolo + tabella + totali) non entra
  // nello spazio rimanente: evita una pagina dedicata quasi vuota.
  assicuraSpazio(doc, 300);
  doc.x = MARGINE;

  doc
    .fillColor(BRAND)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("Rilievi conclusivi", MARGINE, doc.y);
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
    // Sezione condizionale collassata (filtro = NA): conteggia solo la domanda
    // filtro. La riga mostrerà NA=1 (un solo giudizio reale di non applicabilità),
    // non NA su tutte le domande — rappresentazione onesta delle valutazioni svolte.
    const valoreFiltro = sez.domanda_filtro
      ? dati.risposte[sez.domanda_filtro]?.esito ?? null
      : null;
    const collassata = sezioneCollassata(sez, valoreFiltro);

    if (sez.multi_impresa && !collassata) {
      // Multi-impresa espansa: filtro + tutte le risposte di tutte le imprese
      // (N × 8). L'aggregato riflette la somma reale dei giudizi.
      const fe = sez.domanda_filtro ? dati.risposte[sez.domanda_filtro]?.esito : null;
      if (fe) conteggi[fe] += 1;
      for (const r of dati.risposteImprese ?? []) {
        conteggi[r.esito] += 1;
      }
    } else if (sez.formazione_per_nominativo) {
      // SEZ-03 formazione: generiche dirette attive + 1 risposta per istanza
      // (con fusione DL/RSPP applicata).
      for (const d of genericheFormazione(sez, dati.nominativi)) {
        const esito = dati.risposte[d.id]?.esito;
        if (esito) conteggi[esito] += 1;
      }
      for (const ist of istanzeFormazione(sez, dati.nominativi)) {
        const esito = dati.risposte[ist.compositeId]?.esito;
        if (esito) conteggi[esito] += 1;
      }
    } else {
      for (const d of sez.domande) {
        if (collassata && d.id !== sez.domanda_filtro) continue;
        // Sotto-domanda gate non attiva: non conteggiata (es. sorveglianza NA/NV).
        if (d.gated_by && !domandaGateAttiva(d, dati.risposte[d.gated_by]?.esito ?? null)) continue;
        const esito = dati.risposte[d.id]?.esito;
        if (esito) conteggi[esito] += 1;
      }
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

  // IMPORTANTE: le celle sopra usano coordinate x esplicite e lasciano doc.x
  // sull'ultima colonna. Va riportato al margine, altrimenti il testo seguente
  // verrebbe mandato a capo carattere per carattere in una colonna larga ~42px.
  doc.x = MARGINE;
  doc.moveDown(0.5);
  riga(doc);
  doc.moveDown(0.8);

  // Totali come due box affiancati: numero grande + label.
  assicuraSpazio(doc, 70);
  const yBox = doc.y;
  const boxW = 150;
  const gap = 16;
  boxTotale(doc, MARGINE, yBox, boxW, totNC, "NC totali", COLORE_ESITO.NC);
  boxTotale(doc, MARGINE + boxW + gap, yBox, boxW, totPC, "PC totali", COLORE_ESITO.PC);
  doc.x = MARGINE;
  doc.y = yBox + 64;

  // Note finali
  const note = dati.visita.note_finali_visita?.trim();
  if (note) {
    doc.moveDown(0.6);
    assicuraSpazio(doc, 60);
    doc
      .fillColor(NERO)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Note finali", MARGINE, doc.y);
    doc.moveDown(0.3);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(NERO)
      .text(note, MARGINE, doc.y, { width: larghezzaContenuto(doc) });
  }

  // Firme — assicura spazio sufficiente prima del blocco.
  doc.moveDown(2.5);
  assicuraSpazio(doc, 80);
  doc.x = MARGINE;
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

    // Il footer va scritto nell'area del margine inferiore. Scrivere testo sotto
    // `page.height - margins.bottom` farebbe aggiungere a PDFKit una pagina vuota
    // per ogni footer: azzeriamo temporaneamente il margine inferiore di questa
    // pagina per disabilitare l'auto-impaginazione, poi lo ripristiniamo.
    const bottomOrig = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = doc.page.height - 35;
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

    doc.page.margins.bottom = bottomOrig;
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
