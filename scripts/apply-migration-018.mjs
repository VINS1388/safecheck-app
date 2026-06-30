/**
 * Applica supabase/migrations/018_scadenze_motore.sql via pooler e verifica:
 * tabella scadenze + indici + trigger + RLS + funzione calcola_scadenza.
 *
 * Uso: node scripts/apply-migration-018.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "018_scadenze_motore.sql");

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
try {
  await c.query(readFileSync(SQL_FILE, "utf8"));
  console.log("✓ Migration 018 applicata.\n");

  // Colonne tabella
  const { rows: cols } = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'scadenze' ORDER BY ordinal_position;
  `);
  console.log("scadenze — colonne:");
  for (const r of cols) console.log(`  ${r.column_name.padEnd(18)} ${r.data_type}${r.is_nullable === "NO" ? " NOT NULL" : ""}`);

  // Indici
  const { rows: idx } = await c.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'scadenze' ORDER BY indexname;`
  );
  console.log("\nIndici:", idx.map((r) => r.indexname).join(", "));

  // RLS abilitata
  const { rows: rls } = await c.query(
    `SELECT relrowsecurity FROM pg_class WHERE relname = 'scadenze';`
  );
  console.log("RLS abilitata:", rls[0]?.relrowsecurity === true);
  const { rows: pol } = await c.query(
    `SELECT policyname FROM pg_policies WHERE tablename = 'scadenze' ORDER BY policyname;`
  );
  console.log("Policy:", pol.map((r) => r.policyname).join(", "));

  // Funzione calcola_scadenza
  const { rows: f } = await c.query(`
    SELECT
      calcola_scadenza(DATE '2025-03-10', 12) AS d1,
      calcola_scadenza(DATE '2025-01-31', 1)  AS d2,
      calcola_scadenza(NULL, 12)              AS d3,
      calcola_scadenza(DATE '2025-01-31', NULL) AS d4,
      calcola_scadenza(DATE '2024-02-29', 12) AS d5;
  `);
  const r = f[0];
  const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
  console.log("\ncalcola_scadenza:");
  console.log("  2025-03-10 +12m =", iso(r.d1), "(atteso 2026-03-10)");
  console.log("  2025-01-31  +1m =", iso(r.d2), "(atteso 2025-02-28, overflow fine mese)");
  console.log("  NULL       +12m =", r.d3, "(atteso null)");
  console.log("  2025-01-31 +NULL =", r.d4, "(atteso null)");
  console.log("  2024-02-29 +12m =", iso(r.d5), "(atteso 2025-02-28, anno non bisestile)");
} finally {
  await c.end();
}
