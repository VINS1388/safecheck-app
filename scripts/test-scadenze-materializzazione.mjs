/**
 * Test migration 033 (materializzazione scadenze) — NON in prod.
 * Protocollo: BEGIN…ROLLBACK, SET ROLE authenticated/anon (mai superuser per le
 * prove di ruolo). La 033 è applicata DENTRO la transazione e annullata dal ROLLBACK.
 * Le policy RLS scadenze sono quelle già in prod (025): non riapplicate.
 *
 * Copertura:
 *  - schema 033: colonne domanda_id/visita_id/modulo_id + indice unique parziale + RPC.
 *  - RPC materializza_scadenze: base, upsert latest-wins, riconciliazione
 *    (nominativo rimosso), scoping cross-modulo, set vuoto stesso modulo.
 *  - RLS tabella per ruolo: INSERT/UPDATE/DELETE (admin/planner/tecnico/anon) +
 *    SELECT scope (admin/planner tutto; tecnico solo sedi raggiungibili).
 *  - Hardening RPC: un tecnico NON può eseguire la RPC (EXECUTE solo service_role).
 *  - Contract non-bloccante del writer (mirror: errore RPC isolato, tx prosegue).
 *
 * Uso: node scripts/test-scadenze-materializzazione.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
function dbUrl(){for(const l of readFileSync(join(ROOT,".env.local"),"utf8").split(/\r?\n/)){const i=l.indexOf("=");if(i<0)continue;if(l.slice(0,i).trim()==="DATABASE_URL")return l.slice(i+1).trim().replace(/^["']|["']$/g,"");}throw new Error("no url");}
const c=new pg.Client({host:"aws-1-eu-central-1.pooler.supabase.com",port:5432,user:`postgres.${REF}`,password:decodeURIComponent(new URL(dbUrl()).password),database:"postgres",ssl:{rejectUnauthorized:false},connectionTimeoutMillis:20000});
let pass=0,fail=0;
function ck(n,ok,x=""){console.log(`${ok?"✓":"✗"} ${n}${x?"  — "+x:""}`);if(ok)pass++;else fail++;}
async function asUser(uid,fn){await c.query(`SET LOCAL request.jwt.claims='${JSON.stringify({sub:uid,role:"authenticated"})}'`);await c.query(`SET LOCAL ROLE authenticated`);try{return await fn();}finally{try{await c.query(`RESET ROLE`);}catch{}}}
async function asAnon(fn){await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);await c.query(`SET LOCAL ROLE anon`);try{return await fn();}finally{try{await c.query(`RESET ROLE`);}catch{}}}
async function svc(fn){await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);await c.query(`RESET ROLE`);return fn();}
async function sp(fn){await c.query("SAVEPOINT s");let r;try{r={ok:true,v:await fn()};}catch(e){r={ok:false,e};}await c.query("ROLLBACK TO SAVEPOINT s");await c.query("RELEASE SAVEPOINT s");return r;}
const n=(r)=>Number(r.rows[0].n);

await c.connect();
try{
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);

  // ── Applica 033 nella tx ──
  await c.query(readFileSync(join(ROOT,"supabase/migrations/033_scadenze_materializzazione.sql"),"utf8"));
  ck("migration 033 applicata nella tx", true);

  const cols=(await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='scadenze' AND column_name IN ('domanda_id','visita_id','modulo_id')`)).rows.map(r=>r.column_name).sort();
  ck("3 colonne di adeguamento presenti", cols.join(",")==="domanda_id,modulo_id,visita_id", cols.join(","));
  const uq=n(await c.query(`SELECT count(*)::int n FROM pg_indexes WHERE schemaname='public' AND tablename='scadenze' AND indexname='uq_scadenze_materializzate'`));
  ck("indice unique parziale presente", uq===1);
  const fn=n(await c.query(`SELECT count(*)::int n FROM pg_proc WHERE proname='materializza_scadenze'`));
  ck("RPC materializza_scadenze presente", fn===1);

  // ── Fixtures ──
  const A=(await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
  const PL=(await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;
  const T=(await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;
  const SIC=(await c.query(`SELECT id FROM public.moduli WHERE codice='sicurezza'`)).rows[0].id;
  const HAC=(await c.query(`SELECT id FROM public.moduli WHERE codice='haccp_generico'`)).rows[0].id;
  const V=(await c.query(`SELECT id FROM public.visite LIMIT 1`)).rows[0].id;
  // sedi raggiungibili dal tecnico
  const sediT=new Set((await c.query(`SELECT sede_id FROM public.visite WHERE specialist_id=$1`,[T])).rows.map(r=>r.sede_id));
  for(const r of (await c.query(`SELECT sede_id FROM public.visite_pianificate WHERE tecnico_assegnato_id=$1 AND sede_id IS NOT NULL`,[T])).rows) sediT.add(r.sede_id);
  const sedeR=[...sediT][0];
  const sedeN=(await c.query(`SELECT id FROM public.sedi WHERE id <> ALL($1::uuid[]) LIMIT 1`,[[...sediT]])).rows[0]?.id;
  const cliR=(await c.query(`SELECT cliente_id FROM public.sedi WHERE id=$1`,[sedeR])).rows[0].cliente_id;
  ck("fixtures ok (sedeR raggiungibile, sedeN non raggiungibile)", Boolean(sedeR&&sedeN&&SIC&&HAC&&V), `sedeR=${!!sedeR} sedeN=${!!sedeN}`);

  // helper RPC
  const rpc=(rows,{sede,cliente,modulo,visita})=>svc(()=>c.query(`SELECT public.materializza_scadenze($1,$2,$3,$4,$5::jsonb) n`,[visita,sede,cliente,modulo,JSON.stringify(rows)]));
  const matCount=(sede,modulo)=>svc(async()=>n(await c.query(`SELECT count(*)::int n FROM public.scadenze WHERE sede_id=$1 AND modulo_id=$2 AND riferimento_tipo='risposta_checklist'`,[sede,modulo])));
  // data_scadenza letta come TEXT (to_char) per evitare lo shift di fuso del driver
  // pg (colonne `date` → Date a mezzanotte locale → toISOString sposta al giorno prima).
  const rowOf=(sede,modulo,dom)=>svc(async()=>(await c.query(`SELECT to_char(data_scadenza,'YYYY-MM-DD') AS data_scadenza,stato,periodicita_mesi FROM public.scadenze WHERE sede_id=$1 AND modulo_id=$2 AND domanda_id=$3 AND riferimento_tipo='risposta_checklist'`,[sede,modulo,dom])).rows);

  const set2=[
    {domanda_id:"D-03-002",riferimento_id:randomUUID(),data_riferimento:"2025-01-15",periodicita_mesi:24,data_scadenza:"2027-01-15"},
    {domanda_id:"D-03-005::nomA",riferimento_id:randomUUID(),data_riferimento:"2021-06-01",periodicita_mesi:60,data_scadenza:"2026-06-01"},
  ];

  // ── C1 base ──
  await rpc(set2,{sede:sedeR,cliente:cliR,modulo:SIC,visita:V});
  ck("C1 base: 2 righe materializzate su (sedeR, sicurezza)", await matCount(sedeR,SIC)===2);
  const r1=await rowOf(sedeR,SIC,"D-03-002");
  ck("C1: campi coerenti (data_scadenza, stato, periodicita)", r1.length===1 && r1[0].stato==="attiva" && r1[0].periodicita_mesi===24 && r1[0].data_scadenza==="2027-01-15", JSON.stringify(r1[0]));

  // ── C2a upsert latest-wins (data aggiornata, stessa chiave) ──
  const set2b=[{...set2[0],data_scadenza:"2027-02-15"},set2[1]];
  await rpc(set2b,{sede:sedeR,cliente:cliR,modulo:SIC,visita:V});
  const r2=await rowOf(sedeR,SIC,"D-03-002");
  ck("C2a upsert: una sola riga per chiave, data aggiornata", await matCount(sedeR,SIC)===2 && r2.length===1 && r2[0].data_scadenza==="2027-02-15", r2[0]?.data_scadenza);

  // ── C2b riconciliazione: nominativo rimosso → la sua riga sparisce ──
  await rpc([set2b[0]],{sede:sedeR,cliente:cliR,modulo:SIC,visita:V}); // solo D-03-002
  const gone=(await rowOf(sedeR,SIC,"D-03-005::nomA")).length===0;
  ck("C2b riconciliazione: riga del nominativo rimosso eliminata", await matCount(sedeR,SIC)===1 && gone, `count=${await matCount(sedeR,SIC)} gone=${gone}`);

  // ── C3 cross-modulo: chiusura HACCP (0 righe) NON tocca sicurezza ──
  await rpc(set2b,{sede:sedeR,cliente:cliR,modulo:SIC,visita:V}); // ripristina 2 righe sicurezza
  const sicPrima=await matCount(sedeR,SIC);
  await rpc([],{sede:sedeR,cliente:cliR,modulo:HAC,visita:V});     // chiusura HACCP vuota
  ck("C3 cross-modulo: righe sicurezza INTATTE dopo chiusura HACCP", await matCount(sedeR,SIC)===sicPrima && sicPrima===2, `sic=${await matCount(sedeR,SIC)} haccp=${await matCount(sedeR,HAC)}`);
  ck("C3: nessuna riga HACCP creata", await matCount(sedeR,HAC)===0);

  // ── C4 set vuoto stesso modulo → azzera le righe sicurezza della sede ──
  await rpc([],{sede:sedeR,cliente:cliR,modulo:SIC,visita:V});
  ck("C4 set vuoto (stesso modulo): righe sicurezza azzerate", await matCount(sedeR,SIC)===0);

  // ── D. RLS tabella per ruolo (DML diretto) ──
  const insCols=`tipo,riferimento_tipo,riferimento_id,sede_id,modulo_id,domanda_id,data_scadenza,stato`;
  const insVals=(dom)=>`'formazione','risposta_checklist','${randomUUID()}','${sedeR}','${SIC}','${dom}','2027-01-01','attiva'`;
  const insRet=(dom)=>`INSERT INTO public.scadenze(${insCols}) VALUES(${insVals(dom)}) RETURNING id`;

  const anonIns=await sp(()=>asAnon(()=>c.query(insRet("RLS-ANON"))));
  ck("anon INSERT → negato", !anonIns.ok, anonIns.ok?"NON negato!":(anonIns.e.message.split("\n")[0]));
  const admIns=await sp(()=>asUser(A,()=>c.query(insRet("RLS-ADM"))));
  ck("admin INSERT...RETURNING → ok", admIns.ok && admIns.v.rowCount===1, admIns.ok?"":admIns.e.message);
  const plIns=await sp(()=>asUser(PL,()=>c.query(insRet("RLS-PL"))));
  ck("planner INSERT...RETURNING → ok", plIns.ok && plIns.v.rowCount===1, plIns.ok?"":plIns.e.message);
  const tecIns=await sp(()=>asUser(T,()=>c.query(insRet("RLS-TEC"))));
  ck("tecnico INSERT → negato (INSERT = admin/planner)", !tecIns.ok, tecIns.ok?"NON negato!":(tecIns.e.message.split("\n")[0]));

  // SELECT scope: righe marcate su sedeR (raggiungibile) e sedeN (non), cliente_id NULL per isolare lo scope-sede
  await svc(()=>c.query(`INSERT INTO public.scadenze(tipo,riferimento_tipo,riferimento_id,sede_id,modulo_id,domanda_id,data_scadenza,stato) VALUES
    ('formazione','risposta_checklist','${randomUUID()}','${sedeR}','${SIC}','SCOPE-R','2027-01-01','attiva'),
    ('formazione','risposta_checklist','${randomUUID()}','${sedeN}','${SIC}','SCOPE-N','2027-01-01','attiva')`));
  const seenBy=(uid)=>asUser(uid,async()=>({r:n(await c.query(`SELECT count(*)::int n FROM public.scadenze WHERE domanda_id='SCOPE-R'`)),nn:n(await c.query(`SELECT count(*)::int n FROM public.scadenze WHERE domanda_id='SCOPE-N'`))}));
  const sA=await seenBy(A), sPL=await seenBy(PL), sT=await seenBy(T);
  ck("SELECT admin: vede sedeR e sedeN", sA.r===1 && sA.nn===1, JSON.stringify(sA));
  ck("SELECT planner: vede sedeR e sedeN", sPL.r===1 && sPL.nn===1, JSON.stringify(sPL));
  ck("SELECT tecnico: vede solo sede raggiungibile (sedeR), non sedeN", sT.r===1 && sT.nn===0, JSON.stringify(sT));

  // UPDATE/DELETE per ruolo su una riga nota
  const rid=(await svc(()=>c.query(`INSERT INTO public.scadenze(tipo,riferimento_tipo,riferimento_id,sede_id,modulo_id,domanda_id,data_scadenza,stato) VALUES('formazione','risposta_checklist','${randomUUID()}','${sedeR}','${SIC}','UPD-TARGET','2027-01-01','attiva') RETURNING id`))).rows[0].id;
  const upd=(uid)=>sp(()=>asUser(uid,()=>c.query(`UPDATE public.scadenze SET stato='annullata' WHERE id='${rid}'`)));
  const uA=await upd(A), uPL=await upd(PL), uT=await upd(T);
  ck("UPDATE admin → ok (1 riga)", uA.ok && uA.v.rowCount===1, uA.ok?"":uA.e.message);
  ck("UPDATE planner → ok (1 riga)", uPL.ok && uPL.v.rowCount===1, uPL.ok?"":uPL.e.message);
  ck("UPDATE tecnico → negato (0 righe o denied)", !uT.ok || uT.v.rowCount===0, uT.ok?`rows=${uT.v.rowCount}`:"");
  const del=(uid)=>sp(()=>asUser(uid,()=>c.query(`DELETE FROM public.scadenze WHERE id='${rid}'`)));
  const dPL=await del(PL), dT=await del(T), dA=await del(A);
  ck("DELETE planner → negato (0 righe)", !dPL.ok || dPL.v.rowCount===0, dPL.ok?`rows=${dPL.v.rowCount}`:"");
  ck("DELETE tecnico → negato (0 righe)", !dT.ok || dT.v.rowCount===0, dT.ok?`rows=${dT.v.rowCount}`:"");
  ck("DELETE admin → ok (1 riga)", dA.ok && dA.v.rowCount===1, dA.ok?"":dA.e.message);

  // ── Hardening RPC: tecnico NON può eseguire la RPC (EXECUTE solo service_role) ──
  const tecRpc=await sp(()=>asUser(T,()=>c.query(`SELECT public.materializza_scadenze($1,$2,$3,$4,'[]'::jsonb)`,[V,sedeR,cliR,SIC])));
  ck("RPC hardening: tecnico NON può eseguire materializza_scadenze", !tecRpc.ok && /permission denied/i.test(tecRpc.e?.message??""), tecRpc.ok?"ESEGUITA!":(tecRpc.e.message.split("\n")[0]));

  // ── E. Contract non-bloccante del writer (mirror) ──
  //   L'errore della RPC è isolato (savepoint) e NON propagato → la mutazione
  //   chiamante prosegue (specchio del try/catch nella route di chiusura).
  let propagato=false, prosegue=false;
  const spm=await sp(async()=>{
    const bad=await sp(()=>svc(()=>c.query(`SELECT public.materializza_scadenze($1,$2,$3,$4,$5::jsonb)`,[V,sedeR,cliR,SIC,JSON.stringify([{domanda_id:"X",riferimento_id:randomUUID(),data_riferimento:"non-una-data",periodicita_mesi:12,data_scadenza:"boom"}])])));
    if(bad.ok) propagato=true; // atteso: bad.ok===false (errore contenuto)
    prosegue = n(await c.query(`SELECT 1 n`))===1; // la tx prosegue su connessione pulita
  });
  ck("writer contract: errore RPC contenuto, mutazione prosegue", spm.ok && !propagato && prosegue, `propagato=${propagato} prosegue=${prosegue}`);

  await c.query("ROLLBACK");
  console.log(`\n${pass} passati, ${fail} falliti`);
  process.exit(fail>0?1:0);
}catch(e){
  try{await c.query("ROLLBACK");}catch{}
  console.error("ERRORE TEST:",e.message);
  process.exit(1);
}finally{
  await c.end();
}
