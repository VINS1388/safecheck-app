// Test Sprint 14 — formazione lavoratori per-nominativo.
// Logica pura (valutaConformitaDaScadenza / ricalcolaEsitiAutomatici esteso) +
// scenario Duplica anti-freeze su snapshot v9 reale (migration 020 applicata in
// transazione NON persistente, BEGIN…ROLLBACK).
//
// Periodicità 60 mesi, soglia PC 60 giorni (decisione A, uniforme).
//
// Uso: node --experimental-strip-types --experimental-loader ./scripts/alias-hook.mjs scripts/test-sprint14-lavoratori.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { valutaConformitaDaScadenza } from "@/lib/scadenze/calcola";
import { ricalcolaEsitiAutomatici } from "@/lib/scadenze/ricalcolo";
import { idRispostaFormazione } from "@/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_020 = join(ROOT, "supabase", "migrations", "020_sprint14_lavoratori.sql");
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
const one = async (s, p = []) => (await c.query(s, p)).rows[0];
let fail = false;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) fail = true;
};

const SOPRALLUOGO = "2026-07-01";
// Lavoratori: date scelte per soglia 60gg (periodicità 60 mesi).
const LAV = [
  { id: "aaa", nome: "Mario Rossi", mansione: "Operaio", livelloRischio: "alto", dataFormazione: "2020-09-01" }, // scad 2025-09-01 → NC
  { id: "bbb", nome: "Laura Bianchi", mansione: "Impiegata", livelloRischio: "basso", dataFormazione: "2021-08-01" }, // scad 2026-08-01 (31gg) → PC
  { id: "ccc", nome: "Anna Verdi", mansione: "Magazziniera", livelloRischio: "medio", dataFormazione: "2024-11-01" }, // scad 2029-11-01 → C
];

// ── SCENARIO A — badge NC/PC/C (soglia 60, data sopralluogo) ────────────────
console.log("── SCENARIO A — valutaConformitaDaScadenza (60m, soglia 60gg) ──");
check("A NC (70 mesi, scaduto)", valutaConformitaDaScadenza("2020-09-01", 60, SOPRALLUOGO) === "NC");
check("B PC (scad 2026-08-01, 31gg)", valutaConformitaDaScadenza("2021-08-01", 60, SOPRALLUOGO) === "PC");
check("C C (20 mesi)", valutaConformitaDaScadenza("2024-11-01", 60, SOPRALLUOGO) === "C");
// Usa la DATA DEL SOPRALLUOGO, non oggi: stesso attestato → esiti diversi.
check("riferimento = data sopralluogo (B: C con sopralluogo 2024-01-01)",
  valutaConformitaDaScadenza("2021-08-01", 60, "2024-01-01") === "C");

await c.connect();
try {
  await c.query("BEGIN");
  await c.query(readFileSync(SQL_020, "utf8")); // v8 → v9 (in transazione)
  const snapshot = (await one(`SELECT struttura_json FROM template_master WHERE attivo=true`)).struttura_json;
  check("snapshot v9 con nodo formazione_lavoratori", snapshot.versione === 9);
  const nodo = snapshot.sezioni.flatMap((s) => s.domande).find((d) => d.formazione_lavoratori);
  check("D-03-001 periodicita 60 / soglia 60", nodo?.periodicita_mesi === 60 && nodo?.soglia_pc_giorni === 60);

  // ── SCENARIO B — ricalcolaEsitiAutomatici legge la data da SEZ-01-LAV ──────
  console.log("\n── SCENARIO B — ricalcolo per-lavoratore (nessuna riga salvata) ──");
  const diffs = ricalcolaEsitiAutomatici(snapshot, [], SOPRALLUOGO, LAV);
  const perId = Object.fromEntries(diffs.map((d) => [d.domandaId, d.nuovoValore]));
  check("3 diff (una per lavoratore)", diffs.length === 3, `${diffs.length}`);
  check("A → NC", perId[idRispostaFormazione("D-03-001", "aaa")] === "NC");
  check("B → PC", perId[idRispostaFormazione("D-03-001", "bbb")] === "PC");
  check("C → C", perId[idRispostaFormazione("D-03-001", "ccc")] === "C");
  check("diff.base ha formazione_lavoratori", diffs.every((d) => d.base.formazione_lavoratori === true));
  // Lavoratore senza data → nessun badge/diff.
  const diffNoData = ricalcolaEsitiAutomatici(snapshot, [], SOPRALLUOGO, [{ ...LAV[0], id: "z", dataFormazione: "" }]);
  check("lavoratore senza data → nessun diff", diffNoData.length === 0);

  // ── SCENARIO C — Duplica: freeze corretto contro nuova data_sopralluogo ────
  console.log("\n── SCENARIO C — Duplica anti-freeze (BEGIN…ROLLBACK) ──");
  const sede = await one(`SELECT id, cliente_id FROM sedi LIMIT 1`);
  const utente = await one(`SELECT id FROM utenti LIMIT 1`);
  const ORIG = "2026-01-01";
  // Lavoratore B con data che dà C @2026-01-01 ma NC @2026-07-01 (flip su clone).
  const lavClone = [
    { ...LAV[0] }, // NC entrambe
    { ...LAV[1], dataFormazione: "2021-04-01" }, // scad 2026-04-01: C@orig, NC@new
    { ...LAV[2] }, // C entrambe
  ];
  const src = await one(
    `INSERT INTO visite (sede_id, cliente_id, specialist_id, data_visita, stato, stato_verbale, numero_verbale, template_snapshot)
     VALUES ($1,$2,$3,$4,'verbale_generato','chiuso',$5,$6::jsonb) RETURNING id`,
    [sede.id, sede.cliente_id, utente.id, ORIG, "SC-9999-" + Math.floor(Math.random() * 1e6), JSON.stringify(snapshot)]
  );
  // Riga elenco lavoratori + righe esito congelate all'ORIGINALE (A=NC,B=C,C=C).
  await c.query(
    `INSERT INTO risposte (visita_id, domanda_id, sezione_id, valore, campo_extra)
     VALUES ($1,'SEZ-01-LAV','SEZ-01',NULL,$2::jsonb)`,
    [src.id, JSON.stringify({ lavoratori: lavClone })]
  );
  for (const l of lavClone) {
    const esitoOrig = valutaConformitaDaScadenza(l.dataFormazione, 60, ORIG);
    await c.query(
      `INSERT INTO risposte (visita_id, domanda_id, sezione_id, valore) VALUES ($1,$2,'SEZ-03',$3)`,
      [src.id, idRispostaFormazione("D-03-001", l.id), esitoOrig]
    );
  }
  const frozenB = (await one(
    `SELECT valore FROM risposte WHERE visita_id=$1 AND domanda_id=$2`,
    [src.id, idRispostaFormazione("D-03-001", "bbb")]
  )).valore;
  check("originale: B congelato = C (@2026-01-01)", frozenB === "C");

  // Duplica + nuova data sopralluogo.
  const newId = (await one(`SELECT clona_visita($1,false) AS id`, [src.id])).id;
  await c.query(`UPDATE visite SET data_visita=$2 WHERE id=$1`, [newId, SOPRALLUOGO]);
  const clonedRisposte = (await c.query(
    `SELECT domanda_id, valore, campo_extra FROM risposte WHERE visita_id=$1`, [newId]
  )).rows.map((r) => ({ domandaId: r.domanda_id, valore: r.valore, dataVerifica: null }));
  const clonedLav = lavClone; // clonati identici (data invariata, cambia solo il sopralluogo)

  const cloneDiffs = ricalcolaEsitiAutomatici(snapshot, clonedRisposte, SOPRALLUOGO, clonedLav);
  const cloneById = Object.fromEntries(cloneDiffs.map((d) => [d.domandaId, d.nuovoValore]));
  check("clone: 1 solo diff (B: C→NC)", cloneDiffs.length === 1, `${cloneDiffs.length}`);
  check("clone: B ricalcolato → NC (freeze corretto)", cloneById[idRispostaFormazione("D-03-001", "bbb")] === "NC");
  check("clone: A resta NC (no diff)", !(idRispostaFormazione("D-03-001", "aaa") in cloneById));
  check("clone: C resta C (no diff)", !(idRispostaFormazione("D-03-001", "ccc") in cloneById));

  // Applica il ricalcolo (come farebbe il safety-net server / mount) e verifica.
  for (const d of cloneDiffs) {
    await c.query(`UPDATE risposte SET valore=$3 WHERE visita_id=$1 AND domanda_id=$2`, [newId, d.domandaId, d.nuovoValore]);
  }
  const postB = (await one(
    `SELECT valore FROM risposte WHERE visita_id=$1 AND domanda_id=$2`,
    [newId, idRispostaFormazione("D-03-001", "bbb")]
  )).valore;
  check("clone dopo ricalcolo: B persistito = NC", postB === "NC");

  await c.query("ROLLBACK");
  const ver = (await one(`SELECT versione FROM template_master WHERE attivo=true`)).versione;
  check("dopo ROLLBACK: versione torna a 8 (non persistito)", ver === 8);
} finally {
  await c.end();
}

console.log(fail ? "\n✗ TEST FALLITO" : "\n✓ TUTTI GLI SCENARI OK");
process.exit(fail ? 1 : 0);
