/**
 * Fase C — livello applicativo moduli. Le funzioni di moduli.ts usano la sessione
 * Next (non esercitabili qui): si verificano le QUERY sottostanti con asUser
 * (SET ROLE authenticated, mai superuser) e la LOGICA DI COMPOSIZIONE che decide
 * se il selettore modulo appare. BEGIN…ROLLBACK.
 *
 * Verifica:
 *  - getModuliAttivabili = 1 (solo 'sicurezza') → tipologia FilterBar auto-nascosta.
 *  - getModuliSelezionabiliVisita(sede) = ESATTAMENTE ['sicurezza'] (attivo a
 *    catalogo ∩ attivo sulla sede ∩ con template) → selettore NON renderizzato
 *    (flusso di creazione identico a oggi).
 *  - scoping nuove query: tecnico legge il catalogo moduli; moduli_sede SELECT
 *    scopato; setModuloSede negato al tecnico (RLS).
 *
 * Uso: node scripts/test-fase-c-moduli.mjs
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
async function asUser(uid,fn){await c.query(`SET LOCAL request.jwt.claims='${JSON.stringify({sub:uid,role:"authenticated"})}'`);await c.query(`SET LOCAL ROLE authenticated`);try{return await fn();}finally{try{await c.query(`RESET ROLE`);}catch{}}}
async function sp(fn){await c.query("SAVEPOINT s");let r;try{r={ok:true,v:await fn()};}catch(e){r={ok:false,e};}await c.query("ROLLBACK TO SAVEPOINT s");await c.query("RELEASE SAVEPOINT s");return r;}
const n=(r)=>Number(r.rows[0].n);

// mirror di getModuliSelezionabiliVisita: attivabili ∩ attivi-su-sede ∩ con-template
async function selezionabili(sedeId){
  const att=new Set((await c.query(`SELECT id FROM public.moduli WHERE attivo=true`)).rows.map(r=>r.id));
  const sede=new Set((await c.query(`SELECT modulo_id FROM public.moduli_sede WHERE sede_id=$1 AND attivo=true`,[sedeId])).rows.map(r=>r.modulo_id));
  const tmpl=new Set((await c.query(`SELECT DISTINCT modulo_id FROM public.template_master WHERE attivo=true`)).rows.map(r=>r.modulo_id));
  return [...att].filter(id=>sede.has(id)&&tmpl.has(id));
}

await c.connect();
try{
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);

  const T=(await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;
  const PL=(await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;
  const sede=(await c.query(`SELECT id FROM public.sedi LIMIT 1`)).rows[0].id;

  // ── tipologia auto-nascosta ──
  const attivabili=n(await c.query(`SELECT count(*)::int n FROM public.moduli WHERE attivo=true`));
  ck("getModuliAttivabili = 1 → tipologia FilterBar auto-nascosta (length>1 = false)", attivabili===1, `n=${attivabili}`);

  // ── selettore modulo NON renderizzato (un solo selezionabile) ──
  const sel=await selezionabili(sede);
  const codice=sel.length===1?(await c.query(`SELECT codice FROM public.moduli WHERE id=$1`,[sel[0]])).rows[0].codice:null;
  ck("getModuliSelezionabiliVisita(sede) = ['sicurezza'] → nessun selettore (flusso invariato)", sel.length===1 && codice==="sicurezza", `len=${sel.length} codice=${codice}`);

  // ── scoping nuove query ──
  const catT=n(await asUser(T,async()=>await c.query(`SELECT count(*)::int n FROM public.moduli`)));
  ck("scoping: tecnico legge il catalogo moduli (4)", catT===4, `n=${catT}`);

  // moduli_sede SELECT scopato: tecnico vede solo sedi raggiungibili
  const sediT=new Set((await c.query(`SELECT sede_id FROM public.visite WHERE specialist_id=$1`,[T])).rows.map(r=>r.sede_id));
  for(const r of (await c.query(`SELECT sede_id FROM public.visite_pianificate WHERE tecnico_assegnato_id=$1 AND sede_id IS NOT NULL`,[T])).rows) sediT.add(r.sede_id);
  const msT=(await asUser(T,async()=>await c.query(`SELECT sede_id FROM public.moduli_sede`))).rows.map(r=>r.sede_id);
  ck("scoping: moduli_sede SELECT del tecnico ⊆ sedi raggiungibili", msT.every(s=>sediT.has(s)));

  // setModuloSede: tecnico NEGATO, planner CONSENTITO (upsert/insert…RETURNING)
  const HAC="a0000000-0000-4000-8000-000000000002";
  const insT=await sp(()=>asUser(T,()=>c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true) RETURNING id`,[sede,HAC])));
  ck("setModuloSede: tecnico NEGATO (RLS)", !insT.ok && insT.e.code==="42501", insT.ok?"consentito!":insT.e.code);
  const insP=await sp(()=>asUser(PL,()=>c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true) RETURNING id`,[sede,HAC])));
  ck("setModuloSede: planner CONSENTITO (INSERT…RETURNING)", insP.ok && insP.v.rows[0]?.id, insP.ok?"":insP.e.code);

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
}finally{await c.query("ROLLBACK").catch(()=>{});await c.end();console.log("ROLLBACK — nessuna modifica persistita.");}
process.exit(fail===0?0:1);
