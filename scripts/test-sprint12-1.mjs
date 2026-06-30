// Test Sprint 12.1 — sotto-sezione sorveglianza sanitaria (gate) in SEZ-01.
// In-memory (nessuna scrittura su DB): usa il template v6 reale (read-only) e
// le funzioni reali (domandaGateAttiva, rispostaCompleta, sezioneCollassata,
// generaVerbale).
//
// Uso: node --experimental-strip-types --experimental-loader ./scripts/alias-hook.mjs scripts/test-sprint12-1.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import pg from "pg";
import { generaVerbale } from "@/lib/pdf/generaVerbale";
import { domandaGateAttiva, sezioneCollassata } from "@/lib/checklist/completa";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
function dbUrl() {
  for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i < 0) continue;
    if (l.slice(0, i).trim() === "DATABASE_URL")
      return l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("no DATABASE_URL");
}
const u = new URL(dbUrl());
const c = new pg.Client({
  host: "aws-1-eu-central-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${REF}`,
  password: decodeURIComponent(u.password),
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await c.connect();
const { rows } = await c.query(`SELECT struttura_json FROM template_master WHERE attivo=true LIMIT 1;`);
await c.end();
const template = rows[0].struttura_json;
const sez01 = template.sezioni.find((s) => s.id === "SEZ-01");
const GATE = "D-01-012";
const SUB = ["D-01-014", "D-01-015", "D-01-016"];

let fail = false;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) fail = true;
};

const sub014 = sez01.domande.find((d) => d.id === "D-01-014");
check("3 domande gate presenti (gated_by=D-01-012)", sez01.domande.filter((d) => d.gated_by === GATE).length === 3);
check("D-01-016 ha campo_data", sez01.domande.find((d) => d.id === "D-01-016")?.campo_data === true);
check("template v6", template.versione === 6);

// Valutazione completezza SEZ-01 (replica logica route, con gate).
function valutaSez01(risp) {
  let obbligatorieMancanti = 0;
  let campiTestoMancanti = 0;
  for (const d of sez01.domande) {
    const gv = d.gated_by ? risp[d.gated_by]?.esito ?? null : null;
    if (d.gated_by && !domandaGateAttiva(d, gv)) continue;
    const r = risp[d.id];
    const v = r?.esito ?? null;
    if (!v) {
      if (d.obbligatoria) obbligatorieMancanti += 1;
      continue;
    }
    if (v === "NC" || v === "PC") {
      if (!(r?.azione ?? "").trim()) campiTestoMancanti += 1;
    } else if (v === "NV" || v === "NA") {
      if (!(r?.osservazione ?? "").trim()) campiTestoMancanti += 1;
    }
  }
  return { obbligatorieMancanti, campiTestoMancanti, bloccato: obbligatorieMancanti > 0 || campiTestoMancanti > 0 };
}

// Tutte le domande base SEZ-01 (non gate) risposte C; filtro + sub parametrici.
function baseSez01(filtro, sub = {}) {
  const r = {};
  for (const d of sez01.domande) {
    if (d.id === GATE || d.gated_by) continue;
    r[d.id] = { esito: "C", azione: "", osservazione: "", dataVerifica: "" };
  }
  r[GATE] = filtro;
  for (const [id, v] of Object.entries(sub)) r[id] = v;
  return r;
}

// ── SCENARIO A — filtro NC: sotto-sezione aperta, blocca finché non risposte ─
console.log("\n── SCENARIO A — filtro = NC (aperta) ──");
{
  const aperta = domandaGateAttiva(sub014, "NC");
  check("gate attivo con NC", aperta === true);
  const risp = baseSez01({ esito: "NC", azione: "Predisporre sorveglianza.", osservazione: "", dataVerifica: "" });
  const v1 = valutaSez01(risp);
  check("3 sub non risposte → obbligatorieMancanti = 3, bloccato", v1.obbligatorieMancanti === 3 && v1.bloccato, `mancanti=${v1.obbligatorieMancanti}`);
  for (const id of SUB) risp[id] = { esito: "C", azione: "", osservazione: "", dataVerifica: "" };
  const v2 = valutaSez01(risp);
  check("3 sub risposte → non bloccato", !v2.bloccato && v2.obbligatorieMancanti === 0);
}

// ── SCENARIO B — filtro NA: collassata, 3 assenti, non blocca, PDF senza ─────
console.log("\n── SCENARIO B — filtro = NA (collassata) ──");
{
  check("gate inattivo con NA", domandaGateAttiva(sub014, "NA") === false);
  check("gate inattivo con NV", domandaGateAttiva(sub014, "NV") === false);
  const risp = baseSez01({ esito: "NA", azione: "", osservazione: "Nessun rischio che richieda sorveglianza.", dataVerifica: "" });
  const v = valutaSez01(risp);
  check("non bloccato (3 sub non richieste)", !v.bloccato, JSON.stringify(v));
  const buf = await generaVerbale(datiPDF(risp));
  const txt = decodePdf(buf);
  check("PDF: D-01-014 (giudizio idoneità) ASSENTE", !txt.includes("giudizio di idoneità"));
  check("PDF: domanda filtro presente", txt.includes("Necessità di sorveglianza sanitaria"));
}

// ── SCENARIO C — D-01-016 con data → PDF formattato ─────────────────────────
console.log("\n── SCENARIO C — data sopralluogo MC nel PDF ──");
{
  const risp = baseSez01(
    { esito: "C", azione: "", osservazione: "", dataVerifica: "" },
    {
      "D-01-014": { esito: "C", azione: "", osservazione: "", dataVerifica: "" },
      "D-01-015": { esito: "C", azione: "", osservazione: "", dataVerifica: "" },
      "D-01-016": { esito: "C", azione: "", osservazione: "", dataVerifica: "2025-04-15" },
    }
  );
  const buf = await generaVerbale(datiPDF(risp));
  const txt = decodePdf(buf);
  check("PDF: domande sorveglianza presenti (giudizio idoneità)", txt.includes("giudizio di idoneità"));
  check("PDF: data sopralluogo formattata (aprile 2025)", /aprile 2025/i.test(txt));
}

// ── SCENARIO D — NC su D-01-014 senza azione → blocca ───────────────────────
console.log("\n── SCENARIO D — NC senza azione blocca ──");
{
  const risp = baseSez01(
    { esito: "C", azione: "", osservazione: "", dataVerifica: "" },
    {
      "D-01-014": { esito: "NC", azione: "", osservazione: "", dataVerifica: "" },
      "D-01-015": { esito: "C", azione: "", osservazione: "", dataVerifica: "" },
      "D-01-016": { esito: "C", azione: "", osservazione: "", dataVerifica: "" },
    }
  );
  const v1 = valutaSez01(risp);
  check("NC senza azione → campiTestoMancanti ≥ 1, bloccato", v1.campiTestoMancanti >= 1 && v1.bloccato, `campiMancanti=${v1.campiTestoMancanti}`);
  risp["D-01-014"].azione = "Acquisire i giudizi di idoneità.";
  const v2 = valutaSez01(risp);
  check("con azione → non bloccato", !v2.bloccato);
}

// ── SCENARIO E — snapshot legacy (senza le 3 domande) invariato ─────────────
console.log("\n── SCENARIO E — legacy senza le 3 domande ──");
{
  const sez01Legacy = { ...sez01, domande: sez01.domande.filter((d) => !d.gated_by) };
  const templateLegacy = { ...template, sezioni: template.sezioni.map((s) => (s.id === "SEZ-01" ? sez01Legacy : s)) };
  check("legacy: nessuna domanda gate", sez01Legacy.domande.every((d) => !d.gated_by));
  // risposte solo base (filtro incluso ma niente sub)
  const risp = {};
  for (const d of sez01Legacy.domande) risp[d.id] = { esito: "C", azione: "", osservazione: "", dataVerifica: "" };
  const buf = await generaVerbale({ ...datiPDF(risp), template: templateLegacy });
  const txt = decodePdf(buf);
  check("PDF legacy: D-01-014 assente (non esiste nello snapshot)", !txt.includes("giudizio di idoneità"));
}

// ── SCENARIO F — regressione collasso SEZ-08 ────────────────────────────────
console.log("\n── SCENARIO F — regressione motore SEZ-08 ──");
{
  const sez08 = { domanda_filtro: "D-08-001" };
  check("SEZ-08 collassa su NA", sezioneCollassata(sez08, "NA") === true);
  check("SEZ-08 NON collassa su NC", sezioneCollassata(sez08, "NC") === false);
  check("SEZ-08 NON collassa su null", sezioneCollassata(sez08, null) === false);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function datiPDF(risp) {
  const risposte = {};
  for (const [id, e] of Object.entries(risp)) {
    risposte[id] = {
      esito: e.esito,
      azione_correttiva: e.azione || null,
      osservazione_evidenza: null,
      osservazioni: e.osservazione || null,
      data_verifica: e.dataVerifica || null,
    };
  }
  return {
    visita: { id: "test", data_visita: "2026-06-30", ora_inizio: "09:30:00", note_preliminari: null, note_finali_visita: null, numero_verbale: "SC-2026-TEST" },
    cliente: { ragione_sociale: "Pane Pizza Srl" },
    sede: { nome: "Sede", indirizzo: "Via Roma 1", citta: "Palermo" },
    specialist: { nome_completo: "Mario Rossi", qualifica: "RSPP" },
    referente_cliente: null,
    nominativi: {},
    template,
    risposte,
  };
}

function decodePdf(buf) {
  const zlib = require("zlib");
  const s = buf.toString("latin1");
  let out = "";
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const st = m.index + m[0].length;
    const en = buf.indexOf("endstream", st);
    if (en < 0) continue;
    let inf;
    try { inf = zlib.inflateSync(buf.subarray(st, en)).toString("latin1"); } catch { continue; }
    inf.replace(/<([0-9A-Fa-f]+)>/g, (_, h) => {
      for (let i = 0; i + 1 < h.length; i += 2) out += String.fromCharCode(parseInt(h.substr(i, 2), 16));
      return "";
    });
  }
  return out;
}

console.log(fail ? "\n✗ TEST FALLITO" : "\n✓ TUTTI GLI SCENARI OK");
process.exit(fail ? 1 : 0);
