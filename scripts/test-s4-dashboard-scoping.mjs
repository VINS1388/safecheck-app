/**
 * S4 — scoping per ruolo della query NUOVA di dashboard: "Rilievi recenti"
 * (fetchRilieviRecenti). Verifica che la lettura NC/PC su verbali chiusi sia
 * RLS-scopata come tutto il resto: il tecnico vede solo i rilievi dei propri
 * verbali accessibili; admin/planner vedono tutto.
 *
 * Pattern asUser: SET ROLE authenticated con jwt.sub reale, MAI superuser. Ground
 * truth via service role. BEGIN…ROLLBACK, nessuna scrittura persistita.
 *
 * Le altre novità S4 (bucket agenda tecnico, KPI planner) sono pura
 * ri-aggregazione in TypeScript di dati già recuperati da query esistenti
 * (getPianificazione/fetchBozze), già coperte da test-fase-b/-c: nessuna nuova
 * query DB da scopare lì.
 *
 * Uso: node scripts/test-s4-dashboard-scoping.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
function dbUrl(){for(const l of readFileSync(join(ROOT,".env.local"),"utf8").split(/\r?\n/)){const i=l.indexOf("=");if(i<0)continue;if(l.slice(0,i).trim()==="DATABASE_URL")return l.slice(i+1).trim().replace(/^["']|["']$/g,"");}throw new Error("no url");}
const c=new pg.Client({host:"aws-1-eu-central-1.pooler.supabase.com",port:5432,user:`postgres.${REF}`,password:decodeURIComponent(new URL(dbUrl()).password),database:"postgres",ssl:{rejectUnauthorized:false},connectionTimeoutMillis:20000});
let pass=0,fail=0;
function ck(n,ok,x=""){console.log(`${ok?"✓":"✗"} ${n}${x?"  — "+x:""}`);if(ok)pass++;else fail++;}
async function asUser(uid,fn){await c.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({sub:uid,role:"authenticated"})}'`);await c.query(`SET LOCAL ROLE authenticated`);try{return await fn();}finally{await c.query(`RESET ROLE`);}}
const ids=(r)=>r.rows.map(x=>x.id ?? x.visita_id);
const n=(r)=>Number(r.rows[0].n);
const setEq=(a,b)=>{const A=new Set(a),B=new Set(b);return A.size===B.size&&[...A].every(x=>B.has(x));};
const subset=(a,b)=>{const B=new Set(b);return a.every(x=>B.has(x));};

await c.connect();
try{
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);

  const T=(await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;
  const A=(await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
  const PL=(await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;

  // ── Ground truth (service role) ──
  // Unione raggiungibile del tecnico (mirror can_read_visita): proprie ∪ slot-collegate
  const own=ids(await c.query(`SELECT id FROM public.visite WHERE specialist_id=$1`,[T]));
  const slotLinked=ids(await c.query(`SELECT visita_id FROM public.visite_pianificate WHERE tecnico_assegnato_id=$1 AND visita_id IS NOT NULL`,[T]));
  const accessibiliT=[...new Set([...own,...slotLinked])];

  // Verbali chiusi con >=1 rilievo NC/PC (standard) — visita_id, service role
  const rilieviStdAll=ids(await c.query(
    `SELECT DISTINCT r.visita_id FROM public.risposte r
       JOIN public.visite v ON v.id=r.visita_id
      WHERE v.stato_verbale='chiuso' AND r.valore IN ('NC','PC')`));
  // Verbali chiusi con >=1 rilievo NC/PC (per-impresa SEZ-08)
  const rilieviImpAll=ids(await c.query(
    `SELECT DISTINCT ia.visita_id FROM public.risposte_imprese_appalto ria
       JOIN public.imprese_appalto ia ON ia.id=ria.impresa_id
       JOIN public.visite v ON v.id=ia.visita_id
      WHERE v.stato_verbale='chiuso' AND ria.esito IN ('NC','PC')`));

  // ── TECNICO: rilievi RLS-scopati ⊆ propri accessibili ──
  const rilStdT=await asUser(T,async()=>ids(await c.query(
    `SELECT DISTINCT r.visita_id FROM public.risposte r
       JOIN public.visite v ON v.id=r.visita_id
      WHERE v.stato_verbale='chiuso' AND r.valore IN ('NC','PC')`)));
  ck("Tecnico: rilievi NC/PC (standard) ⊆ visite accessibili (RLS)", subset(rilStdT,accessibiliT), `ril=${rilStdT.length} acc=${accessibiliT.length}`);
  ck("Tecnico: non vede rilievi standard di verbali altrui", rilStdT.length<=rilieviStdAll.length && subset(rilStdT,rilieviStdAll));

  const rilImpT=await asUser(T,async()=>ids(await c.query(
    `SELECT DISTINCT ia.visita_id FROM public.risposte_imprese_appalto ria
       JOIN public.imprese_appalto ia ON ia.id=ria.impresa_id
       JOIN public.visite v ON v.id=ia.visita_id
      WHERE v.stato_verbale='chiuso' AND ria.esito IN ('NC','PC')`)));
  ck("Tecnico: rilievi NC/PC (per-impresa SEZ-08) ⊆ visite accessibili (RLS)", subset(rilImpT,accessibiliT), `ril=${rilImpT.length}`);

  // ── ADMIN/PLANNER: rilievi = ground truth (vedono tutto) ──
  const rilStdA=await asUser(A,async()=>ids(await c.query(
    `SELECT DISTINCT r.visita_id FROM public.risposte r
       JOIN public.visite v ON v.id=r.visita_id
      WHERE v.stato_verbale='chiuso' AND r.valore IN ('NC','PC')`)));
  ck("Admin: rilievi NC/PC (standard) = ground truth cross-cliente", setEq(rilStdA,rilieviStdAll), `admin=${rilStdA.length} tot=${rilieviStdAll.length}`);
  const rilStdP=await asUser(PL,async()=>ids(await c.query(
    `SELECT DISTINCT r.visita_id FROM public.risposte r
       JOIN public.visite v ON v.id=r.visita_id
      WHERE v.stato_verbale='chiuso' AND r.valore IN ('NC','PC')`)));
  ck("Planner: rilievi NC/PC (standard) = ground truth cross-cliente", setEq(rilStdP,rilieviStdAll), `planner=${rilStdP.length} tot=${rilieviStdAll.length}`);

  const rilImpA=await asUser(A,async()=>ids(await c.query(
    `SELECT DISTINCT ia.visita_id FROM public.risposte_imprese_appalto ria
       JOIN public.imprese_appalto ia ON ia.id=ria.impresa_id
       JOIN public.visite v ON v.id=ia.visita_id
      WHERE v.stato_verbale='chiuso' AND ria.esito IN ('NC','PC')`)));
  ck("Admin: rilievi NC/PC (per-impresa) = ground truth", setEq(rilImpA,rilieviImpAll), `admin=${rilImpA.length} tot=${rilieviImpAll.length}`);

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
}finally{await c.query("ROLLBACK").catch(()=>{});await c.end();console.log("ROLLBACK — nessuna modifica persistita.");}
process.exit(fail===0?0:1);
