/**
 * Test migration 034 (Sprint 19.A · multi-tenancy data foundation) — NON in prod.
 * Protocollo: BEGIN…ROLLBACK. La 034 è applicata DENTRO la transazione e annullata
 * dal ROLLBACK. Le prove di ruolo girano con SET ROLE authenticated/anon (mai
 * superuser). Le org/membership di test extra sono fixture effimere nella tx.
 *
 * Copertura:
 *  - policy INVARIATE: snapshot pg_policies prima/dopo la migration → diff vuoto.
 *  - backfill: membri (5), org_id su clienti/sedi/visite/vp/piani/scadenze (0 NULL),
 *    audit_events (0 NULL), conteggi per org (una sola org = default).
 *  - evoluzione organizzazione: singleton constraint rimossi, slug/stato presenti.
 *  - current_org_id(): 1 membership → org; 0 → NULL; 2 (fixture) → NULL (fail-closed).
 *  - can_write_visita(): admin→true; non-owner non-admin→false; org-mismatch→false.
 *  - comportamento app INVARIATO: visibilità righe per ruolo identica prima/dopo.
 *  - numerazione: UNIQUE globale sostituito da UNIQUE(org, numero_verbale).
 *
 * Uso: node scripts/test-migration-034.mjs
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

let pass = 0, fail = 0;
function ck(name, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? "  — " + extra : ""}`);
  if (ok) pass++; else fail++;
}
const n = (r) => Number(r.rows[0].n);

async function asUser(uid, fn) {
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
  await c.query(`SET LOCAL ROLE authenticated`);
  try { return await fn(); } finally { try { await c.query(`RESET ROLE`); } catch {} }
}
async function policySnapshot() {
  const { rows } = await c.query(`
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies WHERE schemaname='public'
    ORDER BY tablename, policyname, cmd`);
  return JSON.stringify(rows);
}

await c.connect();
try {
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims', NULL, true)`);

  // Utenti reali noti (Fase 1): admin Vincenzo, specialist Maria Chiara / Tecnico Test.
  const ADMIN = "0660b18e-0df8-4b9a-a158-0647b6609356";
  const SPEC1 = "22a12c03-cc0e-4714-aa3d-af1d04800e9c";
  const SPEC2 = "b2bce0d5-5e02-4b21-a93d-42954ff1edb4";

  // ── Baseline PRE-migration: policy + visibilità per ruolo ──
  const polBefore = await policySnapshot();
  const cliAdminBefore = await asUser(ADMIN, () => c.query(`SELECT count(*)::int n FROM public.clienti`).then(n));
  const cliSpecBefore  = await asUser(SPEC1, () => c.query(`SELECT count(*)::int n FROM public.clienti`).then(n));
  const visSpecBefore  = await asUser(SPEC1, () => c.query(`SELECT count(*)::int n FROM public.visite`).then(n));

  // ── Applica 034 nella transazione ──
  await c.query(readFileSync(SQL_FILE, "utf8"));
  console.log("Migration 034 applicata dentro la transazione.\n");

  // ── 1. Policy INVARIATE ──
  const polAfter = await policySnapshot();
  ck("Le 21 policy esistenti restano testualmente IDENTICHE (nessun ALTER POLICY)", polBefore === polAfter);

  // ── 2. Evoluzione organizzazione ──
  const cons = await c.query(`
    SELECT conname FROM pg_constraint WHERE conrelid='public.organizzazione'::regclass`);
  const cn = cons.rows.map(r => r.conname);
  ck("singleton constraint rimossi (solo_true + singleton_uniq)",
     !cn.includes("organizzazione_solo_true") && !cn.includes("organizzazione_singleton_uniq"));
  ck("slug UNIQUE presente + riga default = 'studio-bilello'",
     cn.includes("organizzazione_slug_key") &&
     (await c.query(`SELECT slug, stato FROM public.organizzazione LIMIT 1`)).rows[0].slug === "studio-bilello",
     (await c.query(`SELECT slug, stato FROM public.organizzazione LIMIT 1`)).rows[0].stato);

  // ── 3. Backfill membri ──
  const membri = await c.query(`SELECT count(*)::int n FROM public.organizzazione_membri`);
  ck("organizzazione_membri backfill = 5 righe", n(membri) === 5, `n=${n(membri)}`);
  const orfani = await c.query(`
    SELECT count(*)::int n FROM public.utenti u
    WHERE NOT EXISTS (SELECT 1 FROM public.organizzazione_membri m WHERE m.user_id=u.id)`);
  ck("nessun utente senza membership (atteso 0)", n(orfani) === 0, `n=${n(orfani)}`);
  const ruoliOk = await c.query(`
    SELECT count(*)::int n FROM public.organizzazione_membri m JOIN public.utenti u ON u.id=m.user_id
    WHERE m.ruolo <> u.ruolo OR m.stato <> (CASE WHEN u.attivo THEN 'attivo' ELSE 'sospeso' END)`);
  ck("membri.ruolo/stato coerenti con utenti.ruolo/attivo (atteso 0 discrepanze)", n(ruoliOk) === 0);

  // ── 4. Backfill org_id sulle dirette (0 NULL) + conteggi + org unica ──
  const attesi = { clienti: 3, sedi: 4, visite: 9, visite_pianificate: 12, piani_visite: 4, scadenze: 0 };
  for (const [tab, exp] of Object.entries(attesi)) {
    const nulls = n(await c.query(`SELECT count(*)::int n FROM public.${tab} WHERE organization_id IS NULL`));
    const tot   = n(await c.query(`SELECT count(*)::int n FROM public.${tab}`));
    const grp   = n(await c.query(`SELECT count(DISTINCT organization_id)::int n FROM public.${tab}`));
    ck(`${tab}: 0 NULL, ${exp} righe, 1 sola org`, nulls === 0 && tot === exp && (exp === 0 || grp === 1),
       `null=${nulls} tot=${tot} orgs=${grp}`);
  }

  // ── 5. audit_events backfill (0 NULL sui 5 eventi noti) ──
  const aeNull = n(await c.query(`SELECT count(*)::int n FROM public.audit_events WHERE organization_id IS NULL`));
  const aeTot  = n(await c.query(`SELECT count(*)::int n FROM public.audit_events`));
  ck("audit_events: 5 eventi, 0 NULL dopo backfill", aeNull === 0 && aeTot === 5, `null=${aeNull} tot=${aeTot}`);
  // audit_events NON deve avere DEFAULT (resta l'eccezione)
  const aeDef = await c.query(`
    SELECT column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_events' AND column_name='organization_id'`);
  ck("audit_events.organization_id resta SENZA default e NULLABLE", aeDef.rows[0].column_default === null);

  // ── 6. DEFAULT presente sulle dirette (chiude la finestra 19.A→19.B) ──
  const defOk = await c.query(`
    SELECT count(*)::int n FROM information_schema.columns
    WHERE table_schema='public' AND column_name='organization_id'
      AND table_name IN ('clienti','sedi','visite','visite_pianificate','piani_visite','scadenze')
      AND column_default IS NOT NULL`);
  ck("le 6 dirette hanno DEFAULT su organization_id", n(defOk) === 6, `n=${n(defOk)}`);

  // ── 7. current_org_id() — fail-closed ──
  const orgDefault = (await c.query(`SELECT id FROM public.organizzazione WHERE slug='studio-bilello'`)).rows[0].id;
  const co1 = await asUser(ADMIN, () => c.query(`SELECT public.current_org_id() AS o`).then(r => r.rows[0].o));
  ck("current_org_id(): utente con 1 membership → org di default", co1 === orgDefault, `${co1}`);
  const co0 = await asUser("00000000-0000-4000-8000-000000000000",
    () => c.query(`SELECT public.current_org_id() AS o`).then(r => r.rows[0].o));
  ck("current_org_id(): utente con 0 membership → NULL (fail-closed)", co0 === null);

  // fixture: seconda org + seconda membership per ADMIN → 2 membership attive
  await c.query("SAVEPOINT sp_two");
  await c.query(`INSERT INTO public.organizzazione (ragione_sociale, slug) VALUES ('FIXTURE ORG', 'fixture-org-test')`);
  await c.query(`
    INSERT INTO public.organizzazione_membri (organization_id, user_id, ruolo, stato)
    SELECT id, $1, 'admin', 'attivo' FROM public.organizzazione WHERE slug='fixture-org-test'`, [ADMIN]);
  const co2 = await asUser(ADMIN, () => c.query(`SELECT public.current_org_id() AS o`).then(r => r.rows[0].o));
  ck("current_org_id(): utente con 2 membership → NULL (fail-closed)", co2 === null, `${co2}`);
  await c.query("ROLLBACK TO SAVEPOINT sp_two");

  // ── 8. can_write_visita() ──
  const vis = (await c.query(`SELECT id, specialist_id FROM public.visite LIMIT 1`)).rows[0];
  const cwAdmin = await asUser(ADMIN, () => c.query(`SELECT public.can_write_visita($1) AS b`, [vis.id]).then(r => r.rows[0].b));
  ck("can_write_visita(): admin su visita della propria org → true", cwAdmin === true);
  // un non-owner non-admin: scegli uno specialist che NON è il proprietario della visita
  const nonOwner = vis.specialist_id === SPEC1 ? SPEC2 : SPEC1;
  const cwOther = await asUser(nonOwner, () => c.query(`SELECT public.can_write_visita($1) AS b`, [vis.id]).then(r => r.rows[0].b));
  ck("can_write_visita(): non-owner non-admin → false", cwOther === false);
  // org-mismatch via fail-closed: utente con 2 membership (current_org_id NULL) → false
  await c.query("SAVEPOINT sp_cw");
  await c.query(`INSERT INTO public.organizzazione (ragione_sociale, slug) VALUES ('FIXTURE ORG 2', 'fixture-org-2')`);
  await c.query(`
    INSERT INTO public.organizzazione_membri (organization_id, user_id, ruolo, stato)
    SELECT id, $1, 'admin', 'attivo' FROM public.organizzazione WHERE slug='fixture-org-2'`, [ADMIN]);
  const cwAmb = await asUser(ADMIN, () => c.query(`SELECT public.can_write_visita($1) AS b`, [vis.id]).then(r => r.rows[0].b));
  ck("can_write_visita(): org ambigua (current_org_id NULL) → false (fail-closed)", cwAmb === false);
  await c.query("ROLLBACK TO SAVEPOINT sp_cw");

  // ── 9. Comportamento app INVARIATO: visibilità per ruolo identica prima/dopo ──
  const cliAdminAfter = await asUser(ADMIN, () => c.query(`SELECT count(*)::int n FROM public.clienti`).then(n));
  const cliSpecAfter  = await asUser(SPEC1, () => c.query(`SELECT count(*)::int n FROM public.clienti`).then(n));
  const visSpecAfter  = await asUser(SPEC1, () => c.query(`SELECT count(*)::int n FROM public.visite`).then(n));
  ck("visibilità clienti (admin) invariata pre/post", cliAdminBefore === cliAdminAfter, `${cliAdminBefore}→${cliAdminAfter}`);
  ck("visibilità clienti (specialist) invariata pre/post", cliSpecBefore === cliSpecAfter, `${cliSpecBefore}→${cliSpecAfter}`);
  ck("visibilità visite (specialist) invariata pre/post", visSpecBefore === visSpecAfter, `${visSpecBefore}→${visSpecAfter}`);

  // ── 10. Numerazione: UNIQUE globale sostituito da UNIQUE(org, numero) ──
  const uq = await c.query(`
    SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint
    WHERE conrelid='public.visite'::regclass AND contype='u'`);
  const defs = uq.rows.map(r => r.def);
  ck("UNIQUE(numero_verbale) globale rimosso", !defs.some(d => d === "UNIQUE (numero_verbale)"));
  ck("UNIQUE(organization_id, numero_verbale) presente",
     defs.some(d => d.replace(/\s+/g, " ") === "UNIQUE (organization_id, numero_verbale)"),
     defs.join(" | "));

  console.log(`\n${fail === 0 ? "✅" : "❌"} PASS=${pass} FAIL=${fail}`);
} finally {
  await c.query("ROLLBACK");
  await c.end();
  console.log("Transazione annullata (ROLLBACK): produzione INTATTA.");
}
