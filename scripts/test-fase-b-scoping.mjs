/**
 * Fase B — scoping per ruolo delle query filtrate (Visite e Pianificazione).
 * Pattern asUser: SET ROLE authenticated con jwt.sub reale, MAI superuser. Il
 * "ground truth" è calcolato via service role; l'atteso RLS è confrontato a
 * insiemi. BEGIN…ROLLBACK, nessuna scrittura persistita.
 *
 * Verifica:
 *  - Visite: il tecnico vede ESATTAMENTE le proprie ∪ quelle di slot a lui
 *    assegnati; admin/planner vedono tutto. Il filtro (stato) narrowa dentro lo scope.
 *  - Criticità: la query NC (risposte.valore='NC') è RLS-scopata (⊆ visibili).
 *  - Pianificazione: il tecnico vede ESATTAMENTE gli slot suoi ∪ "Da assegnare"
 *    ∪ collegati a una sua visita; admin/planner tutto.
 *
 * Uso: node scripts/test-fase-b-scoping.mjs
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
  const totVisite=ids(await c.query(`SELECT id FROM public.visite`));
  const own=ids(await c.query(`SELECT id FROM public.visite WHERE specialist_id=$1`,[T]));
  const slotLinked=ids(await c.query(`SELECT visita_id FROM public.visite_pianificate WHERE tecnico_assegnato_id=$1 AND visita_id IS NOT NULL`,[T]));
  const expectedVisiteT=[...new Set([...own,...slotLinked])];

  // ── VISITE scoping ──
  const visT=await asUser(T,async()=>ids(await c.query(`SELECT id FROM public.visite`)));
  ck("Visite: tecnico vede ESATTAMENTE proprie ∪ slot-assegnati", setEq(visT,expectedVisiteT), `tec=${visT.length} atteso=${expectedVisiteT.length}`);
  const visA=await asUser(A,async()=>ids(await c.query(`SELECT id FROM public.visite`)));
  ck("Visite: admin vede TUTTE", setEq(visA,totVisite), `admin=${visA.length} tot=${totVisite.length}`);
  const visP=await asUser(PL,async()=>ids(await c.query(`SELECT id FROM public.visite`)));
  ck("Visite: planner vede TUTTE", setEq(visP,totVisite), `planner=${visP.length} tot=${totVisite.length}`);

  // filtro stato=bozza (numero_verbale IS NULL) dentro lo scope del tecnico
  const bozzeT=await asUser(T,async()=>ids(await c.query(`SELECT id FROM public.visite WHERE numero_verbale IS NULL`)));
  ck("Visite: filtro stato=bozza narrowa DENTRO lo scope tecnico", subset(bozzeT,expectedVisiteT));

  // ── CRITICITÀ (NC) RLS-scopata ──
  const ncT=await asUser(T,async()=>ids(await c.query(`SELECT DISTINCT visita_id FROM public.risposte WHERE valore='NC'`)));
  ck("Criticità: query NC del tecnico ⊆ visite visibili (RLS)", subset(ncT,expectedVisiteT), `ncVisite=${ncT.length}`);

  // ── PIANIFICAZIONE scoping ──
  const totSlot=ids(await c.query(`SELECT id FROM public.visite_pianificate`));
  // atteso tecnico (mirror vp_select_scope): assegnato self ∪ "Da assegnare" ∪ collegato a visita leggibile
  const expectedSlotT=ids(await c.query(
    `SELECT id FROM public.visite_pianificate
     WHERE tecnico_assegnato_id=$1 OR tecnico_assegnato_id IS NULL
        OR visita_id = ANY($2::uuid[])`,[T, expectedVisiteT]));
  const slotT=await asUser(T,async()=>ids(await c.query(`SELECT id FROM public.visite_pianificate`)));
  ck("Pianificazione: tecnico vede ESATTAMENTE suoi ∪ da-assegnare ∪ collegati a sua visita", setEq(slotT,expectedSlotT), `tec=${slotT.length} atteso=${expectedSlotT.length}`);
  const slotA=await asUser(A,async()=>ids(await c.query(`SELECT id FROM public.visite_pianificate`)));
  ck("Pianificazione: admin vede TUTTI gli slot", setEq(slotA,totSlot), `admin=${slotA.length} tot=${totSlot.length}`);
  const slotP=await asUser(PL,async()=>ids(await c.query(`SELECT id FROM public.visite_pianificate`)));
  ck("Pianificazione: planner vede TUTTI gli slot", setEq(slotP,totSlot), `planner=${slotP.length} tot=${totSlot.length}`);

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
}finally{await c.query("ROLLBACK").catch(()=>{});await c.end();console.log("ROLLBACK — nessuna modifica persistita.");}
process.exit(fail===0?0:1);
