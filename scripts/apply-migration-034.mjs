/**
 * Applica supabase/migrations/034_multitenancy_foundation.sql in PRODUZIONE.
 * Atomico: BEGIN…COMMIT (ROLLBACK automatico su qualunque errore).
 * Cattura pg_policies PRIMA e DOPO per confermare che le 21 policy esistenti
 * restano identiche. Verifica post-apply di sola lettura.
 *
 * Uso: node scripts/apply-migration-034.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "034_multitenancy_foundation.sql");
function dbUrl() {
  for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i < 0) continue;
    if (l.slice(0, i).trim() === "DATABASE_URL")
      return l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("no DATABASE_URL");
}
const c = new pg.Client({
  host: "aws-1-eu-central-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${REF}`,
  password: decodeURIComponent(new URL(dbUrl()).password),
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
const n = (r) => Number(r.rows[0].n);
async function policySnapshot() {
  const { rows } = await c.query(`
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies WHERE schemaname='public'
    ORDER BY tablename, policyname, cmd`);
  return JSON.stringify(rows);
}

await c.connect();
try {
  const polBefore = await policySnapshot();
  console.log("Snapshot policy PRE-apply catturato.");

  // ── APPLY atomico ──
  try {
    await c.query("BEGIN");
    await c.query(readFileSync(SQL_FILE, "utf8"));
    await c.query("COMMIT");
    console.log("✓ Migration 034 APPLICATA e COMMIT in produzione.\n");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("✗ ERRORE durante l'apply — ROLLBACK, produzione INTATTA:", e.message);
    process.exit(1);
  }

  // ── Verifica post-apply (sola lettura) ──
  const polAfter = await policySnapshot();
  console.log(polBefore === polAfter
    ? "✓ Le 21 policy esistenti sono IDENTICHE a pre-apply."
    : "✗ ATTENZIONE: le policy sono cambiate!");

  console.log("\n— Conteggi per tabella (0 NULL, 1 org attesi) —");
  for (const [tab, exp] of Object.entries({
    clienti: 3, sedi: 4, visite: 9, visite_pianificate: 12, piani_visite: 4, scadenze: 0,
  })) {
    const nulls = n(await c.query(`SELECT count(*)::int n FROM public.${tab} WHERE organization_id IS NULL`));
    const tot = n(await c.query(`SELECT count(*)::int n FROM public.${tab}`));
    const grp = n(await c.query(`SELECT count(DISTINCT organization_id)::int n FROM public.${tab}`));
    console.log(`  ${tab.padEnd(20)} tot=${tot} (atteso ${exp}) null=${nulls} orgs=${grp}`);
  }

  const membri = n(await c.query(`SELECT count(*)::int n FROM public.organizzazione_membri`));
  const orfani = n(await c.query(`
    SELECT count(*)::int n FROM public.utenti u
    WHERE NOT EXISTS (SELECT 1 FROM public.organizzazione_membri m WHERE m.user_id=u.id)`));
  console.log(`\n  organizzazione_membri = ${membri} (atteso 5), utenti senza membership = ${orfani} (atteso 0)`);

  const aeNull = n(await c.query(`SELECT count(*)::int n FROM public.audit_events WHERE organization_id IS NULL`));
  const aeTot = n(await c.query(`SELECT count(*)::int n FROM public.audit_events`));
  console.log(`  audit_events tot=${aeTot} null=${aeNull} (atteso 5 / 0)`);

  const org = (await c.query(`SELECT slug, stato, singleton FROM public.organizzazione ORDER BY creato_il`)).rows;
  console.log(`\n  organizzazione:`, JSON.stringify(org));

  const uq = (await c.query(`
    SELECT pg_get_constraintdef(oid) def FROM pg_constraint
    WHERE conrelid='public.visite'::regclass AND contype='u'`)).rows.map(r => r.def);
  console.log(`  visite UNIQUE:`, uq.join(" | "));

  const fns = (await c.query(`
    SELECT proname FROM pg_proc WHERE proname IN ('current_org_id','can_write_visita') ORDER BY proname`)).rows.map(r => r.proname);
  console.log(`  funzioni nuove presenti:`, fns.join(", "));
} finally {
  await c.end();
}
