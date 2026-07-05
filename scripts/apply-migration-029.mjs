/**
 * Applica supabase/migrations/029_haccp_generico_template.sql (Sprint HACCP 2) via
 * pooler. Il file è quello GENERATO da build-migration-029-seed.mjs e NON viene
 * rigenerato dopo l'apply (byte-identico al commit finale).
 *
 * Pre-check → apply → post-check essenziale. Test funzionali completi:
 * scripts/test-migration-029.mjs.
 *
 * Uso: node scripts/apply-migration-029.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "029_haccp_generico_template.sql");

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

async function scalar(q, p) {
  return (await c.query(q, p)).rows[0];
}

await c.connect();
try {
  console.log("=== PRE-CHECK ===");
  const pre = {
    hgAttivo: (await scalar(`SELECT attivo FROM public.moduli WHERE codice='haccp_generico'`)).attivo,
    tmplHaccp: (await scalar(`SELECT count(*)::int n FROM public.template_master WHERE modulo_id='a0000000-0000-4000-8000-000000000002'`)).n,
    defVisite: (await scalar(`SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='visite' AND column_name='modulo_id'`)).column_default,
    uniqVers: (await scalar(`SELECT count(*)::int n FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nn ON nn.oid=rel.relnamespace WHERE nn.nspname='public' AND rel.relname='template_master' AND con.contype='u'`)).n,
  };
  console.log(`  haccp_generico attivo    = ${pre.hgAttivo}  (atteso false)`);
  console.log(`  template HACCP presenti  = ${pre.tmplHaccp}  (atteso 0)`);
  console.log(`  visite.modulo_id default = ${pre.defVisite ?? "NULL"}  (atteso: DEFAULT sicurezza presente)`);
  console.log(`  UNIQUE su template_master= ${pre.uniqVers} constraint\n`);

  console.log("=== APPLY 029 ===");
  await c.query(readFileSync(SQL_FILE, "utf8"));
  console.log("✓ Migration 029 applicata.\n");

  console.log("=== POST-CHECK ===");
  const post = {
    hgAttivo: (await scalar(`SELECT attivo FROM public.moduli WHERE codice='haccp_generico'`)).attivo,
    retail: (await scalar(`SELECT attivo FROM public.moduli WHERE codice='haccp_retail'`)).attivo,
    collettiva: (await scalar(`SELECT attivo FROM public.moduli WHERE codice='haccp_collettiva'`)).attivo,
    sicurezza: (await scalar(`SELECT attivo FROM public.moduli WHERE codice='sicurezza'`)).attivo,
    tmpl: await scalar(`SELECT id, nome, versione, attivo, jsonb_array_length(struttura_json->'sezioni') sez, struttura_json->>'tipo_scoring' ts FROM public.template_master WHERE modulo_id='a0000000-0000-4000-8000-000000000002'`),
    defVisite: (await scalar(`SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='visite' AND column_name='modulo_id'`)).column_default,
    defPiani: (await scalar(`SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='piani_visite' AND column_name='modulo_id'`)).column_default,
    defTmpl: (await scalar(`SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='template_master' AND column_name='modulo_id'`)).column_default,
    uniqName: (await scalar(`SELECT con.conname FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace nn ON nn.oid=rel.relnamespace WHERE nn.nspname='public' AND rel.relname='template_master' AND con.contype='u'`))?.conname,
    fnAcl: (await scalar(`SELECT proacl::text acl FROM pg_proc WHERE proname='can_creare_visita_con_modulo'`))?.acl,
  };
  console.log(`  haccp_generico attivo    = ${post.hgAttivo}  (atteso true)`);
  console.log(`  haccp_retail attivo      = ${post.retail}  (atteso false)`);
  console.log(`  haccp_collettiva attivo  = ${post.collettiva}  (atteso false)`);
  console.log(`  sicurezza attivo         = ${post.sicurezza}  (atteso true)`);
  console.log(`  template HACCP: v${post.tmpl?.versione} attivo=${post.tmpl?.attivo} sezioni=${post.tmpl?.sez} tipo_scoring=${post.tmpl?.ts}`);
  console.log(`  DEFAULT modulo_id -> visite=${post.defVisite ?? "NULL"} piani=${post.defPiani ?? "NULL"} template=${post.defTmpl ?? "NULL"}  (atteso tutti NULL)`);
  console.log(`  UNIQUE template_master   = ${post.uniqName}  (atteso template_master_modulo_versione_key)`);
  console.log(`  ACL can_creare_visita_con_modulo = ${post.fnAcl}`);
} finally {
  await c.end();
}
