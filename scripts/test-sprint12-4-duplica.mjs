// STEP B (post-fix) — Duplica + safety net server-side su domande a calcolo
// automatico. Transazione NON persistente (BEGIN…ROLLBACK).
//
// Verifica che il freeze del valore clonato venga corretto dal ricalcolo
// condiviso `ricalcolaEsitiAutomatici` (lo stesso usato dalla UI al mount e
// dalla route genera-pdf alla chiusura), letto dallo SNAPSHOT immutabile:
//   - duplica di un verbale chiuso con D-03-002 (24m) 'C' → nuova data_visita
//     8 mesi dopo → il ricalcolo produce 'NC' (corretto)
//   - NA/NV manuali NON vengono mai ricalcolati
//   - copre sia domanda diretta sia id composito formazione
//
// Uso: node --experimental-strip-types --experimental-loader ./scripts/alias-hook.mjs scripts/test-sprint12-4-duplica.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { ricalcolaEsitiAutomatici } from "@/lib/scadenze/ricalcolo";

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
const one = async (s, p = []) => (await c.query(s, p)).rows[0];
let fail = false;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) fail = true;
};

const ORIG_SOPRALLUOGO = "2026-01-01";
const DATA_VERIFICA = "2024-05-01"; // 20 mesi prima dell'originale
const NUOVO_SOPRALLUOGO = "2026-09-01"; // 8 mesi dopo → 28 mesi dalla verifica
const NOM_ID = "11111111-1111-1111-1111-111111111111";
const COMPOSITE = `D-03-002${"::"}${NOM_ID}`;

await c.connect();
try {
  await c.query("BEGIN");

  // Snapshot reale v8 (con i flag calcolo_automatico) — congelato sulla visita.
  const snapshot = (await one(
    `SELECT struttura_json FROM template_master WHERE attivo = true LIMIT 1`
  )).struttura_json;
  check("snapshot template versione 8", snapshot.versione === 8);

  const sede = await one(`SELECT id, cliente_id FROM sedi LIMIT 1`);
  const utente = await one(`SELECT id FROM utenti LIMIT 1`);

  // Verbale sorgente CHIUSO, snapshot v8. D-03-002 (diretta e composito) = 'C',
  // D-03-003 = 'NA' manuale con una data stale (non deve mai essere ricalcolata).
  const src = await one(
    `INSERT INTO visite (sede_id, cliente_id, specialist_id, data_visita, stato, stato_verbale, numero_verbale, template_snapshot)
     VALUES ($1,$2,$3,$4,'verbale_generato','chiuso',$5,$6::jsonb) RETURNING id`,
    [sede.id, sede.cliente_id, utente.id, ORIG_SOPRALLUOGO, "SC-9999-" + Math.floor(Math.random() * 1e6), JSON.stringify(snapshot)]
  );
  const ce = JSON.stringify({ data_verifica: DATA_VERIFICA });
  await c.query(
    `INSERT INTO risposte (visita_id, domanda_id, sezione_id, valore, campo_extra) VALUES
       ($1,'D-03-002','SEZ-03','C',$2::jsonb),
       ($1,$3,'SEZ-03','C',$2::jsonb),
       ($1,'D-03-003','SEZ-03','NA',$2::jsonb)`,
    [src.id, ce, COMPOSITE]
  );
  // D-03-003 NA richiede motivazione per completezza, ma qui testiamo solo il ricalcolo.

  // DUPLICA → nuova bozza; forziamo la nuova data_sopralluogo (deterministico).
  const newId = (await one(`SELECT clona_visita($1,false) AS id`, [src.id])).id;
  await c.query(`UPDATE visite SET data_visita = $2 WHERE id = $1`, [newId, NUOVO_SOPRALLUOGO]);

  // Stato clonato (pre-safety-net): valori congelati dall'originale.
  const clone = await c.query(
    `SELECT domanda_id, valore, campo_extra->>'data_verifica' AS dv FROM risposte WHERE visita_id=$1 ORDER BY domanda_id`,
    [newId]
  );
  const pre = Object.fromEntries(clone.rows.map((r) => [r.domanda_id, r.valore]));
  console.log("Pre-ricalcolo (clonato):", JSON.stringify(pre));
  check("clonato: D-03-002 diretta = C (congelato)", pre["D-03-002"] === "C");
  check("clonato: D-03-002::nom = C (congelato)", pre[COMPOSITE] === "C");
  check("clonato: D-03-003 = NA (manuale)", pre["D-03-003"] === "NA");

  // ── SAFETY NET (stessa logica di genera-pdf/route.ts e del mount client) ──
  const nv = await one(`SELECT data_visita::text AS d FROM visite WHERE id=$1`, [newId]);
  const risposte = clone.rows.map((r) => ({ domandaId: r.domanda_id, valore: r.valore, dataVerifica: r.dv }));
  const diffs = ricalcolaEsitiAutomatici(snapshot, risposte, nv.d);
  console.log(`\nRicalcolo contro nuovo sopralluogo ${nv.d}: ${diffs.length} diff`);
  for (const d of diffs) console.log(`  ${d.domandaId}: ${d.vecchioValore} → ${d.nuovoValore}`);

  // Applica come farebbe la route/mount.
  for (const d of diffs) {
    await c.query(`UPDATE risposte SET valore=$3 WHERE visita_id=$1 AND domanda_id=$2`, [newId, d.domandaId, d.nuovoValore]);
  }

  const post = Object.fromEntries(
    (await c.query(`SELECT domanda_id, valore FROM risposte WHERE visita_id=$1`, [newId])).rows.map((r) => [r.domanda_id, r.valore])
  );
  console.log("\nPost-ricalcolo:", JSON.stringify(post));
  check("FIX: D-03-002 diretta ricalcolata C → NC", post["D-03-002"] === "NC");
  check("FIX: D-03-002::nom (composito) ricalcolata C → NC", post[COMPOSITE] === "NC");
  check("NA/NV manuale NON ricalcolato (resta NA)", post["D-03-003"] === "NA");
  check("solo 2 diff (le due D-03-002), NA escluso", diffs.length === 2);

  await c.query("ROLLBACK");
} finally {
  await c.end();
}
console.log(fail ? "\n✗ TEST FALLITO" : "\n✓ TUTTI GLI SCENARI OK");
process.exit(fail ? 1 : 0);
