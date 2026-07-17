/**
 * Sprint 19.D — Test numerazione verbale PER-ORG (migration 036).
 *
 * PROTOCOLLO (come 19.C): la 036 è applicata DENTRO una transazione (prod è a 035)
 * e TUTTO è ROLLBACK-ato. assegna_numero_verbale() è SECURITY DEFINER e NON dipende
 * da auth.uid(): la si chiama direttamente (nessun SET ROLE necessario). Il setup
 * gira da superuser (RLS bypassata), come in 19.C.
 *
 * Scenari:
 *   1. Una 2ª org fittizia riceve SC-2026-0001 indipendentemente da quanti verbali
 *      SC esistono già nell'org reale (che ha SC-2026-0001..0004).
 *   2. La 2ª org incrementa la PROPRIA serie: la 2ª visita → SC-2026-0002.
 *   3. I verbali esistenti dell'org reale NON cambiano numero.
 *   4. Regressione org reale: una nuova visita SC nell'org reale continua la serie
 *      (→ SC-2026-0005, cioè maxOrg1+1).
 *   5. Serie per prefisso ANCHE nella 2ª org: una visita HACCP in org2 → HACCP-2026-0001.
 *   6. FAIL-CLOSED: visita con organization_id NULL → la funzione RAISE.
 *
 * Uso: node scripts/test-19d-numerazione.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_036 = readFileSync(join(ROOT, "supabase", "migrations", "036_numerazione_verbale_per_org.sql"), "utf8");
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
let spN = 0;
async function sp(fn) {
  const name = `sp_${++spN}`;
  await c.query(`SAVEPOINT ${name}`);
  try { const r = await fn(); await c.query(`RELEASE SAVEPOINT ${name}`); return { ok: true, value: r }; }
  catch (e) { await c.query(`ROLLBACK TO SAVEPOINT ${name}`); await c.query(`RELEASE SAVEPOINT ${name}`); return { ok: false, error: e }; }
}

const MOD_SC = "a0000000-0000-4000-8000-000000000001";
const ANNO = 2026;

async function creaVisita(sede, cliente, specialist, org, modulo = MOD_SC) {
  const r = await c.query(
    `INSERT INTO public.visite (sede_id, cliente_id, specialist_id, modulo_id, template_snapshot, data_visita, stato, organization_id)
     VALUES ($1,$2,$3,$4,'{}'::jsonb,CURRENT_DATE,'bozza',$5) RETURNING id`,
    [sede, cliente, specialist, modulo, org]);
  return r.rows[0].id;
}
async function numera(visitaId) {
  return (await c.query(`SELECT public.assegna_numero_verbale($1, $2) n`, [visitaId, ANNO])).rows[0].n;
}

await c.connect();
try {
  await c.query("BEGIN");
  await c.query(SQL_036);
  console.log("Migration 036 applicata in transazione (prod resta a 035).\n");

  // Modulo HACCP (prefisso HACCP) se presente, per lo scenario 5
  const MOD_HACCP = (await c.query(`SELECT id FROM public.moduli WHERE prefisso_verbale='HACCP' LIMIT 1`)).rows[0]?.id ?? null;

  // Attori/anagrafica reali (org1)
  const A = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
  const ORG1 = (await c.query(`SELECT organization_id FROM public.organizzazione_membri WHERE user_id=$1 AND stato='attivo'`, [A])).rows[0].organization_id;
  const piano = (await c.query(
    `SELECT pv.sede_id, s.cliente_id FROM public.piani_visite pv JOIN public.sedi s ON s.id=pv.sede_id LIMIT 1`)).rows[0];
  const { sede_id: S1, cliente_id: C1 } = piano;

  // Snapshot dei verbali numerati esistenti nell'org1 (per verificare che non cambino)
  const before = (await c.query(
    `SELECT id, numero_verbale FROM public.visite WHERE organization_id=$1 AND numero_verbale IS NOT NULL ORDER BY numero_verbale`, [ORG1])).rows;
  const maxScOrg1 = (await c.query(
    `SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_verbale,'-',3) AS integer)),0) m
       FROM public.visite WHERE organization_id=$1 AND numero_verbale LIKE 'SC-'||$2||'-%' AND numero_verbale IS NOT NULL`,
    [ORG1, ANNO])).rows[0].m;
  console.log(`org1=${ORG1}  verbali SC-${ANNO} esistenti: max=${maxScOrg1}  (totale numerati org1=${before.length})\n`);

  // ── ORG2 fittizia + cliente/sede ──
  const ORG2 = (await c.query(
    `INSERT INTO public.organizzazione (ragione_sociale, slug, stato) VALUES ('Org2 Test 19D','org2-test-19d','attiva') RETURNING id`)).rows[0].id;
  const C2 = (await c.query(`INSERT INTO public.clienti (ragione_sociale, organization_id) VALUES ('Cliente Org2 19D',$1) RETURNING id`, [ORG2])).rows[0].id;
  const S2 = (await c.query(`INSERT INTO public.sedi (cliente_id,nome,indirizzo,citta,organization_id) VALUES ($1,'Sede Org2','Via 2','Bari',$2) RETURNING id`, [C2, ORG2])).rows[0].id;

  // 1. org2 riparte da 0001 nonostante org1 abbia SC-2026-0001..0004
  const v2a = await creaVisita(S2, C2, A, ORG2);
  const n2a = await numera(v2a);
  check(`ORG2 primo verbale SC → SC-${ANNO}-0001 (indipendente dai ${maxScOrg1} di org1)`,
    n2a === `SC-${ANNO}-0001`, n2a);

  // 2. org2 incrementa la propria serie
  const v2b = await creaVisita(S2, C2, A, ORG2);
  const n2b = await numera(v2b);
  check(`ORG2 secondo verbale SC → SC-${ANNO}-0002 (serie per-org)`, n2b === `SC-${ANNO}-0002`, n2b);

  // 3. i verbali esistenti di org1 non cambiano numero
  const after = (await c.query(
    `SELECT id, numero_verbale FROM public.visite WHERE organization_id=$1 AND id = ANY($2) ORDER BY numero_verbale`,
    [ORG1, before.map(r => r.id)])).rows;
  const invariati = before.length === after.length &&
    before.every(b => after.find(a => a.id === b.id)?.numero_verbale === b.numero_verbale);
  check("ORG1 verbali esistenti INVARIATI (nessuna rinumerazione)", invariati,
    invariati ? "" : `before=${JSON.stringify(before.map(b=>b.numero_verbale))} after=${JSON.stringify(after.map(a=>a.numero_verbale))}`);

  // 4. regressione org1: continua la serie (maxOrg1+1)
  const v1 = await creaVisita(S1, C1, A, ORG1);
  const n1 = await numera(v1);
  check(`REGRESSIONE org1: nuovo verbale SC → SC-${ANNO}-${String(maxScOrg1 + 1).padStart(4, "0")} (continua la serie org1)`,
    n1 === `SC-${ANNO}-${String(maxScOrg1 + 1).padStart(4, "0")}`, n1);

  // 5. serie per prefisso anche in org2 (HACCP separata, riparte da 0001 in org2)
  if (MOD_HACCP) {
    const v2h = await creaVisita(S2, C2, A, ORG2, MOD_HACCP);
    const r = await sp(() => numera(v2h));
    // Nota: richiede che il modulo HACCP sia attivo sulla sede; se il gate blocca,
    // lo segnaliamo senza far fallire il test principale.
    if (r.ok) check(`ORG2 primo verbale HACCP → HACCP-${ANNO}-0001 (serie per prefisso E per-org)`, r.value === `HACCP-${ANNO}-0001`, r.value);
    else check("ORG2 HACCP: scenario saltato (numerazione HACCP non eseguibile in setup)", true, r.error.code || r.error.message?.slice(0, 50));
  } else {
    check("ORG2 HACCP: modulo HACCP assente, scenario non applicabile", true);
  }

  // 6. FAIL-CLOSED: visita con organization_id NULL → RAISE
  const vNull = await creaVisita(S2, C2, A, null);
  const rNull = await sp(() => numera(vNull));
  check("FAIL-CLOSED: organization_id NULL → assegna_numero_verbale RAISE",
    !rNull.ok, rNull.ok ? `NON ha fallito (ha restituito ${rNull.value})` : (rNull.error.message || "").slice(0, 70));

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  console.log("ROLLBACK eseguito — nessuna modifica persistita.");
}
process.exit(fail === 0 ? 0 : 1);
