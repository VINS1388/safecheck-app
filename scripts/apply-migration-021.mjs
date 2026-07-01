/**
 * Applica supabase/migrations/021_sprint15_pianificazione.sql via pooler e
 * verifica: tabelle piani_visite / visite_pianificate, enum stato_slot_pianificato,
 * funzioni genera_slot_ciclo / ricalcola_slot_ciclo / genera_prossimo_ciclo.
 *
 * NB: migration PURAMENTE ADDITIVA (nuove tabelle) — non modifica il template né
 * il comportamento esistente. Ordine con il deploy indifferente.
 *
 * Uso: node scripts/apply-migration-021.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "021_sprint15_pianificazione.sql");

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
  const gia = (await c.query(`SELECT to_regclass('public.piani_visite') AS t`)).rows[0].t;
  if (gia) {
    console.log("⚠️  piani_visite esiste già: la 021 sembra applicata. CREATE TABLE fallirebbe (run-once).");
    console.log("    Interrompo per evitare errori. Verifica lo stato prima di rieseguire.\n");
  } else {
    await c.query(readFileSync(SQL_FILE, "utf8"));
    console.log("✓ Migration 021 applicata.\n");
  }

  const tabelle = (await c.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN ('piani_visite','visite_pianificate')
     ORDER BY table_name`
  )).rows.map((r) => r.table_name);
  console.log("Tabelle:", tabelle.join(", "), `(atteso 2)`);

  const fn = (await c.query(
    `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND proname IN
       ('genera_slot_ciclo','ricalcola_slot_ciclo','genera_prossimo_ciclo')
     ORDER BY proname`
  )).rows.map((r) => r.proname);
  console.log("Funzioni:", fn.join(", "), `(attese 3)`);

  const enumOk = (await c.query(
    `SELECT 1 FROM pg_type WHERE typname='stato_slot_pianificato'`
  )).rowCount;
  console.log("Enum stato_slot_pianificato:", enumOk ? "presente" : "ASSENTE");
} finally {
  await c.end();
}
