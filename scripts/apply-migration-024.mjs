/**
 * Applica supabase/migrations/024_ruolo_planner.sql via pooler e verifica che
 * l'enum ruolo_utente contenga 'planner'.
 *
 * NB: ALTER TYPE ... ADD VALUE non è transazionale in modo utile (il valore non
 * è usabile nella stessa transazione) → si applica in autocommit, standalone,
 * PRIMA della migration 025. Additiva e idempotente (ADD VALUE IF NOT EXISTS).
 *
 * Uso: node scripts/apply-migration-024.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "024_ruolo_planner.sql");

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
  console.log("✓ Migration 024 applicata.\n");

  const vals = (await c.query(
    `SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) v
     FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'ruolo_utente'`
  )).rows[0].v;
  console.log("Enum ruolo_utente:", vals);
  console.log("Contiene 'planner':", vals.split(", ").includes("planner") ? "SI ✓" : "NO ✗");
} finally {
  await c.end();
}
