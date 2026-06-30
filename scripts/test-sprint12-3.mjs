// Test Sprint 12.3 — motore Scadenze. In-memory per la logica (helper puri),
// + verifiche DB read-only/transazionali NON persistenti (BEGIN…ROLLBACK):
//   - calcolaScadenza (TS) corretto e ALLINEATO alla funzione SQL calcola_scadenza
//   - scadenza manuale: INSERT con periodicita_mesi=NULL accettato (rollback)
//   - CHECK su tipo/stato rifiuta valori non validi (rollback)
//   - filtraScadenze / ordinaPerScadenza (stato/cliente/sede, ordine)
//
// Uso: node --experimental-strip-types --experimental-loader ./scripts/alias-hook.mjs scripts/test-sprint12-3.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import {
  calcolaScadenza,
  isScaduta,
  filtraScadenze,
  ordinaPerScadenza,
} from "@/lib/scadenze/calcola";

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

let fail = false;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) fail = true;
};

await c.connect();
try {
  // ── SCENARIO A — calcolaScadenza (TS) ─────────────────────────────────────
  console.log("── SCENARIO A — calcolo data_scadenza (TS) ──");
  const casi = [
    ["2025-03-10", 12, "2026-03-10"],
    ["2025-01-31", 1, "2025-02-28"], // clamp fine mese
    ["2024-02-29", 12, "2025-02-28"], // anno non bisestile
    ["2025-12-15", 6, "2026-06-15"], // rollover anno
    ["2025-06-30", 60, "2030-06-30"], // 5 anni (aggiornamento quinquennale)
    ["2025-08-31", 6, "2026-02-28"], // 31 ago + 6 = 28 feb
  ];
  for (const [data, mesi, atteso] of casi) {
    check(`${data} +${mesi}m = ${atteso}`, calcolaScadenza(data, mesi) === atteso, calcolaScadenza(data, mesi));
  }
  check("data null → null", calcolaScadenza(null, 12) === null);
  check("mesi null → null (scadenza manuale)", calcolaScadenza("2025-01-31", null) === null);

  // ── SCENARIO B — TS allineato alla funzione SQL ───────────────────────────
  console.log("\n── SCENARIO B — TS ≡ SQL calcola_scadenza ──");
  for (const [data, mesi, atteso] of casi) {
    const { rows } = await c.query(`SELECT calcola_scadenza($1::date, $2::int)::text AS d`, [data, mesi]);
    const sql = rows[0].d;
    check(`SQL ${data}+${mesi}m = ${sql}`, sql === atteso && sql === calcolaScadenza(data, mesi));
  }
  {
    const { rows } = await c.query(`SELECT calcola_scadenza(NULL, 12)::text AS a, calcola_scadenza('2025-01-31'::date, NULL)::text AS b`);
    check("SQL null inputs → null (entrambi)", rows[0].a === null && rows[0].b === null);
  }

  // ── SCENARIO C — scadenza MANUALE (periodicita NULL), INSERT non persistente
  console.log("\n── SCENARIO C — scadenza manuale (BEGIN…ROLLBACK) ──");
  const rifId = (await c.query(`SELECT gen_random_uuid() AS id`)).rows[0].id;
  await c.query("BEGIN");
  await c.query(
    `INSERT INTO scadenze (tipo, riferimento_tipo, riferimento_id, data_scadenza, periodicita_mesi, stato, note)
     VALUES ('azione_correttiva','nc',$1,'2026-09-30',NULL,'attiva','NC manuale Sprint 13')`,
    [rifId]
  );
  const ins = await c.query(
    `SELECT periodicita_mesi, data_scadenza::text AS d, stato FROM scadenze WHERE riferimento_id = $1`,
    [rifId]
  );
  check("INSERT manuale accettato (1 riga)", ins.rows.length === 1);
  check("periodicita_mesi NULL ammesso", ins.rows[0]?.periodicita_mesi === null);
  check("data_scadenza impostata a mano = 2026-09-30", ins.rows[0]?.d === "2026-09-30");
  await c.query("ROLLBACK");
  const post = await c.query(`SELECT count(*)::int AS n FROM scadenze WHERE riferimento_id = $1`, [rifId]);
  check("dopo ROLLBACK: nessuna scrittura persistente", post.rows[0].n === 0);

  // ── SCENARIO D — CHECK constraint su tipo/stato ───────────────────────────
  console.log("\n── SCENARIO D — vincoli CHECK (rollback) ──");
  await c.query("BEGIN");
  let tipoRifiutato = false;
  try {
    await c.query("SAVEPOINT sp");
    await c.query(
      `INSERT INTO scadenze (tipo, riferimento_tipo, riferimento_id, data_scadenza)
       VALUES ('tipo_inesistente','nc',gen_random_uuid(),'2026-01-01')`
    );
  } catch {
    tipoRifiutato = true;
    await c.query("ROLLBACK TO SAVEPOINT sp");
  }
  check("tipo fuori CHECK → rifiutato", tipoRifiutato);
  let statoRifiutato = false;
  try {
    await c.query("SAVEPOINT sp2");
    await c.query(
      `INSERT INTO scadenze (tipo, riferimento_tipo, riferimento_id, data_scadenza, stato)
       VALUES ('formazione','risposta_checklist',gen_random_uuid(),'2026-01-01','boh')`
    );
  } catch {
    statoRifiutato = true;
    await c.query("ROLLBACK TO SAVEPOINT sp2");
  }
  check("stato fuori CHECK → rifiutato", statoRifiutato);
  await c.query("ROLLBACK");

  // ── SCENARIO E — filtraScadenze / ordinaPerScadenza (in-memory) ───────────
  console.log("\n── SCENARIO E — filtro e ordinamento vista ──");
  const dati = [
    { id: "1", tipo: "formazione", clienteId: "A", sedeId: "A1", riferimentoTipo: "risposta_checklist", riferimentoId: "r1", dataRiferimento: "2025-01-01", periodicitaMesi: 12, dataScadenza: "2026-05-10", stato: "attiva", note: null },
    { id: "2", tipo: "formazione", clienteId: "A", sedeId: "A2", riferimentoTipo: "risposta_checklist", riferimentoId: "r2", dataRiferimento: "2025-01-01", periodicitaMesi: 12, dataScadenza: "2026-01-05", stato: "attiva", note: null },
    { id: "3", tipo: "azione_correttiva", clienteId: "B", sedeId: "B1", riferimentoTipo: "nc", riferimentoId: "r3", dataRiferimento: null, periodicitaMesi: null, dataScadenza: "2026-03-01", stato: "risolta", note: null },
    { id: "4", tipo: "formazione", clienteId: "B", sedeId: "B1", riferimentoTipo: "risposta_checklist", riferimentoId: "r4", dataRiferimento: "2025-02-01", periodicitaMesi: 36, dataScadenza: "2026-02-20", stato: "attiva", note: null },
  ];
  const attive = filtraScadenze(dati, { stato: "attiva" });
  check("filtro stato=attiva → 3 (esclude risolta)", attive.length === 3);
  const clienteA = filtraScadenze(dati, { stato: "attiva", clienteId: "A" });
  check("filtro stato=attiva + cliente=A → 2", clienteA.length === 2);
  const sedeA2 = filtraScadenze(dati, { clienteId: "A", sedeId: "A2" });
  check("filtro cliente=A + sede=A2 → 1", sedeA2.length === 1 && sedeA2[0].id === "2");
  const ordinate = ordinaPerScadenza(attive).map((s) => s.id);
  check("ordinamento per data_scadenza crescente", JSON.stringify(ordinate) === JSON.stringify(["2", "4", "1"]), ordinate.join(","));
  check("ordinaPerScadenza non muta l'input", attive.map((s) => s.id).join(",") !== "" && attive[0].id === "1");
  check("isScaduta: 2026-01-05 rispetto a oggi 2026-07-01", isScaduta("2026-01-05", "2026-07-01") === true);
  check("isScaduta: 2026-12-31 rispetto a oggi 2026-07-01 → false", isScaduta("2026-12-31", "2026-07-01") === false);
} finally {
  await c.end();
}

console.log(fail ? "\n✗ TEST FALLITO" : "\n✓ TUTTI GLI SCENARI OK");
process.exit(fail ? 1 : 0);
