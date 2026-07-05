/**
 * Fase C — dashboard per ruolo. Le funzioni di dashboard.ts usano la sessione
 * Next (non esercitabile qui): si verificano le QUERY sottostanti con asUser
 * (SET ROLE authenticated, mai superuser), replicando gli aggregati per ruolo e
 * confrontandoli col ground truth (service role). BEGIN…ROLLBACK.
 *
 * Verifica:
 *  - Tecnico: bozze/chiuse/slot-disponibili sono RLS-scopate alle proprie; non
 *    vede bozze né slot-candidati altrui.
 *  - Admin/planner: bozze aperte, slot scoperti, slot totali = ground truth.
 *  - KPI: visite chiuse e NC rilevate coincidono admin↔service role.
 *
 * Uso: node scripts/test-fase-c-dashboard.mjs
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
const rows=(r)=>r.rows;
const idset=(r)=>new Set(r.rows.map(x=>x.id ?? x.visita_id));
const n=(r)=>Number(r.rows[0].n);

await c.connect();
try{
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);

  const T=(await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;
  const A=(await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
  const PL=(await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;

  // Ground truth (service role)
  const totBozze=n(await c.query(`SELECT count(*)::int n FROM public.visite WHERE numero_verbale IS NULL`));
  const ownBozze=idset(await c.query(`SELECT id FROM public.visite WHERE numero_verbale IS NULL AND specialist_id=$1`,[T]));
  const totScoperti=n(await c.query(`SELECT count(*)::int n FROM public.visite_pianificate WHERE tecnico_assegnato_id IS NULL AND stato<>'eseguita'`));
  const totSlot=n(await c.query(`SELECT count(*)::int n FROM public.visite_pianificate`));

  // ── TECNICO: bozze RLS-scopate ──
  const bozzeT=idset(await asUser(T,async()=>await c.query(`SELECT id FROM public.visite WHERE numero_verbale IS NULL`)));
  ck("Tecnico: 'Da completare' = ESATTAMENTE le proprie bozze", bozzeT.size===ownBozze.size && [...bozzeT].every(x=>ownBozze.has(x)), `tec=${bozzeT.size} own=${ownBozze.size}`);
  ck("Tecnico: non vede bozze altrui (tec ≤ totale)", bozzeT.size<=totBozze);

  // ── TECNICO: chiuse RLS-scopate (⊆ proprie ∪ slot-collegate) ──
  // can_read_visita consente anche le visite collegate a uno slot assegnato al
  // tecnico (non solo specialist_id=self): l'atteso è l'unione raggiungibile.
  const ownAll=new Set((await c.query(`SELECT id FROM public.visite WHERE specialist_id=$1`,[T])).rows.map(r=>r.id));
  for(const r of (await c.query(`SELECT visita_id FROM public.visite_pianificate WHERE tecnico_assegnato_id=$1 AND visita_id IS NOT NULL`,[T])).rows) ownAll.add(r.visita_id);
  const chiuseT=idset(await asUser(T,async()=>await c.query(`SELECT id FROM public.visite WHERE stato_verbale='chiuso'`)));
  ck("Tecnico: 'Chiuse di recente' ⊆ proprie ∪ slot-collegate (accessibili)", [...chiuseT].every(x=>ownAll.has(x)), `chiuse=${chiuseT.size}`);

  // ── TECNICO: slot disponibili — nessun candidato altrui ──
  const candT=rows(await asUser(T,async()=>await c.query(`SELECT id, tecnico_assegnato_id FROM public.visite_pianificate WHERE visita_id IS NULL AND stato IN ('da_pianificare','pianificata')`)));
  ck("Tecnico: slot-candidati visibili solo suoi o 'Da assegnare'", candT.every(s=>s.tecnico_assegnato_id===T || s.tecnico_assegnato_id===null));
  // slot candidato assegnato ad ALTRO tecnico → invisibile al tecnico
  const altrui=(await c.query(`SELECT id FROM public.visite_pianificate WHERE visita_id IS NULL AND tecnico_assegnato_id IS NOT NULL AND tecnico_assegnato_id<>$1 LIMIT 1`,[T])).rows[0];
  if(altrui){
    const vede=n(await asUser(T,async()=>await c.query(`SELECT count(*)::int n FROM public.visite_pianificate WHERE id=$1`,[altrui.id])));
    ck("Tecnico: slot-candidato di ALTRO tecnico è invisibile", vede===0);
  } else {
    console.log("· (nessuno slot-candidato altrui in prod: check saltato)");
  }

  // ── ADMIN/PLANNER: aggregati = ground truth ──
  const bozzeA=n(await asUser(A,async()=>await c.query(`SELECT count(*)::int n FROM public.visite WHERE numero_verbale IS NULL`)));
  ck("Admin: 'Bozze aperte' = tutte le bozze", bozzeA===totBozze, `admin=${bozzeA} tot=${totBozze}`);
  const bozzeP=n(await asUser(PL,async()=>await c.query(`SELECT count(*)::int n FROM public.visite WHERE numero_verbale IS NULL`)));
  ck("Planner: 'Bozze vecchie' base = tutte le bozze", bozzeP===totBozze, `planner=${bozzeP} tot=${totBozze}`);
  const scopertiA=n(await asUser(A,async()=>await c.query(`SELECT count(*)::int n FROM public.visite_pianificate WHERE tecnico_assegnato_id IS NULL AND stato<>'eseguita'`)));
  ck("Admin: 'Slot scoperti' = tutti i da-assegnare", scopertiA===totScoperti, `admin=${scopertiA} tot=${totScoperti}`);
  const slotP=n(await asUser(PL,async()=>await c.query(`SELECT count(*)::int n FROM public.visite_pianificate`)));
  ck("Planner: vede tutti gli slot (carico/copertura completi)", slotP===totSlot, `planner=${slotP} tot=${totSlot}`);

  // ── KPI: visite chiuse + NC rilevate (all-time) admin ↔ service role ──
  const chiuseAll=idset(await c.query(`SELECT id FROM public.visite WHERE stato_verbale='chiuso'`));
  const chiuseAllA=idset(await asUser(A,async()=>await c.query(`SELECT id FROM public.visite WHERE stato_verbale='chiuso'`)));
  ck("KPI admin: 'Visite chiuse' = ground truth", chiuseAllA.size===chiuseAll.size, `admin=${chiuseAllA.size} tot=${chiuseAll.size}`);

  const ids=[...chiuseAll];
  const ncStd=ids.length?n(await c.query(`SELECT count(*)::int n FROM public.risposte WHERE valore='NC' AND visita_id = ANY($1::uuid[])`,[ids])):0;
  const ncImp=ids.length?n(await c.query(`SELECT count(*)::int n FROM public.risposte_imprese_appalto ria JOIN public.imprese_appalto ia ON ia.id=ria.impresa_id WHERE ria.esito='NC' AND ia.visita_id = ANY($1::uuid[])`,[ids])):0;
  const ncSvc=ncStd+ncImp;
  const idsA=[...chiuseAllA];
  const ncStdA=idsA.length?n(await asUser(A,async()=>await c.query(`SELECT count(*)::int n FROM public.risposte WHERE valore='NC' AND visita_id = ANY($1::uuid[])`,[idsA]))):0;
  const ncImpA=idsA.length?n(await asUser(A,async()=>await c.query(`SELECT count(*)::int n FROM public.risposte_imprese_appalto ria JOIN public.imprese_appalto ia ON ia.id=ria.impresa_id WHERE ria.esito='NC' AND ia.visita_id = ANY($1::uuid[])`,[idsA]))):0;
  ck("KPI admin: 'NC rilevate' (std+impresa) = ground truth", ncStdA+ncImpA===ncSvc, `admin=${ncStdA+ncImpA} svc=${ncSvc}`);

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
}finally{await c.query("ROLLBACK").catch(()=>{});await c.end();console.log("ROLLBACK — nessuna modifica persistita.");}
process.exit(fail===0?0:1);
