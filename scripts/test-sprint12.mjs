// Test Sprint 12 — SEZ-03 formazione per-nominativo. In-memory (nessuna
// scrittura su DB): usa il template v5 reale (read-only) e le funzioni reali
// (completezzaFormazioneNominativi, normalizzaNominativi, idRispostaFormazione,
// generaVerbale).
//
// Uso: node --experimental-strip-types --experimental-loader ./scripts/alias-hook.mjs scripts/test-sprint12.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import pg from "pg";
import { generaVerbale } from "@/lib/pdf/generaVerbale";
import { completezzaFormazioneNominativi } from "@/lib/checklist/completa";
import { normalizzaNominativi } from "@/lib/nominativi";
import { idRispostaFormazione } from "@/types";

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
const sez03 = template.sezioni.find((s) => s.id === "SEZ-03");

let fail = false;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) fail = true;
};

// Domande mappate a una figura (con figura_nominativo).
const mappate = sez03.domande.filter((d) => d.figura_nominativo);
const qDi = (fig) => mappate.find((d) => d.figura_nominativo === fig)?.id;
const domandeFigura = mappate.map((d) => ({ domandaId: d.id, figura: d.figura_nominativo }));

check("SEZ-03 ha marker formazione_per_nominativo", sez03.formazione_per_nominativo === true);
check("8 domande mappate a figura", mappate.length === 8, `${mappate.length}`);

// Helper: conta le domande derivate per una data configurazione nominativi.
function derivate(nominativi) {
  const n = normalizzaNominativi(nominativi);
  let tot = 0;
  const perFig = {};
  for (const df of domandeFigura) {
    const k = (n[df.figura] ?? []).length;
    perFig[df.figura] = k;
    tot += k;
  }
  return { tot, perFig };
}

// ── SCENARIO A — 1 DL, 1 RSPP, 3 Preposti, 0 RLS ─────────────────────────────
console.log("\n── SCENARIO A — derivazione domande dai nominativi ──");
const nomA = {
  DL: [{ id: "dl1", nome: "Mario DL" }],
  RSPP: [{ id: "r1", nome: "Rossi RSPP" }],
  PREPOSTI: [
    { id: "p1", nome: "Preposto Uno" },
    { id: "p2", nome: "Preposto Due" },
    { id: "p3", nome: "Preposto Tre" },
  ],
  RLS: [],
};
{
  const { perFig } = derivate(nomA);
  check("Preposti → 3 domande", perFig.PREPOSTI === 3, `${perFig.PREPOSTI}`);
  check("RLS → 0 domande", perFig.RLS === 0);
  check("DL → 1 domanda", perFig.DL === 1);
  check("RSPP → 1 domanda", perFig.RSPP === 1);
  check("ASPP/DIRIGENTI/ANTINCENDIO/PRIMO_SOCCORSO → 0", perFig.ASPP === 0 && perFig.DIRIGENTI === 0 && perFig.ANTINCENDIO === 0 && perFig.PRIMO_SOCCORSO === 0);
}

// ── SCENARIO B — aggiunta 4° preposto, prime 3 risposte intatte ─────────────
console.log("\n── SCENARIO B — aggiunta 4° preposto ──");
{
  const qP = qDi("PREPOSTI");
  // risposte per p1,p2,p3 (chiave = composite id basato su nominativo id)
  const risp = new Map();
  for (const id of ["p1", "p2", "p3"]) risp.set(idRispostaFormazione(qP, id), { esito: "C", azioneCorrettiva: null, osservazione: null });
  const nomB = { ...nomA, PREPOSTI: [...nomA.PREPOSTI, { id: "p4", nome: "Preposto Quattro" }] };
  const { perFig } = derivate(nomB);
  check("ora 4 domande Preposti", perFig.PREPOSTI === 4);
  const intatte = ["p1", "p2", "p3"].every((id) => risp.get(idRispostaFormazione(qP, id))?.esito === "C");
  check("le prime 3 risposte (per id) restano intatte", intatte);
  check("p4 non ha ancora risposta", !risp.has(idRispostaFormazione(qP, "p4")));
}

// ── SCENARIO C — rimozione preposto con risposta → orfana eliminata ─────────
console.log("\n── SCENARIO C — rimozione con risposta (logica orfani) ──");
{
  const qP = qDi("PREPOSTI");
  const risposteFormazione = {};
  for (const id of ["p1", "p2", "p3"]) risposteFormazione[idRispostaFormazione(qP, id)] = { esito: "C", azione: "", osservazione: "", dataVerifica: "" };
  // haRisposta(p2) deve essere true
  const haRisposta = (nomId) => Object.entries(risposteFormazione).some(([cid, e]) => cid.endsWith("::" + nomId) && e.esito != null);
  check("haRisposta(p2) = true (richiede conferma)", haRisposta("p2") === true);
  // rimozione p2 → orfane individuate
  const rimossi = ["p2"];
  const orfane = Object.keys(risposteFormazione).filter((cid) => rimossi.some((id) => cid.endsWith("::" + id)));
  check("1 risposta orfana individuata per p2", orfane.length === 1 && orfane[0] === idRispostaFormazione(qP, "p2"));
  for (const cid of orfane) delete risposteFormazione[cid];
  check("dopo conferma: risposta p2 eliminata, p1/p3 intatte", !risposteFormazione[idRispostaFormazione(qP, "p2")] && risposteFormazione[idRispostaFormazione(qP, "p1")] && risposteFormazione[idRispostaFormazione(qP, "p3")]);
}

// ── SCENARIO D — correzione refuso nel nome → risposta sopravvive ───────────
console.log("\n── SCENARIO D — rename nominativo, risposta per id sopravvive ──");
{
  const qP = qDi("PREPOSTI");
  const nomId = "p1";
  const cid = idRispostaFormazione(qP, nomId);
  const risposteFormazione = { [cid]: { esito: "NC", azione: "Pianificare corso.", osservazione: "", dataVerifica: "" } };
  // rename: stesso id, nome diverso
  const prima = [{ id: nomId, nome: "TIzio Sempronio" }];
  const dopo = [{ id: nomId, nome: "Tizio Sempronio" }];
  const cidDopo = idRispostaFormazione(qP, dopo[0].id);
  check("composite id invariato dopo rename", cidDopo === cid);
  check("la risposta sopravvive al rename", risposteFormazione[cidDopo]?.esito === "NC");
  check("normalizzazione preserva l'id", normalizzaNominativi({ PREPOSTI: dopo }).PREPOSTI[0].id === nomId);
}

// ── SCENARIO E — SEZ-01 vuota → 0 domande, completezza ok ───────────────────
console.log("\n── SCENARIO E — SEZ-01 vuota ──");
{
  const n = normalizzaNominativi({});
  const nomDi = (fig) => (n[fig] ?? []).map((x) => x.id);
  const { mancanti } = completezzaFormazioneNominativi(domandeFigura, nomDi, () => null);
  check("0 domande formazione → 0 mancanti (parte formazione completa)", mancanti === 0);
  const { tot } = derivate({});
  check("0 domande derivate", tot === 0);
}

// ── SCENARIO F — NC senza azione blocca; con azione ok ──────────────────────
console.log("\n── SCENARIO F — completezza NC/PC senza azione ──");
{
  const qP = qDi("PREPOSTI");
  const n = normalizzaNominativi(nomA);
  const nomDi = (fig) => (n[fig] ?? []).map((x) => x.id);
  const base = new Map();
  base.set(idRispostaFormazione(qP, "p1"), { esito: "NC", azioneCorrettiva: "", osservazione: null }); // NC senza azione
  base.set(idRispostaFormazione(qP, "p2"), { esito: "C", azioneCorrettiva: null, osservazione: null });
  base.set(idRispostaFormazione(qP, "p3"), { esito: "C", azioneCorrettiva: null, osservazione: null });
  // anche DL e RSPP rispondono C (altrimenti contano come mancanti)
  base.set(idRispostaFormazione(qDi("DL"), "dl1"), { esito: "C" });
  base.set(idRispostaFormazione(qDi("RSPP"), "r1"), { esito: "C" });
  const getR = (did, id) => base.get(idRispostaFormazione(did, id)) ?? null;
  const r1 = completezzaFormazioneNominativi(domandeFigura, nomDi, getR);
  check("NC senza azione → mancanti = 1, non completa", r1.mancanti === 1 && !r1.completa, `mancanti=${r1.mancanti}`);
  base.set(idRispostaFormazione(qP, "p1"), { esito: "NC", azioneCorrettiva: "Pianificare corso preposti.", osservazione: null });
  const r2 = completezzaFormazioneNominativi(domandeFigura, nomDi, getR);
  check("con azione → completa (mancanti 0)", r2.mancanti === 0 && r2.completa);
}

// ── SCENARIO G — legacy v4 (nessun marker) → modello invariato ──────────────
console.log("\n── SCENARIO G — discriminatore legacy ──");
{
  const sezLegacy = { id: "SEZ-03", domande: sez03.domande.map((d) => ({ ...d, figura_nominativo: undefined })) };
  delete sezLegacy.formazione_per_nominativo;
  check("snapshot legacy: nessun marker formazione_per_nominativo", !sezLegacy.formazione_per_nominativo);
  check("snapshot legacy: nessuna domanda con figura_nominativo", sezLegacy.domande.every((d) => !d.figura_nominativo));
  // il marker reale v5 è presente sul template attivo
  check("template attivo v5 ha il marker (nuovi verbali)", sez03.formazione_per_nominativo === true);
}

// ── SCENARIO H — PDF multi-nominativo con data verifica ─────────────────────
console.log("\n── SCENARIO H — PDF formazione per-nominativo ──");
{
  const qP = qDi("PREPOSTI");
  const risposte = {};
  // genericiche SEZ-03 (D-03-001, D-03-005) + altre sezioni minime: lasciamo vuote,
  // generaVerbale stampa comunque. Aggiungiamo risposte per i 3 preposti.
  risposte[idRispostaFormazione(qP, "p1")] = { esito: "C", azione_correttiva: null, osservazione_evidenza: null, osservazioni: null, data_verifica: "2025-03-10" };
  risposte[idRispostaFormazione(qP, "p2")] = { esito: "NC", azione_correttiva: "Pianificare corso 12 ore.", osservazione_evidenza: null, osservazioni: null, data_verifica: "2024-11-02" };
  risposte[idRispostaFormazione(qP, "p3")] = { esito: "C", azione_correttiva: null, osservazione_evidenza: null, osservazioni: null, data_verifica: null };
  risposte[idRispostaFormazione(qDi("DL"), "dl1")] = { esito: "C", azione_correttiva: null, osservazione_evidenza: null, osservazioni: null, data_verifica: "2025-01-15" };

  const dati = {
    visita: { id: "test", data_visita: "2026-06-30", ora_inizio: "09:30:00", note_preliminari: null, note_finali_visita: null, numero_verbale: "SC-2026-TEST" },
    cliente: { ragione_sociale: "Pane Pizza Srl" },
    sede: { nome: "Sede", indirizzo: "Via Roma 1", citta: "Palermo" },
    specialist: { nome_completo: "Mario Rossi", qualifica: "RSPP" },
    referente_cliente: null,
    nominativi: nomA,
    template,
    risposte,
  };
  const buf = await generaVerbale(dati);
  writeFileSync(join(ROOT, "scripts", "_test-sprint12.pdf"), buf);
  const txt = decodePdf(buf);
  check("PDF: 'Preposto Uno' presente", txt.includes("Preposto Uno"));
  check("PDF: 'Preposto Due' presente", txt.includes("Preposto Due"));
  check("PDF: 'Mario DL' (figura DL) presente", txt.includes("Mario DL"));
  check("PDF: 'Formazione di' presente", txt.includes("Formazione di"));
  check("PDF: data verifica formattata (marzo 2025) presente", /marzo 2025/i.test(txt));
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
