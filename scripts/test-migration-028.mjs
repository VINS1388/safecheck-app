/**
 * Test migration 028 (fondazione modulare) — 028 GIÀ LIVE in prod.
 * Protocollo standard: BEGIN…ROLLBACK, SET ROLE authenticated (mai superuser),
 * asUser(ruolo reale), INSERT/UPDATE...RETURNING per ogni ruolo su moduli_sede.
 *
 * Copertura:
 *  - RLS moduli (SELECT per i 3 ruoli attivi).
 *  - RLS moduli_sede: SELECT scopato (tecnico ⊆ sedi raggiungibili); INSERT/UPDATE
 *    RETURNING admin+planner OK, tecnico NEGATO; DELETE admin OK, planner/tecnico NEGATO.
 *  - UNIQUE(sede_id,modulo_id) su piani_visite.
 *  - Numerazione: serie SC prosegue (no gap/dup) + serie HACCP separata (0001).
 *  - clona_visita copia modulo_id (Duplica/Sostitutivo intatti).
 *
 * Uso: node scripts/test-migration-028.mjs
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
// RESET ROLE ingoiato: su tx abortita darebbe 25P02 mascherando l'errore reale;
// il ripristino del ruolo è comunque garantito dal ROLLBACK TO SAVEPOINT di sp().
async function asUser(uid,fn){await c.query(`SET LOCAL request.jwt.claims='${JSON.stringify({sub:uid,role:"authenticated"})}'`);await c.query(`SET LOCAL ROLE authenticated`);try{return await fn();}finally{try{await c.query(`RESET ROLE`);}catch{}}}
async function svc(fn){await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);await c.query(`RESET ROLE`);return fn();}
// sp: isola una prova in un savepoint e la ANNULLA SEMPRE (così prove successive
// non ereditano scritture, es. una UNIQUE spuria tra insert dello stesso valore).
async function sp(fn){await c.query("SAVEPOINT s");let r;try{r={ok:true,v:await fn()};}catch(e){r={ok:false,e};}await c.query("ROLLBACK TO SAVEPOINT s");await c.query("RELEASE SAVEPOINT s");return r;}
const n=(r)=>Number(r.rows[0].n);
const SIC="a0000000-0000-4000-8000-000000000001";
const HAC="a0000000-0000-4000-8000-000000000002";

await c.connect();
try{
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);

  const T=(await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;
  const A=(await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
  const PL=(await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;

  // ── RLS moduli: SELECT per i 3 ruoli ──
  for(const [nome,uid] of [["admin",A],["planner",PL],["tecnico",T]]){
    const v=n(await asUser(uid,async()=>await c.query(`SELECT count(*)::int n FROM public.moduli`)));
    ck(`moduli SELECT: ${nome} legge il catalogo (4)`, v===4, `n=${v}`);
  }

  // ── RLS moduli_sede: SELECT scopato ──
  const totMS=n(await c.query(`SELECT count(*)::int n FROM public.moduli_sede`));
  const msA=n(await asUser(A,async()=>await c.query(`SELECT count(*)::int n FROM public.moduli_sede`)));
  ck("moduli_sede SELECT: admin vede tutto", msA===totMS, `admin=${msA} tot=${totMS}`);
  // tecnico: solo sedi raggiungibili
  const sediT=new Set((await c.query(`SELECT sede_id FROM public.visite WHERE specialist_id=$1`,[T])).rows.map(r=>r.sede_id));
  for(const r of (await c.query(`SELECT sede_id FROM public.visite_pianificate WHERE tecnico_assegnato_id=$1 AND sede_id IS NOT NULL`,[T])).rows) sediT.add(r.sede_id);
  const msT=(await asUser(T,async()=>await c.query(`SELECT sede_id FROM public.moduli_sede`))).rows.map(r=>r.sede_id);
  ck("moduli_sede SELECT: tecnico vede solo sedi raggiungibili", msT.every(s=>sediT.has(s)), `tec=${msT.length}`);

  // sede su cui operare (una qualsiasi) e sede senza il modulo HACCP
  const sede=(await c.query(`SELECT id FROM public.sedi LIMIT 1`)).rows[0].id;

  // ── moduli_sede INSERT...RETURNING per ruolo (attivazione HACCP su una sede) ──
  const insHac=(uid)=>sp(()=>asUser(uid,()=>c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true) RETURNING id`,[sede,HAC])));
  const iA=await insHac(A); ck("moduli_sede INSERT...RETURNING: admin CONSENTITO", iA.ok && iA.v.rows[0]?.id, iA.ok?"":iA.e.code);
  const iP=await insHac(PL); ck("moduli_sede INSERT...RETURNING: planner CONSENTITO", iP.ok && iP.v.rows[0]?.id, iP.ok?"":iP.e.code);
  const iT=await insHac(T); ck("moduli_sede INSERT: tecnico NEGATO", !iT.ok, iT.ok?"consentito!":iT.e.code);

  // ── moduli_sede UPDATE...RETURNING per ruolo (toggle attivo su riga sicurezza esistente) ──
  const msRow=(await c.query(`SELECT id FROM public.moduli_sede WHERE sede_id=$1 AND modulo_id=$2`,[sede,SIC])).rows[0].id;
  const updRow=(uid)=>sp(()=>asUser(uid,()=>c.query(`UPDATE public.moduli_sede SET attivo=false WHERE id=$1 RETURNING id`,[msRow])));
  const uA=await updRow(A); ck("moduli_sede UPDATE...RETURNING: admin CONSENTITO", uA.ok && uA.v.rowCount===1, uA.ok?"":uA.e.code);
  const uP=await updRow(PL); ck("moduli_sede UPDATE...RETURNING: planner CONSENTITO", uP.ok && uP.v.rowCount===1, uP.ok?"":uP.e.code);
  const uT=await updRow(T); ck("moduli_sede UPDATE: tecnico NEGATO", !uT.ok || uT.v.rowCount===0, "");

  // ── moduli_sede DELETE per ruolo (solo admin) ──
  const delRow=(uid)=>sp(()=>asUser(uid,()=>c.query(`DELETE FROM public.moduli_sede WHERE id=$1 RETURNING id`,[msRow])));
  const dP=await delRow(PL); ck("moduli_sede DELETE: planner NEGATO", !dP.ok || dP.v.rowCount===0, "");
  const dT=await delRow(T); ck("moduli_sede DELETE: tecnico NEGATO", !dT.ok || dT.v.rowCount===0, "");
  const dA=await delRow(A); ck("moduli_sede DELETE: admin CONSENTITO", dA.ok && dA.v.rowCount===1, dA.ok?"":dA.e.code);

  // ── UNIQUE(sede_id,modulo_id) su piani_visite ──
  const piano=(await c.query(`SELECT sede_id, modulo_id FROM public.piani_visite LIMIT 1`)).rows[0];
  const dupPiano=await svc(()=>sp(()=>c.query(`INSERT INTO public.piani_visite (sede_id,data_inizio_ciclo,visite_anno,modulo_id) VALUES ($1,CURRENT_DATE,4,$2)`,[piano.sede_id,piano.modulo_id])));
  ck("piani_visite: doppio (sede,modulo) → UNIQUE violata (23505)", !dupPiano.ok && dupPiano.e.code==="23505", dupPiano.ok?"consentito!":dupPiano.e.code);

  // ── Numerazione: serie SC prosegue + serie HACCP separata ──
  const anno=n(await c.query(`SELECT EXTRACT(YEAR FROM now())::int n`));
  const maxSC=n(await c.query(`SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_verbale,'-',3) AS int)),0)::int n FROM public.visite WHERE numero_verbale LIKE 'SC-'||$1||'-%'`,[anno]));
  const cli=(await c.query(`SELECT s.cliente_id, s.id sede_id FROM public.piani_visite pv JOIN public.sedi s ON s.id=pv.sede_id LIMIT 1`)).rows[0];
  const tmpl=(await c.query(`SELECT id FROM public.template_master WHERE attivo=true ORDER BY versione DESC LIMIT 1`)).rows[0].id;
  const mkVisita=(modId)=>svc(async()=>(await c.query(`INSERT INTO public.visite (cliente_id,sede_id,specialist_id,data_visita,stato,template_master_id,template_snapshot,modulo_id) VALUES ($1,$2,$3,CURRENT_DATE,'bozza',$4,'{}'::jsonb,$5) RETURNING id`,[cli.cliente_id,cli.sede_id,A,tmpl,modId])).rows[0].id);

  const vSic=await mkVisita(SIC);
  const numSic=(await svc(()=>c.query(`SELECT public.assegna_numero_verbale($1) num`,[vSic]))).rows[0].num;
  ck("Numerazione SC: prosegue la serie senza salti", numSic===`SC-${anno}-${String(maxSC+1).padStart(4,"0")}`, numSic);

  const maxHac=n(await c.query(`SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_verbale,'-',3) AS int)),0)::int n FROM public.visite WHERE numero_verbale LIKE 'HACCP-'||$1||'-%'`,[anno]));
  const vHac=await mkVisita(HAC);
  const numHac=(await svc(()=>c.query(`SELECT public.assegna_numero_verbale($1) num`,[vHac]))).rows[0].num;
  ck("Numerazione HACCP: serie separata (prefisso HACCP)", numHac===`HACCP-${anno}-${String(maxHac+1).padStart(4,"0")}`, numHac);
  // Indipendenza: assegnare HACCP non ha toccato la serie SC
  const maxSCdopo=n(await c.query(`SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_verbale,'-',3) AS int)),0)::int n FROM public.visite WHERE numero_verbale LIKE 'SC-'||$1||'-%'`,[anno]));
  ck("Numerazione: serie SC e HACCP indipendenti", maxSCdopo===maxSC+1, `maxSC=${maxSCdopo}`);

  // ── clona_visita copia modulo_id (source HACCP) ──
  const src=await mkVisita(HAC);
  const cloneId=(await svc(()=>c.query(`SELECT public.clona_visita($1,false) id`,[src]))).rows[0].id;
  const modClone=(await c.query(`SELECT modulo_id FROM public.visite WHERE id=$1`,[cloneId])).rows[0].modulo_id;
  ck("clona_visita: il clone eredita modulo_id del sorgente", modClone===HAC, modClone);

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
}finally{await c.query("ROLLBACK").catch(()=>{});await c.end();console.log("ROLLBACK — nessuna modifica persistita.");}
process.exit(fail===0?0:1);
