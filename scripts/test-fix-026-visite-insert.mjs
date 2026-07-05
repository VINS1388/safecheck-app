/**
 * Regressione del bug "tecnico non crea visite" (colma il gap del test 025, che
 * creava le visite da superuser e non esercitava mai un INSERT...RETURNING del
 * tecnico sotto RLS). La 025 è GIÀ in prod: qui si applica SOLO la 026 in
 * transazione e si verifica il flusso creaVisita del tecnico + Q4. BEGIN…ROLLBACK.
 *
 * Uso: node scripts/test-fix-026-visite-insert.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_026 = readFileSync(join(ROOT, "supabase", "migrations", "026_fix_visite_select_returning.sql"), "utf8");
function dbUrl(){for(const l of readFileSync(join(ROOT,".env.local"),"utf8").split(/\r?\n/)){const i=l.indexOf("=");if(i<0)continue;if(l.slice(0,i).trim()==="DATABASE_URL")return l.slice(i+1).trim().replace(/^["']|["']$/g,"");}throw new Error("no url");}
const u=new URL(dbUrl());
const c=new pg.Client({host:"aws-1-eu-central-1.pooler.supabase.com",port:5432,user:`postgres.${REF}`,password:decodeURIComponent(u.password),database:"postgres",ssl:{rejectUnauthorized:false},connectionTimeoutMillis:20000});
let pass=0,fail=0;
function ck(n,ok,x=""){console.log(`${ok?"✓":"✗"} ${n}${x?"  — "+x:""}`);if(ok)pass++;else fail++;}
async function asUser(uid,fn){await c.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({sub:uid,role:"authenticated"})}'`);await c.query(`SET LOCAL ROLE authenticated`);try{return await fn();}finally{await c.query(`RESET ROLE`);}}
async function sp(fn){await c.query("SAVEPOINT s");try{const r=await fn();await c.query("RELEASE SAVEPOINT s");return{ok:true,v:r};}catch(e){await c.query("ROLLBACK TO SAVEPOINT s");await c.query("RELEASE SAVEPOINT s");return{ok:false,e};}}
async function svc(fn){await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);await c.query(`RESET ROLE`);return fn();}
await c.connect();
try{
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);
  await c.query(SQL_026);   // 025 è già live in prod; qui solo il fix 026
  console.log("Migration 026 applicata in transazione (sopra la 025 live).\n");

  const T=(await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;
  const A=(await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
  const PL=(await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;
  const p=(await c.query(`SELECT pv.id piano_id, pv.sede_id, s.cliente_id, pv.ciclo_corrente FROM public.piani_visite pv JOIN public.sedi s ON s.id=pv.sede_id LIMIT 1`)).rows[0];
  const m=(await c.query(`SELECT id FROM public.template_master WHERE attivo=true ORDER BY versione DESC LIMIT 1`)).rows[0].id;
  // modulo_id ora OBBLIGATORIO (migration 029: DEFAULT rimosso). Sicurezza esplicito.
  const cols=`(cliente_id, sede_id, specialist_id, modulo_id, data_visita, stato, template_master_id, template_snapshot)`;
  const vals=`($1,$2,$3,'a0000000-0000-4000-8000-000000000001',CURRENT_DATE,'bozza',$4,'{}'::jsonb)`;
  const mk=(uid)=>asUser(uid,()=>sp(()=>c.query(`INSERT INTO public.visite ${cols} VALUES ${vals} RETURNING id`,[p.cliente_id,p.sede_id,uid,m])));

  // 1) IL BUG: tecnico crea la propria visita (INSERT...RETURNING)
  const ins=await mk(T);
  ck("tecnico: creaVisita (INSERT...RETURNING) CONSENTITO", ins.ok, ins.ok?"":ins.e.code+" "+ins.e.message);
  const vid=ins.ok?ins.v.rows[0].id:null;

  // 2) collegaSlot presa in carico su slot "Da assegnare" (flusso completo)
  if(vid){
    const slot=(await svc(async()=>(await c.query(`INSERT INTO public.visite_pianificate (piano_id,sede_id,numero_visita,ciclo_numero,data_suggerita,stato,tecnico_assegnato_id,tecnico_personalizzato) VALUES ($1,$2,971,$3,CURRENT_DATE,'da_pianificare',NULL,false) RETURNING id`,[p.piano_id,p.sede_id,p.ciclo_corrente])).rows[0].id));
    const linked=await asUser(T,async()=>(await c.query(`UPDATE public.visite_pianificate SET visita_id=$2,tecnico_assegnato_id=$3,tecnico_personalizzato=true WHERE id=$1 AND visita_id IS NULL AND tecnico_assegnato_id IS NULL AND stato<>'eseguita' RETURNING id`,[slot,vid,T])).rowCount);
    ck("tecnico: collegaSlot presa in carico slot Da assegnare", linked===1);
  }

  // 3) admin e planner leggono la visita del tecnico
  if(vid) ck("admin legge la visita del tecnico", (await asUser(A,async()=>(await c.query(`SELECT 1 FROM public.visite WHERE id=$1`,[vid])).rowCount))===1);
  if(vid) ck("planner legge la visita del tecnico", (await asUser(PL,async()=>(await c.query(`SELECT 1 FROM public.visite WHERE id=$1`,[vid])).rowCount))===1);

  // 4) admin e planner creano visite (INSERT...RETURNING) senza problemi
  ck("admin: creaVisita CONSENTITO", (await mk(A)).ok);
  ck("planner: creaVisita CONSENTITO", (await mk(PL)).ok);

  // 5) Q4: tecnico disattivato non crea e non vede
  await svc(()=>c.query(`UPDATE public.utenti SET attivo=false WHERE id=$1`,[T]));
  ck("Q4: tecnico DISATTIVATO NON crea visite (RETURNING negato)", !(await mk(T)).ok);
  if(vid) ck("Q4: tecnico DISATTIVATO non vede la propria visita", (await asUser(T,async()=>(await c.query(`SELECT 1 FROM public.visite WHERE id=$1`,[vid])).rowCount))===0);
  await svc(()=>c.query(`UPDATE public.utenti SET attivo=true WHERE id=$1`,[T]));

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
}finally{await c.query("ROLLBACK").catch(()=>{});await c.end();console.log("ROLLBACK — nessuna modifica persistita.");}
process.exit(fail===0?0:1);
