/**
 * Applica supabase/migrations/013_sedi_principale_dashboard.sql via pooler
 * aws-1-eu-central-1 e verifica: colonna sedi.principale, funzioni
 * dashboard_kpi() / dashboard_clienti() e relativo output.
 *
 * Uso: node scripts/apply-migration-013.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "013_sedi_principale_dashboard.sql");

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
  console.log("✓ Migration 013 applicata.\n");

  const { rows: col } = await c.query(
    `SELECT column_name, data_type, column_default, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'sedi' AND column_name = 'principale';`
  );
  console.log("sedi.principale:", JSON.stringify(col[0]));

  const { rows: kpi } = await c.query(`SELECT * FROM dashboard_kpi();`);
  console.log("\ndashboard_kpi():", JSON.stringify(kpi[0]));

  const { rows: cl } = await c.query(`SELECT * FROM dashboard_clienti();`);
  console.log("\ndashboard_clienti():");
  for (const r of cl) console.log("  ", JSON.stringify(r));
} finally {
  await c.end();
}
