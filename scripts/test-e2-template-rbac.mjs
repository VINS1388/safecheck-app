/**
 * E2 — Test RLS-ENFORCED del restringimento RBAC su template_cliente/template_sede
 * (migration 037).
 *
 * PROTOCOLLO (come 19.C): scenari con RLS ENFORCED (SET LOCAL request.jwt.claims +
 * SET LOCAL ROLE authenticated + RESET ROLE), MAI da superuser per gli assert di
 * policy. Setup da superuser (RLS bypassata). La 037 è applicata DENTRO la
 * transazione (prod è a 036) e TUTTO è ROLLBACK-ato.
 *
 * Scenari:
 *   0. DISCRIMINANTE PRE-FIX (policy 002 ancora attive): un tecnico SCRIVE un
 *      override di template per un cliente raggiungibile → oggi PASSA (conferma il
 *      gap ed è la prova che il test è discriminante).
 *   Dopo l'apply di 037:
 *   1. Il tecnico NON scrive (INSERT/UPDATE/DELETE) override cliente/sede, nemmeno
 *      per un cliente/sede RAGGIUNGIBILE.
 *   2. Admin e planner scrivono (INSERT...RETURNING incluso) → nessuna regressione.
 *   3. Lettura: il tecnico legge ancora l'override di un cliente/sede RAGGIUNGIBILE
 *      (no regressione sul caso legittimo) ma NON quello di uno non raggiungibile
 *      (restringimento voluto). Admin legge tutto.
 *
 * Uso: node scripts/test-e2-template-rbac.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_037 = readFileSync(join(ROOT, "supabase", "migrations", "037_template_override_rbac.sql"), "utf8");
function dbUrl() {
  for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = l.indexOf("="); if (i < 0) continue;
    if (l.slice(0, i).trim() === "DATABASE_URL") return l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("no DATABASE_URL");
}
const c = new pg.Client({ host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}`,
  password: decodeURIComponent(new URL(dbUrl()).password), database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? "  — " + extra : ""}`);
  if (ok) pass++; else fail++;
}
async function asUser(uid, fn) {
  await c.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: uid, role: "authenticated" })}'`);
  await c.query(`SET LOCAL ROLE authenticated`);
  try { return await fn(); } finally { await c.query(`RESET ROLE`); }
}
let spN = 0;
async function sp(fn) {
  const name = `sp_${++spN}`;
  await c.query(`SAVEPOINT ${name}`);
  try { const r = await fn(); await c.query(`RELEASE SAVEPOINT ${name}`); return { ok: true, value: r }; }
  catch (e) { await c.query(`ROLLBACK TO SAVEPOINT ${name}`); await c.query(`RELEASE SAVEPOINT ${name}`); return { ok: false, error: e }; }
}
async function rowsAs(uid, sql, p = []) { return asUser(uid, async () => (await c.query(sql, p)).rowCount); }
async function throwsAs(uid, sql, p = []) { return asUser(uid, async () => !(await sp(() => c.query(sql, p))).ok); }
async function insertOkAs(uid, sql, p = []) { return asUser(uid, async () => (await sp(() => c.query(sql, p))).ok); }

const MOD_SC = "a0000000-0000-4000-8000-000000000001";

await c.connect();
try {
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims', NULL, true)`);

  // ── Attori ──
  const A = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0]?.id;
  const PL = (await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local' LIMIT 1`)).rows[0]?.id;
  const T = (await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local' LIMIT 1`)).rows[0]?.id;
  if (!A || !PL || !T) { console.log(`⚠️ attori mancanti A=${!!A} PL=${!!PL} T=${!!T}`); await c.query("ROLLBACK"); process.exit(1); }
  const ORG1 = (await c.query(`SELECT organization_id FROM public.organizzazione_membri WHERE user_id=$1 AND stato='attivo'`, [A])).rows[0].organization_id;

  // Sede/cliente reali RAGGIUNGIBILI dal tecnico: creo una visita di T sulla sede S.
  const { sede_id: S, cliente_id: C } = (await c.query(
    `SELECT pv.sede_id, s.cliente_id FROM public.piani_visite pv JOIN public.sedi s ON s.id=pv.sede_id LIMIT 1`)).rows[0];
  await c.query(
    `INSERT INTO public.visite (sede_id, cliente_id, specialist_id, modulo_id, template_snapshot, data_visita, stato, organization_id)
     VALUES ($1,$2,$3,$4,'{}'::jsonb,CURRENT_DATE,'bozza',$5)`, [S, C, T, MOD_SC, ORG1]);

  // Cliente/sede NON raggiungibili dal tecnico (nessuna visita/slot di T).
  const C2 = (await c.query(`INSERT INTO public.clienti (ragione_sociale, organization_id) VALUES ('Cli E2 no-reach',$1) RETURNING id`, [ORG1])).rows[0].id;
  const S2 = (await c.query(`INSERT INTO public.sedi (cliente_id,nome,indirizzo,citta,organization_id) VALUES ($1,'Sede E2','Via X','Bari',$2) RETURNING id`, [C2, ORG1])).rows[0].id;

  // Override esistenti (superuser) per i test di lettura/UPDATE/DELETE.
  const tcReach = (await c.query(`INSERT INTO public.template_cliente (cliente_id, struttura_json) VALUES ($1,'{}'::jsonb) RETURNING id`, [C])).rows[0].id;
  const tcUnreach = (await c.query(`INSERT INTO public.template_cliente (cliente_id, struttura_json) VALUES ($1,'{}'::jsonb) RETURNING id`, [C2])).rows[0].id;
  const tsReach = (await c.query(`INSERT INTO public.template_sede (sede_id, cliente_id, struttura_json) VALUES ($1,$2,'{}'::jsonb) RETURNING id`, [S, C])).rows[0].id;
  const tsUnreach = (await c.query(`INSERT INTO public.template_sede (sede_id, cliente_id, struttura_json) VALUES ($1,$2,'{}'::jsonb) RETURNING id`, [S2, C2])).rows[0].id;

  console.log(`admin=${A} planner=${PL} tecnico=${T}\ncliente raggiungibile=${C}  non-raggiungibile=${C2}\n`);

  // ══════════════ 0. DISCRIMINANTE PRE-FIX (policy 002) ══════════════
  const preInsert = await insertOkAs(T, `INSERT INTO public.template_cliente (cliente_id, struttura_json) VALUES ($1,'{}'::jsonb)`, [C]);
  check("PRE-FIX (policy 002): il tecnico SCRIVE un override cliente → PASSA oggi (gap confermato, test discriminante)", preInsert === true);

  // ══════════════ APPLY 037 ══════════════
  await c.query(SQL_037);
  console.log("\n[migration 037 applicata in transazione]\n");

  // ══════════════ 1. TECNICO NON scrive (post-fix) ══════════════
  check("template_cliente: tecnico NON INSERISCE override (cliente raggiungibile)",
    await throwsAs(T, `INSERT INTO public.template_cliente (cliente_id, struttura_json) VALUES ($1,'{}'::jsonb)`, [C]) === true);
  check("template_cliente: tecnico NON AGGIORNA override esistente (0 righe)",
    await rowsAs(T, `UPDATE public.template_cliente SET versione=versione+1 WHERE id=$1 RETURNING id`, [tcReach]) === 0);
  check("template_cliente: tecnico NON ELIMINA override esistente (0 righe)",
    await rowsAs(T, `DELETE FROM public.template_cliente WHERE id=$1 RETURNING id`, [tcReach]) === 0);
  check("template_sede: tecnico NON INSERISCE override (sede raggiungibile)",
    await throwsAs(T, `INSERT INTO public.template_sede (sede_id, cliente_id, struttura_json) VALUES ($1,$2,'{}'::jsonb)`, [S, C]) === true);
  check("template_sede: tecnico NON AGGIORNA override esistente (0 righe)",
    await rowsAs(T, `UPDATE public.template_sede SET versione=versione+1 WHERE id=$1 RETURNING id`, [tsReach]) === 0);
  check("template_sede: tecnico NON ELIMINA override esistente (0 righe)",
    await rowsAs(T, `DELETE FROM public.template_sede WHERE id=$1 RETURNING id`, [tsReach]) === 0);

  // ══════════════ 2. ADMIN/PLANNER scrivono (post-fix) ══════════════
  check("template_cliente: admin INSERISCE override (INSERT...RETURNING)",
    await insertOkAs(A, `INSERT INTO public.template_cliente (cliente_id, struttura_json) VALUES ($1,'{}'::jsonb) RETURNING id`, [C]) === true);
  check("template_cliente: planner INSERISCE override",
    await insertOkAs(PL, `INSERT INTO public.template_cliente (cliente_id, struttura_json) VALUES ($1,'{}'::jsonb)`, [C]) === true);
  check("template_cliente: admin AGGIORNA override esistente (1 riga)",
    await rowsAs(A, `UPDATE public.template_cliente SET versione=versione+1 WHERE id=$1 RETURNING id`, [tcReach]) === 1);
  check("template_sede: planner INSERISCE override (INSERT...RETURNING)",
    await insertOkAs(PL, `INSERT INTO public.template_sede (sede_id, cliente_id, struttura_json) VALUES ($1,$2,'{}'::jsonb) RETURNING id`, [S, C]) === true);
  check("template_sede: admin ELIMINA override esistente (1 riga)",
    await rowsAs(A, `DELETE FROM public.template_sede WHERE id=$1 RETURNING id`, [tsUnreach]) === 1);

  // ══════════════ 3. LETTURA: raggiungibilità (post-fix) ══════════════
  check("template_cliente: tecnico LEGGE l'override del cliente RAGGIUNGIBILE (no regressione)",
    await rowsAs(T, `SELECT 1 FROM public.template_cliente WHERE id=$1`, [tcReach]) === 1);
  check("template_cliente: tecnico NON legge l'override di un cliente NON raggiungibile (restringimento)",
    await rowsAs(T, `SELECT 1 FROM public.template_cliente WHERE id=$1`, [tcUnreach]) === 0);
  check("template_sede: tecnico LEGGE l'override della sede RAGGIUNGIBILE (no regressione)",
    await rowsAs(T, `SELECT 1 FROM public.template_sede WHERE id=$1`, [tsReach]) === 1);
  check("template_sede: tecnico NON legge l'override di una sede NON raggiungibile",
    await rowsAs(T, `SELECT 1 FROM public.template_sede WHERE id=$1`, [tsUnreach]) === 0);
  check("template_cliente: admin LEGGE anche l'override del cliente non raggiungibile dal tecnico (no regressione)",
    await rowsAs(A, `SELECT 1 FROM public.template_cliente WHERE id=$1`, [tcUnreach]) === 1);

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  console.log("ROLLBACK eseguito — nessuna modifica persistita.");
}
process.exit(fail === 0 ? 0 : 1);
