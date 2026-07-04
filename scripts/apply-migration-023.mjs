/**
 * Applica supabase/migrations/023_visite_delete_policy.sql via pooler e verifica
 * la presenza della policy DELETE su visite.
 *
 * HOTFIX: senza questa policy la RLS nega ogni DELETE su visite (deny silenzioso)
 * e l'eliminazione bozza fallisce senza errore. ADDITIVA e idempotente
 * (DROP POLICY IF EXISTS + CREATE).
 *
 * Uso: node scripts/apply-migration-023.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "023_visite_delete_policy.sql");

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
  console.log("✓ Migration 023 applicata.\n");

  const pol = (await c.query(
    `SELECT policyname, cmd, qual FROM pg_policies
     WHERE schemaname='public' AND tablename='visite' AND cmd='DELETE'`
  )).rows;
  if (pol.length === 0) {
    console.log("✗ Policy DELETE ASSENTE dopo l'apply — verificare.");
  } else {
    for (const p of pol) console.log(`Policy DELETE: ${p.policyname} | USING=${p.qual}`);
  }
} finally {
  await c.end();
}
