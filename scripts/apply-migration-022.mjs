/**
 * Applica supabase/migrations/022_sprint15_2_tecnico_per_slot.sql via pooler e
 * verifica: colonne tecnico_assegnato_id / tecnico_personalizzato su
 * visite_pianificate, indice idx_vp_tecnico, backfill allineato al piano.
 *
 * ADDITIVA + retrocompatibile (colonne nullable con backfill, funzioni
 * CREATE OR REPLACE con firma invariata). Guard di idempotenza: se la colonna
 * tecnico_assegnato_id esiste già, la migration risulta applicata (le funzioni
 * vengono comunque riallineate — CREATE OR REPLACE è sicuro da rieseguire).
 *
 * Uso: node scripts/apply-migration-022.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "022_sprint15_2_tecnico_per_slot.sql");

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
  const gia = (await c.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='visite_pianificate'
       AND column_name='tecnico_assegnato_id'`
  )).rowCount;
  if (gia) {
    console.log("⚠️  colonna tecnico_assegnato_id già presente: la 022 sembra applicata.");
    console.log("    La migration è idempotente (ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE), la rieseguo comunque.\n");
  }
  await c.query(readFileSync(SQL_FILE, "utf8"));
  console.log("✓ Migration 022 applicata.\n");

  const col = (await c.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='visite_pianificate'
       AND column_name IN ('tecnico_assegnato_id','tecnico_personalizzato')
     ORDER BY column_name`
  )).rows.map((r) => r.column_name);
  console.log("Colonne:", col.join(", "), "(attese 2)");

  const idx = (await c.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_vp_tecnico'`
  )).rowCount;
  console.log("Indice idx_vp_tecnico:", idx ? "presente" : "ASSENTE");

  const disall = (await c.query(
    `SELECT count(*)::int n FROM public.visite_pianificate vp
     JOIN public.piani_visite pv ON pv.id = vp.piano_id
     WHERE vp.tecnico_assegnato_id IS DISTINCT FROM pv.tecnico_assegnato_id`
  )).rows[0].n;
  console.log("Backfill: slot disallineati dal piano:", disall, "(atteso 0)");

  const flagTrue = (await c.query(
    `SELECT count(*)::int n FROM public.visite_pianificate WHERE tecnico_personalizzato = true`
  )).rows[0].n;
  console.log("Slot con tecnico_personalizzato=true (backfill atteso 0):", flagTrue);
} finally {
  await c.end();
}
