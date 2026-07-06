/**
 * Applica supabase/migrations/031_organizzazione_singleton.sql (Sprint 16.6) via
 * pooler. Pre-check → apply → post-check (seed, vincoli, policy). Test funzionali:
 * scripts/test-migration-031.mjs (BEGIN…ROLLBACK).
 *
 * Uso: node scripts/apply-migration-031.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "031_organizzazione_singleton.sql");

function dbUrl() {
  for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i < 0) continue;
    if (l.slice(0, i).trim() === "DATABASE_URL") return l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("no DATABASE_URL");
}

const u = new URL(dbUrl());
const c = new pg.Client({
  host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432,
  user: `postgres.${REF}`, password: decodeURIComponent(u.password),
  database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
});

async function scalar(q, p) { return (await c.query(q, p)).rows[0]; }

await c.connect();
try {
  console.log("=== PRE-CHECK ===");
  const esisteTab = (await scalar(`SELECT to_regclass('public.organizzazione') IS NOT NULL AS x`)).x;
  console.log(`  tabella organizzazione esiste = ${esisteTab}  (atteso false)\n`);

  console.log("=== APPLY 031 ===");
  await c.query(readFileSync(SQL_FILE, "utf8"));
  console.log("✓ Migration 031 applicata.\n");

  console.log("=== POST-CHECK ===");
  const seed = await scalar(`SELECT count(*)::int n, min(ragione_sociale) rs, bool_and(singleton) sing FROM public.organizzazione`);
  const rls = (await scalar(`SELECT relrowsecurity FROM pg_class WHERE oid='public.organizzazione'::regclass`)).relrowsecurity;
  const policies = (await c.query(`SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='organizzazione' ORDER BY policyname`)).rows;
  const vincoli = (await c.query(`SELECT conname, contype FROM pg_constraint WHERE conrelid='public.organizzazione'::regclass AND contype IN ('c','u') ORDER BY conname`)).rows;
  const trig = (await c.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.organizzazione'::regclass AND NOT tgisinternal`)).rows.map((r) => r.tgname);

  console.log(`  seed: righe=${seed.n} ragione_sociale='${seed.rs}' singleton=${seed.sing}  (atteso 1 / 'Studio Bilello' / true)`);
  console.log(`  RLS abilitata = ${rls}  (atteso true)`);
  console.log(`  policy = ${policies.map((p) => `${p.policyname}(${p.cmd})`).join(", ")}  (atteso: org_select_attivi SELECT, org_update_admin UPDATE)`);
  console.log(`  vincoli = ${vincoli.map((v) => `${v.conname}(${v.contype})`).join(", ")}  (atteso: CHECK solo_true + UNIQUE singleton)`);
  console.log(`  trigger = ${trig.join(", ")}  (atteso trg_org_aggiornato)`);
} finally {
  await c.end();
}
