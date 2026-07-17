/**
 * Sprint 19.C — Test RLS-ENFORCED del cutover org-aware (migration 035).
 *
 * PROTOCOLLO (come 025/027): ogni scenario gira con RLS ENFORCED —
 *   SET LOCAL request.jwt.claims={sub,role:'authenticated'} + SET LOCAL ROLE
 *   authenticated + RESET ROLE. MAI da superuser per gli assert di policy. Il
 *   "service role" è emulato azzerando i claims (auth.uid() → NULL). La migration
 *   035 è applicata DENTRO la transazione (prod è a 034) e TUTTO è ROLLBACK-ato.
 *
 * Novità 19.C testate:
 *   1. Isolamento cross-org su tabelle DIRETTE (clienti/sedi/visite/…): un admin
 *      dell'org1 NON tocca righe dell'org2 (SELECT/UPDATE/DELETE/INSERT).
 *   2. Isolamento cross-org su tabelle FOGLIA via can_write_visita(): un admin
 *      dell'org1 NON scrive risposte/verbali di una visita dell'org2 (bug del
 *      short-circuit is_admin() chiuso).
 *   3. current_org_id() FAIL-CLOSED: 0 o 2+ membership attive → NULL → nega tutto.
 *   4. Regressione intra-org: i permessi per-ruolo di 025 restano invariati.
 *   5. Trigger MIRROR su organizzazione_membri (anti-lockout per-org SC001,
 *      anti-escalation esente service-role) + utenti triggers ancora presenti.
 *   6. organizzazione_membri DENY-ALL anche per admin authenticated (C).
 *
 * Uso: node scripts/test-19c-cutover.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_035 = readFileSync(join(ROOT, "supabase", "migrations", "035_org_aware_cutover.sql"), "utf8");

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
function check(name, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? "  — " + extra : ""}`);
  if (ok) pass++; else fail++;
}

async function asUser(uid, fn) {
  await c.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: uid, role: "authenticated" })}'`);
  await c.query(`SET LOCAL ROLE authenticated`);
  try { return await fn(); } finally { await c.query(`RESET ROLE`); }
}
async function asService(fn) {
  await c.query(`SELECT set_config('request.jwt.claims', NULL, true)`);
  await c.query(`RESET ROLE`);
  return fn();
}
let spN = 0;
async function sp(fn) {
  const name = `sp_${++spN}`;
  await c.query(`SAVEPOINT ${name}`);
  try { const r = await fn(); await c.query(`RELEASE SAVEPOINT ${name}`); return { ok: true, value: r }; }
  catch (e) { await c.query(`ROLLBACK TO SAVEPOINT ${name}`); await c.query(`RELEASE SAVEPOINT ${name}`); return { ok: false, error: e }; }
}
async function rowsAs(uid, sql, params = []) { return asUser(uid, async () => (await c.query(sql, params)).rowCount); }
async function throwsAs(uid, sql, params = []) { return asUser(uid, async () => !(await sp(() => c.query(sql, params))).ok); }
async function scalarAs(uid, sql, params = []) { return asUser(uid, async () => (await c.query(sql, params)).rows[0]); }

const MOD = "a0000000-0000-4000-8000-000000000001";
async function creaVisita(sede, cliente, specialist, org = null, stato = "bozza") {
  const r = await c.query(
    `INSERT INTO public.visite (sede_id, cliente_id, specialist_id, modulo_id, template_snapshot, data_visita, stato, organization_id)
     VALUES ($1,$2,$3,$4,'{}'::jsonb,CURRENT_DATE,$5, COALESCE($6, public.current_org_id())) RETURNING id`,
    [sede, cliente, specialist, MOD, stato, org]);
  return r.rows[0].id;
}

await c.connect();
try {
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims', NULL, true)`);

  // ── Applica 035 in transazione ──
  await c.query(SQL_035);
  console.log("Migration 035 applicata in transazione (prod resta a 034).\n");

  // ── Attori reali (org1 = Studio Bilello) ──
  const A = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true ORDER BY creato_il LIMIT 1`)).rows[0]?.id;
  const A2 = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true AND id<>$1 LIMIT 1`, [A])).rows[0]?.id;
  const PL = (await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local' LIMIT 1`)).rows[0]?.id;
  const T = (await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local' LIMIT 1`)).rows[0]?.id;
  const O = (await c.query(`SELECT id FROM public.utenti WHERE attivo=true AND id NOT IN ($1,$2,$3) LIMIT 1`, [A, PL, T])).rows[0]?.id;
  if (!A || !A2 || !PL || !T || !O) {
    console.log(`⚠️  Attori mancanti: admin=${!!A} admin2=${!!A2} planner=${!!PL} tecnico=${!!T} altro=${!!O}`);
    await c.query("ROLLBACK"); process.exit(1);
  }
  const ORG1 = (await c.query(`SELECT organization_id FROM public.organizzazione_membri WHERE user_id=$1 AND stato='attivo'`, [A])).rows[0].organization_id;

  // Piano/sede/cliente reali dell'org1
  const piano = (await c.query(
    `SELECT pv.id, pv.sede_id, s.cliente_id FROM public.piani_visite pv JOIN public.sedi s ON s.id=pv.sede_id LIMIT 1`)).rows[0];
  const { sede_id: S, cliente_id: C } = piano;

  // Visita PROPRIA del tecnico nell'org1 + una risposta
  const VT = await creaVisita(S, C, T, ORG1);
  // Visita di un ALTRO utente (O) nell'org1, senza slot → T non deve poterla vedere
  // (deterministica: non dipende dai dati di produzione collegati a O).
  const VO1 = await creaVisita(S, C, O, ORG1);
  const RT = (await c.query(
    `INSERT INTO public.risposte (visita_id, domanda_id, sezione_id, valore) VALUES ($1,'D-01-001','SEZ-01','C') RETURNING id`, [VT])).rows[0].id;

  // ── ORG2 fittizia + cliente/sede/visita/risposta in ORG2 (superuser, org esplicita) ──
  const ORG2 = (await c.query(
    `INSERT INTO public.organizzazione (ragione_sociale, slug, stato) VALUES ('Org2 Test 19C','org2-test-19c','attiva') RETURNING id`)).rows[0].id;
  const C2 = (await c.query(
    `INSERT INTO public.clienti (ragione_sociale, organization_id) VALUES ('Cliente Org2', $1) RETURNING id`, [ORG2])).rows[0].id;
  const S2 = (await c.query(
    `INSERT INTO public.sedi (cliente_id, nome, indirizzo, citta, organization_id) VALUES ($1,'Sede Org2','Via 2','Bari',$2) RETURNING id`, [C2, ORG2])).rows[0].id;
  const V2 = await creaVisita(S2, C2, O, ORG2);
  const R2row = (await c.query(
    `INSERT INTO public.risposte (visita_id, domanda_id, sezione_id, valore) VALUES ($1,'D-01-001','SEZ-01','C') RETURNING id`, [V2])).rows[0].id;
  // Piano + slot di pianificazione in ORG2 (piano_id è NOT NULL → serve un piano org2)
  const P2 = (await c.query(
    `INSERT INTO public.piani_visite (sede_id, data_inizio_ciclo, visite_anno, modulo_id, organization_id)
     VALUES ($1, CURRENT_DATE, 2, $2, $3) RETURNING id`, [S2, MOD, ORG2])).rows[0].id;
  const SLOT2 = (await c.query(
    `INSERT INTO public.visite_pianificate (piano_id, sede_id, numero_visita, data_suggerita, organization_id)
     VALUES ($1, $2, 1, CURRENT_DATE, $3) RETURNING id`, [P2, S2, ORG2])).rows[0].id;
  // Slot nell'ORG1 (sul piano reale) per il caso positivo del DELETE
  const SLOT1 = (await c.query(
    `INSERT INTO public.visite_pianificate (piano_id, sede_id, numero_visita, data_suggerita, organization_id)
     VALUES ($1, $2, 99, CURRENT_DATE, $3) RETURNING id`, [piano.id, S, ORG1])).rows[0].id;

  console.log(`org1=${ORG1}  org2=${ORG2}  admin=${A}  tecnico=${T}\n`);

  // ══════════════════ 3. current_org_id() FAIL-CLOSED ══════════════════
  check("current_org_id: admin (1 membership) → org1",
    (await scalarAs(A, `SELECT public.current_org_id() v`)).v === ORG1);
  check("current_org_id: tecnico (1 membership) → org1",
    (await scalarAs(T, `SELECT public.current_org_id() v`)).v === ORG1);

  // O riceve una 2ª membership attiva (in org2) → 2 attive → ambiguo → NULL.
  // Ruolo 'specialist' di proposito: irrilevante per l'ambiguità, ed evita di far
  // scattare l'anti-lockout quando poco sotto sospendiamo entrambe le membership.
  await asService(() => c.query(
    `INSERT INTO public.organizzazione_membri (organization_id, user_id, ruolo, stato) VALUES ($1,$2,'specialist','attivo')`, [ORG2, O]));
  check("current_org_id: utente con 2 membership attive → NULL (fail-closed)",
    (await scalarAs(O, `SELECT public.current_org_id() v`)).v === null);
  check("FAIL-CLOSED (2 membership): O NON vede la propria visita org1",
    await rowsAs(O, `SELECT 1 FROM public.visite WHERE specialist_id=$1`, [O]) === 0);

  // Sospendi ENTRAMBE le membership di O → 0 attive → NULL
  await asService(() => c.query(`UPDATE public.organizzazione_membri SET stato='sospeso' WHERE user_id=$1`, [O]));
  check("current_org_id: utente con 0 membership attive → NULL (fail-closed)",
    (await scalarAs(O, `SELECT public.current_org_id() v`)).v === null);
  // Ripristina O all'org1 sola (per i test successivi come "altro utente" normale)
  await asService(() => c.query(`DELETE FROM public.organizzazione_membri WHERE user_id=$1 AND organization_id=$2`, [O, ORG2]));
  await asService(() => c.query(`UPDATE public.organizzazione_membri SET stato='attivo' WHERE user_id=$1 AND organization_id=$2`, [O, ORG1]));
  check("current_org_id: O ripristinato a 1 membership → org1",
    (await scalarAs(O, `SELECT public.current_org_id() v`)).v === ORG1);

  // ══════════════════ 1. ISOLAMENTO CROSS-ORG — tabelle DIRETTE (admin org1) ══════════════════
  check("X-ORG clienti: admin org1 NON vede cliente org2 (SELECT)", await rowsAs(A, `SELECT 1 FROM public.clienti WHERE id=$1`, [C2]) === 0);
  check("X-ORG clienti: admin org1 vede il PROPRIO cliente (baseline)", await rowsAs(A, `SELECT 1 FROM public.clienti WHERE id=$1`, [C]) === 1);
  check("X-ORG clienti: admin org1 NON aggiorna cliente org2", await rowsAs(A, `UPDATE public.clienti SET note='x' WHERE id=$1 RETURNING id`, [C2]) === 0);
  check("X-ORG clienti: admin org1 NON elimina cliente org2", await rowsAs(A, `DELETE FROM public.clienti WHERE id=$1 RETURNING id`, [C2]) === 0);
  check("X-ORG sedi: admin org1 NON vede sede org2", await rowsAs(A, `SELECT 1 FROM public.sedi WHERE id=$1`, [S2]) === 0);
  check("X-ORG sedi: admin org1 NON aggiorna sede org2", await rowsAs(A, `UPDATE public.sedi SET note='x' WHERE id=$1 RETURNING id`, [S2]) === 0);
  check("X-ORG visite: admin org1 NON vede visita org2", await rowsAs(A, `SELECT 1 FROM public.visite WHERE id=$1`, [V2]) === 0);
  check("X-ORG visite: admin org1 NON aggiorna visita org2", await rowsAs(A, `UPDATE public.visite SET note_conclusive='x' WHERE id=$1 RETURNING id`, [V2]) === 0);
  check("X-ORG visite: admin org1 NON elimina visita org2", await rowsAs(A, `DELETE FROM public.visite WHERE id=$1 RETURNING id`, [V2]) === 0);
  check("X-ORG vp: admin org1 NON vede slot org2", await rowsAs(A, `SELECT 1 FROM public.visite_pianificate WHERE id=$1`, [SLOT2]) === 0);
  check("X-ORG vp: admin org1 NON elimina slot org2 (vp_delete org-gated)",
    await rowsAs(A, `DELETE FROM public.visite_pianificate WHERE id=$1 RETURNING id`, [SLOT2]) === 0);
  check("X-ORG vp: lo slot org2 esiste ancora dopo il tentativo (verifica da service role)",
    await asService(async () => (await c.query(`SELECT count(*)::int n FROM public.visite_pianificate WHERE id=$1`, [SLOT2])).rows[0].n) === 1);
  check("INTRA-ORG vp: admin org1 ELIMINA uno slot della PROPRIA org (baseline positiva)",
    (await asUser(A, () => sp(() => c.query(`DELETE FROM public.visite_pianificate WHERE id=$1 RETURNING id`, [SLOT1])))).value?.rowCount === 1);
  // DISCRIMINANTE — i check DELETE cross-org in stile "WHERE id=$1 RETURNING" (qui e
  // negli altri blocchi) passano per il MASKING della policy SELECT, non per la policy
  // DELETE: una DELETE che referenzia una colonna fa applicare a Postgres anche la
  // USING della SELECT (riga org2 invisibile → 0). L'org-gate su vp_delete si prova
  // solo con un path che NON attiva il masking: una DELETE senza WHERE (nessuna
  // colonna referenziata). In savepoint, rollback subito dopo l'assert.
  let slot2SopravviveBareDelete = false;
  await c.query(`SAVEPOINT bare_del`);
  try {
    await asUser(A, () => c.query(`DELETE FROM public.visite_pianificate`));
    slot2SopravviveBareDelete =
      (await c.query(`SELECT count(*)::int n FROM public.visite_pianificate WHERE id=$1`, [SLOT2])).rows[0].n === 1;
  } finally {
    await c.query(`ROLLBACK TO SAVEPOINT bare_del`);
    await c.query(`RELEASE SAVEPOINT bare_del`);
  }
  check("X-ORG vp (DISCRIMINANTE): bare DELETE FROM vp come admin org1 NON tocca lo slot org2 (vp_delete org-gated, bypassa il masking SELECT)",
    slot2SopravviveBareDelete);

  // INSERT WITH CHECK: admin org1 NON può inserire una riga nell'org2
  check("X-ORG INSERT clienti: admin org1 NON inserisce cliente con organization_id=org2 (WITH CHECK)",
    await throwsAs(A, `INSERT INTO public.clienti (ragione_sociale, organization_id) VALUES ('Intruso', $1)`, [ORG2]) === true);
  check("X-ORG INSERT clienti: admin org1 INSERISCE nel proprio org (default=org1)",
    (await asUser(A, () => sp(() => c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('Legittimo Org1') RETURNING id`)))).ok === true);

  // ══════════════════ 2. ISOLAMENTO CROSS-ORG — FOGLIE via can_write_visita ══════════════════
  check("can_write_visita: admin org1 → FALSE su visita org2",
    (await scalarAs(A, `SELECT public.can_write_visita($1) v`, [V2])).v === false);
  check("can_write_visita: admin org1 → TRUE su visita org1",
    (await scalarAs(A, `SELECT public.can_write_visita($1) v`, [VT])).v === true);
  check("X-ORG risposte: admin org1 NON inserisce risposta su visita org2 (bug short-circuit chiuso)",
    await throwsAs(A, `INSERT INTO public.risposte (visita_id, domanda_id, sezione_id, valore) VALUES ($1,'D-01-002','SEZ-01','C')`, [V2]) === true);
  check("X-ORG risposte: admin org1 NON vede risposta org2", await rowsAs(A, `SELECT 1 FROM public.risposte WHERE id=$1`, [R2row]) === 0);
  check("X-ORG risposte: admin org1 NON aggiorna risposta org2", await rowsAs(A, `UPDATE public.risposte SET valore='NC' WHERE id=$1 RETURNING id`, [R2row]) === 0);
  check("X-ORG risposte: admin org1 NON elimina risposta org2", await rowsAs(A, `DELETE FROM public.risposte WHERE id=$1 RETURNING id`, [R2row]) === 0);
  check("INTRA-ORG risposte: admin org1 SCRIVE risposta su visita org1 (own_or_admin org-safe, INSERT...RETURNING)",
    (await asUser(A, () => sp(() => c.query(`INSERT INTO public.risposte (visita_id, domanda_id, sezione_id, valore) VALUES ($1,'D-01-003','SEZ-01','C') RETURNING id`, [VT])))).ok === true);

  // ══════════════════ 4. REGRESSIONE INTRA-ORG (permessi 025 invariati) ══════════════════
  check("REG visite: tecnico NON vede visita altrui (org1)", await rowsAs(T, `SELECT 1 FROM public.visite WHERE id=$1`, [VO1]) === 0);
  check("REG visite: tecnico vede la propria visita", await rowsAs(T, `SELECT 1 FROM public.visite WHERE id=$1`, [VT]) === 1);
  check("REG visite: planner LEGGE la visita del tecnico (supervisione)", await rowsAs(PL, `SELECT 1 FROM public.visite WHERE id=$1`, [VT]) === 1);
  check("REG visite: planner NON aggiorna la visita del tecnico (own_or_admin)",
    await rowsAs(PL, `UPDATE public.visite SET note_conclusive='x' WHERE id=$1 RETURNING id`, [VT]) === 0);
  check("REG risposte: tecnico scrive sulla propria visita (INSERT...RETURNING)", (await asUser(T, () => sp(() =>
    c.query(`INSERT INTO public.risposte (visita_id, domanda_id, sezione_id, valore) VALUES ($1,'D-01-004','SEZ-01','C') RETURNING id`, [VT])))).ok === true);
  check("REG anagrafica: admin INSERT clienti OK", (await asUser(A, () => sp(() =>
    c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('Reg Test Srl') RETURNING id`)))).ok === true);
  check("REG anagrafica: planner INSERT clienti OK", (await asUser(PL, () => sp(() =>
    c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('Reg Planner Srl') RETURNING id`)))).ok === true);
  // Flusso reale .insert().select() (RETURNING) su sedi e piani_visite: era il caso
  // rotto dall'helper org-aware self-lookup; deve passare col gate sulla colonna.
  const flow = await asUser(A, () => sp(async () => {
    const cli = (await c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('Flow Srl') RETURNING id`)).rows[0].id;
    const sede = (await c.query(`INSERT INTO public.sedi (cliente_id,nome,indirizzo,citta) VALUES ($1,'Flow Sede','Via F 1','Bari') RETURNING id`, [cli])).rows[0].id;
    const piano = (await c.query(`INSERT INTO public.piani_visite (sede_id,data_inizio_ciclo,visite_anno,modulo_id) VALUES ($1,CURRENT_DATE,2,$2) RETURNING id`, [sede, MOD])).rows[0].id;
    return { cli, sede, piano };
  }));
  check("REG flusso admin .insert().select(): clienti→sedi→piani_visite tutti con RETURNING", flow.ok,
    flow.ok ? "" : (flow.error?.code + " " + (flow.error?.message || "").slice(0, 60)));
  check("REG visite INSERT...RETURNING: tecnico crea la propria visita", (await asUser(T, () => sp(() =>
    c.query(`INSERT INTO public.visite (sede_id,cliente_id,specialist_id,modulo_id,template_snapshot,data_visita,stato)
             VALUES ($1,$2,$3,$4,'{}'::jsonb,CURRENT_DATE,'bozza') RETURNING id`, [S, C, T, MOD])))).ok === true);

  // ══════════════════ 5. TRIGGER MIRROR su organizzazione_membri ══════════════════
  // org2 ha ESATTAMENTE 1 admin attivo (creato sopra? no: rimosso). Ricrea 1 solo admin membership in org2.
  await asService(() => c.query(
    `INSERT INTO public.organizzazione_membri (organization_id, user_id, ruolo, stato) VALUES ($1,$2,'admin','attivo')
     ON CONFLICT (organization_id,user_id) DO UPDATE SET ruolo='admin', stato='attivo'`, [ORG2, O]));
  // anti-lockout per-org: sospendere l'unico admin di org2 → SC001 (anche da service role: nessuna esenzione)
  const lockSuspend = await asService(() => sp(() =>
    c.query(`UPDATE public.organizzazione_membri SET stato='sospeso' WHERE organization_id=$1 AND user_id=$2`, [ORG2, O])));
  check("MIRROR anti-lockout: sospendere l'ULTIMO admin di org2 → BLOCCATO (SC001, no esenzione service)",
    !lockSuspend.ok && lockSuspend.error?.code === "SC001", lockSuspend.error?.code ?? "ok?!");
  const lockDelete = await asService(() => sp(() =>
    c.query(`DELETE FROM public.organizzazione_membri WHERE organization_id=$1 AND user_id=$2`, [ORG2, O])));
  check("MIRROR anti-lockout: DELETE dell'ULTIMO admin di org2 → BLOCCATO (SC001)",
    !lockDelete.ok && lockDelete.error?.code === "SC001", lockDelete.error?.code ?? "ok?!");
  const lockDemote = await asService(() => sp(() =>
    c.query(`UPDATE public.organizzazione_membri SET ruolo='specialist' WHERE organization_id=$1 AND user_id=$2`, [ORG2, O])));
  check("MIRROR anti-lockout: retrocedere l'ULTIMO admin di org2 → BLOCCATO (SC001)",
    !lockDemote.ok && lockDemote.error?.code === "SC001", lockDemote.error?.code ?? "ok?!");

  // Per-org ISOLATION del lock: org1 ha 2 admin → sospenderne UNO è consentito (ne resta un altro NELLA STESSA org)
  const lockOrg1 = await asService(() => sp(() =>
    c.query(`UPDATE public.organizzazione_membri SET stato='sospeso' WHERE organization_id=$1 AND user_id=$2 RETURNING id`, [ORG1, A2])));
  check("MIRROR anti-lockout: org1 ha 2 admin → sospenderne UNO è CONSENTITO (conteggio PER-ORG)",
    lockOrg1.ok && lockOrg1.value.rowCount === 1);

  // anti-escalation: il service role (auth.uid NULL) allinea ruolo/stato → CONSENTITO (canale dual-write 19.B)
  const svcAlign = await asService(() => sp(() =>
    c.query(`UPDATE public.organizzazione_membri SET ruolo='planner' WHERE organization_id=$1 AND user_id=$2 RETURNING id`, [ORG1, T])));
  check("MIRROR anti-escalation: service role allinea membership.ruolo → CONSENTITO (esente, dual-write)",
    svcAlign.ok && svcAlign.value.rowCount === 1);

  // utenti triggers ancora presenti (mirror NON li ha rimossi)
  const utTrig = (await c.query(
    `SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='public.utenti'::regclass AND tgname IN ('trg_utenti_anti_escalation','trg_utenti_anti_lockout')`)).rows[0].n;
  check("MIRROR: i trigger su utenti (anti-escalation + anti-lockout) restano presenti", utTrig === 2, `trovati=${utTrig}`);
  check("REG utenti anti-escalation: tecnico tenta self-promote su utenti → ECCEZIONE",
    await throwsAs(T, `UPDATE public.utenti SET ruolo='admin' WHERE id=$1`, [T]) === true);

  // ══════════════════ 6. organizzazione_membri DENY-ALL (C) ══════════════════
  check("DENY-ALL: admin authenticated NON legge organizzazione_membri (0 righe)",
    await rowsAs(A, `SELECT 1 FROM public.organizzazione_membri LIMIT 1`) === 0);
  check("DENY-ALL: admin authenticated NON inserisce in organizzazione_membri",
    await throwsAs(A, `INSERT INTO public.organizzazione_membri (organization_id,user_id,ruolo,stato) VALUES ($1,$2,'admin','attivo')`, [ORG1, PL]) === true);
  check("DENY-ALL: admin authenticated NON aggiorna organizzazione_membri (0 righe)",
    await rowsAs(A, `UPDATE public.organizzazione_membri SET ruolo='admin' WHERE user_id=$1 RETURNING id`, [T]) === 0);
  check("DENY-ALL: service role (superuser) LEGGE organizzazione_membri (bypass, path dual-write intatto)",
    await asService(async () => (await c.query(`SELECT count(*)::int n FROM public.organizzazione_membri`)).rows[0].n) > 0);

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  console.log("ROLLBACK eseguito — nessuna modifica persistita.");
}
process.exit(fail === 0 ? 0 : 1);
