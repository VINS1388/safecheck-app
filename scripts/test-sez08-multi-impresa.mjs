// Test concettuale Sprint 9.1 (SEZ-08 multi-impresa). In-memory, NESSUNA
// scrittura su DB. Carica il template_master attivo (v4, marker multi_impresa),
// simula imprese + risposte per impresa e verifica i 5 scenari A-E.
//
// Uso:
//   node --experimental-strip-types --experimental-loader ./scripts/alias-hook.mjs scripts/test-sez08-multi-impresa.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { generaVerbale } from "@/lib/pdf/generaVerbale";
import {
  sezioneCollassata,
  completezzaImpreseSezioneOtto,
} from "@/lib/checklist/completa";

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
const { rows } = await c.query(
  `SELECT struttura_json FROM template_master WHERE attivo = true LIMIT 1;`
);
await c.end();
const template = rows[0].struttura_json;
const sez08 = template.sezioni.find((s) => s.id === "SEZ-08");
if (!sez08) throw new Error("SEZ-08 assente");
if (!sez08.multi_impresa) throw new Error("SEZ-08 senza marker multi_impresa: applica migration 012");
const DIDS = sez08.domande.filter((d) => d.id !== sez08.domanda_filtro).map((d) => d.id);
console.log("SEZ-08 multi_impresa =", sez08.multi_impresa, "| domande per impresa:", DIDS.length, `(${DIDS.join(", ")})`);

// Risposte SEZ-01..07 tutte C (complete) + filtro D-08-001 = C (sezione espansa).
function baseRisposteMain() {
  const r = {};
  for (const sez of template.sezioni) {
    if (sez.id === "SEZ-08") continue;
    for (const d of sez.domande) r[d.id] = { esito: "C", azione: "", osservazione: "" };
  }
  r["D-08-001"] = { esito: "C", azione: "", osservazione: "" };
  return r;
}

// Validazione completezza — replica esatta del route genera-pdf.
function valuta(risposteMain, imprese, risposteImprese) {
  const mapImp = new Map(risposteImprese.map((r) => [`${r.impresaId}:${r.domandaId}`, r]));
  let obbligatorieMancanti = 0;
  let campiTestoMancanti = 0;
  for (const sez of template.sezioni) {
    const vf = sez.domanda_filtro ? risposteMain[sez.domanda_filtro]?.esito ?? null : null;
    const collassata = sezioneCollassata(sez, vf);
    const multiEspansa = Boolean(sez.multi_impresa) && !collassata;
    for (const d of sez.domande) {
      if (collassata && d.id !== sez.domanda_filtro) continue;
      if (multiEspansa && d.id !== sez.domanda_filtro) continue;
      const r = risposteMain[d.id];
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
    if (multiEspansa) {
      const { mancanti } = completezzaImpreseSezioneOtto(
        DIDS,
        imprese.map((i) => i.id),
        (impId, did) => mapImp.get(`${impId}:${did}`) ?? null
      );
      obbligatorieMancanti += mancanti;
    }
  }
  return { obbligatorieMancanti, campiTestoMancanti, bloccato: obbligatorieMancanti > 0 || campiTestoMancanti > 0 };
}

// Costruisce imprese + risposte flat da una spec [{nome, tipo, esiti:{D-08-00x:"NC"|...}}].
function buildImprese(spec) {
  const imprese = spec.map((s, i) => ({
    id: `imp-${i + 1}`,
    visitaId: "test",
    ragioneSociale: s.nome,
    tipoImpresa: s.tipo,
    ordine: i,
  }));
  const risposteImprese = [];
  const haEsito = new Set();
  spec.forEach((s, i) => {
    const impId = `imp-${i + 1}`;
    for (const [did, esito] of Object.entries(s.esiti)) {
      haEsito.add(`${impId}:${did}`);
      risposteImprese.push({
        id: `${impId}-${did}`,
        impresaId: impId,
        domandaId: did,
        esito,
        osservazione: esito === "NV" || esito === "NA" ? "Motivazione di test." : undefined,
        azioneCorrettiva: esito === "NC" || esito === "PC" ? "Azione correttiva di test." : undefined,
      });
    }
  });
  return { imprese, risposteImprese, haEsito };
}

const tuttiC = Object.fromEntries(DIDS.map((d) => [d, "C"]));
function conNC(n) {
  const e = { ...tuttiC };
  for (let k = 0; k < n; k++) e[DIDS[k]] = "NC";
  return e;
}
function conPC(n) {
  const e = { ...tuttiC };
  for (let k = 0; k < n; k++) e[DIDS[k]] = "PC";
  return e;
}
// Spec parziale: risponde solo alle prime `k` domande.
function parziale(k) {
  const e = {};
  for (let i = 0; i < k; i++) e[DIDS[i]] = "C";
  return e;
}

// Conteggio Rilievi conclusivi per SEZ-08 — replica della logica PDF.
function rilieviSez08(risposteMain, risposteImprese) {
  const conteggi = { C: 0, PC: 0, NC: 0, NV: 0, NA: 0 };
  const vf = risposteMain["D-08-001"]?.esito ?? null;
  const collassata = sezioneCollassata(sez08, vf);
  if (sez08.multi_impresa && !collassata) {
    if (vf) conteggi[vf] += 1;
    for (const r of risposteImprese) conteggi[r.esito] += 1;
  }
  return conteggi;
}

const datiBase = {
  visita: {
    id: "test", data_visita: "2026-06-30", ora_inizio: "09:30:00",
    note_preliminari: "Sopralluogo periodico.", note_finali_visita: "Follow-up a 60 giorni.",
    numero_verbale: "SC-2026-TEST",
  },
  cliente: { ragione_sociale: "Pane Pizza Srl" },
  sede: { nome: "Sede operativa", indirizzo: "Via Roma 1", citta: "Palermo" },
  specialist: { nome_completo: "Mario Rossi", qualifica: "RSPP" },
  referente_cliente: "Luigi Bianchi",
  nominativi: { DL: "Mario Verdi", RSPP: "Mario Rossi" },
  template,
};

function datiPDF(risposteMain, imprese, risposteImprese) {
  const risposte = {};
  for (const [id, e] of Object.entries(risposteMain)) {
    risposte[id] = {
      esito: e.esito,
      azione_correttiva: e.azione || null,
      osservazione_evidenza: null,
      osservazioni: e.osservazione || null,
    };
  }
  return { ...datiBase, risposte, impreseAppalto: imprese, risposteImprese };
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
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

let fail = false;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) fail = true;
};

// ── SCENARIO A: 0 imprese, filtro = C ───────────────────────────────────────
{
  console.log("\n── SCENARIO A — 0 imprese, filtro≠NA (atteso: incompleta, bloccata) ──");
  const main = baseRisposteMain();
  const { imprese, risposteImprese } = buildImprese([]);
  const v = valuta(main, imprese, risposteImprese);
  console.log("  completezza:", JSON.stringify(v));
  check("bloccata con obbligatorieMancanti>0", v.bloccato && v.obbligatorieMancanti === DIDS.length, `mancanti=${v.obbligatorieMancanti}`);
}

// ── SCENARIO B: 1 impresa, 8/8 ───────────────────────────────────────────────
{
  console.log("\n── SCENARIO B — 1 impresa, 8/8 (atteso: completa) ──");
  const main = baseRisposteMain();
  const { imprese, risposteImprese } = buildImprese([
    { nome: "Alfa Impianti Srl", tipo: "appaltatrice", esiti: tuttiC },
  ]);
  const v = valuta(main, imprese, risposteImprese);
  console.log("  completezza:", JSON.stringify(v));
  check("non bloccata (mancanti=0)", !v.bloccato && v.obbligatorieMancanti === 0);
}

// ── SCENARIO C: 3 imprese, 1 completa + 2 parziali ──────────────────────────
{
  console.log("\n── SCENARIO C — 3 imprese (1 completa, 2 parziali) ──");
  const main = baseRisposteMain();
  const { imprese, risposteImprese } = buildImprese([
    { nome: "Alfa Impianti Srl", tipo: "appaltatrice", esiti: tuttiC }, // 8/8
    { nome: "Beta Pulizie Snc", tipo: "subappaltatrice", esiti: parziale(5) }, // 5/8 -> 3 mancanti
    { nome: "Gamma Autonomo", tipo: "lavoratore_autonomo", esiti: parziale(2) }, // 2/8 -> 6 mancanti
  ]);
  const v = valuta(main, imprese, risposteImprese);
  const atteso = 3 + 6; // 9 slot mancanti
  console.log("  completezza:", JSON.stringify(v), "| mancanti attesi:", atteso);
  check("bloccata con mancanti = 9", v.bloccato && v.obbligatorieMancanti === atteso, `mancanti=${v.obbligatorieMancanti}`);
}

// ── SCENARIO D: 3 imprese complete, esiti misti — PDF + rilievi ─────────────
let datiD;
{
  console.log("\n── SCENARIO D — 3 imprese complete, esiti misti (PDF + rilievi) ──");
  const main = baseRisposteMain();
  const { imprese, risposteImprese } = buildImprese([
    { nome: "Alfa Impianti Srl", tipo: "appaltatrice", esiti: tuttiC }, // 8 C
    { nome: "Beta Pulizie Snc", tipo: "subappaltatrice", esiti: conNC(2) }, // 2 NC + 6 C (con azione)
    { nome: "Gamma Autonomo", tipo: "lavoratore_autonomo", esiti: conPC(1) }, // 1 PC + 7 C (con azione)
  ]);
  const v = valuta(main, imprese, risposteImprese);
  check("non bloccata (NC/PC con azione_correttiva)", !v.bloccato && v.obbligatorieMancanti === 0);

  const conteggi = rilieviSez08(main, risposteImprese);
  // Atteso: filtro C(1) + Alfa 8C + Beta 6C+2NC + Gamma 7C+1PC = C:22, NC:2, PC:1
  const attesi = { C: 22, PC: 1, NC: 2, NV: 0, NA: 0 };
  console.log("  rilievi SEZ-08:", JSON.stringify(conteggi), "| attesi:", JSON.stringify(attesi));
  check("conteggio rilievi aggregato corretto (N×8 reale)", JSON.stringify(conteggi) === JSON.stringify(attesi));

  datiD = datiPDF(main, imprese, risposteImprese);
  const buf = await generaVerbale(datiD);
  writeFileSync(join(ROOT, "scripts", "_test-multi-D.pdf"), buf);
  const txt = decodePdf(buf);
  const nPagine = (buf.toString("latin1").match(/\/Type\s*\/Page(?![s])/g) || []).length;
  console.log(`  PDF generato (${buf.length} byte, ${nPagine} pagine)`);
  check("PDF: sotto-sezione Alfa", txt.includes("Alfa Impianti"));
  check("PDF: sotto-sezione Beta", txt.includes("Beta Pulizie"));
  check("PDF: sotto-sezione Gamma", txt.includes("Gamma Autonomo"));
  check("PDF: domanda filtro stampata", txt.includes("Presenza di appalti"));
  check("PDF: tipologia impresa (Appaltatrice)", txt.includes("Appaltatrice"));
}

// ── REGOLA AZIONE OBBLIGATORIA: NC/PC senza azione_correttiva = mancante ─────
{
  console.log("\n── REGOLA — NC/PC senza azione_correttiva conta come mancante ──");
  const main = baseRisposteMain();
  // 1 impresa, tutte C tranne una NC; poi azzeriamo l'azione della NC.
  const { imprese, risposteImprese } = buildImprese([
    { nome: "Delta Costruzioni Srl", tipo: "appaltatrice", esiti: conNC(1) },
  ]);
  const conAzione = valuta(main, imprese, risposteImprese);
  check("con azione valorizzata -> completa", !conAzione.bloccato && conAzione.obbligatorieMancanti === 0);

  for (const r of risposteImprese) if (r.esito === "NC") r.azioneCorrettiva = undefined;
  const senzaAzione = valuta(main, imprese, risposteImprese);
  console.log("  completezza senza azione:", JSON.stringify(senzaAzione));
  check("senza azione -> 1 mancante, bloccata", senzaAzione.bloccato && senzaAzione.obbligatorieMancanti === 1, `mancanti=${senzaAzione.obbligatorieMancanti}`);
}

// ── SCENARIO E: rimozione impresa — cascata lato dato applicativo ────────────
{
  console.log("\n── SCENARIO E — rimozione di un'impresa già compilata ──");
  const { imprese, risposteImprese } = buildImprese([
    { nome: "Alfa Impianti Srl", tipo: "appaltatrice", esiti: tuttiC },
    { nome: "Beta Pulizie Snc", tipo: "subappaltatrice", esiti: conNC(2) },
    { nome: "Gamma Autonomo", tipo: "lavoratore_autonomo", esiti: conPC(1) },
  ]);
  const target = "imp-2"; // Beta
  // Replica handleRemoveImpresa + cascata FK ON DELETE CASCADE.
  const impreseDopo = imprese.filter((i) => i.id !== target);
  const risposteDopo = risposteImprese.filter((r) => r.impresaId !== target);
  const rimossePerBeta = risposteImprese.filter((r) => r.impresaId === target).length;
  const altreInvariate =
    risposteDopo.filter((r) => r.impresaId === "imp-1").length === DIDS.length &&
    risposteDopo.filter((r) => r.impresaId === "imp-3").length === DIDS.length;
  console.log(`  imprese: 3 -> ${impreseDopo.length}; risposte Beta rimosse: ${rimossePerBeta}`);
  check("Beta e le sue risposte rimosse", impreseDopo.length === 2 && risposteDopo.every((r) => r.impresaId !== target));
  check("Alfa e Gamma intatte (8 risposte ciascuna)", altreInvariate);
  check("FK ON DELETE CASCADE presente in migration 012", readFileSync(join(ROOT, "supabase", "migrations", "012_sez08_multi_impresa.sql"), "utf8").includes("REFERENCES imprese_appalto(id) ON DELETE CASCADE"));
}

console.log(fail ? "\n✗ TEST FALLITO" : "\n✓ TUTTI GLI SCENARI OK");
process.exit(fail ? 1 : 0);
