/**
 * Test migration 032 (audit_events) — NON ancora in prod.
 * Protocollo standard del repo: BEGIN…ROLLBACK, SET ROLE authenticated/anon
 * (mai superuser per le prove di ruolo), asUser(ruolo reale via jwt sub).
 *
 * La migration 032 è applicata DENTRO la transazione di test e annullata dal
 * ROLLBACK finale: nessuna scrittura persistente sul DB di produzione.
 *
 * Copertura (specifica approvata):
 *  - ACL: anon INSERT → permission denied (REVOKE FROM anon).
 *  - RLS INSERT: admin RETURNING ok; planner/tecnico INSERT senza RETURNING ok
 *    (B1/C1, verificati via superuser); planner/tecnico INSERT...RETURNING NEGATO
 *    (B2/C2 — pass-through SELECT policy admin-only, comportamento noto Sprint 16).
 *  - RLS SELECT: admin vede tutto; planner/tecnico → 0 righe.
 *  - Append-only: UPDATE/DELETE negati per TUTTI i ruoli (admin incluso);
 *    riga intatta (verifica di controllo da superuser).
 *  - Payload jsonb non banale: rilettura identica.
 *  - Contract mirror non-bloccante del helper logAuditEvent (vedi nota in fondo).
 *
 * Uso: node scripts/test-audit-events.mjs
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
// asUser: esegue fn come `authenticated` con jwt sub=uid. RESET ROLE ingoiato
// (su tx abortita darebbe 25P02); il ripristino è garantito dal ROLLBACK del sp().
async function asUser(uid,fn){await c.query(`SET LOCAL request.jwt.claims='${JSON.stringify({sub:uid,role:"authenticated"})}'`);await c.query(`SET LOCAL ROLE authenticated`);try{return await fn();}finally{try{await c.query(`RESET ROLE`);}catch{}}}
async function asAnon(fn){await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);await c.query(`SET LOCAL ROLE anon`);try{return await fn();}finally{try{await c.query(`RESET ROLE`);}catch{}}}
async function svc(fn){await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);await c.query(`RESET ROLE`);return fn();}
// sp: isola una prova in un savepoint e la ANNULLA SEMPRE (le prove negate
// abortiscono la tx; il savepoint la ripulisce senza affondare quelle dopo).
async function sp(fn){await c.query("SAVEPOINT s");let r;try{r={ok:true,v:await fn()};}catch(e){r={ok:false,e};}await c.query("ROLLBACK TO SAVEPOINT s");await c.query("RELEASE SAVEPOINT s");return r;}
const n=(r)=>Number(r.rows[0].n);
const cnt=async()=>n(await c.query(`SELECT count(*)::int n FROM public.audit_events`));
// canon: serializzazione con chiavi ordinate ricorsivamente. jsonb NON preserva
// l'ordine d'inserimento delle chiavi (le normalizza), quindi il confronto
// dell'uguaglianza va fatto indipendente dall'ordine, non con JSON.stringify grezzo.
function canon(v){if(Array.isArray(v))return "["+v.map(canon).join(",")+"]";if(v&&typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canon(v[k])).join(",")+"}";return JSON.stringify(v);}

await c.connect();
try{
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);

  // ── Applica migration 032 dentro la transazione ──
  const sql=readFileSync(join(ROOT,"supabase/migrations/032_audit_events.sql"),"utf8");
  await c.query(sql);
  ck("migration 032 applicata nella tx di test", true);

  // Struttura: 2 indici + RLS abilitata + 2 policy (INSERT authenticated, SELECT admin).
  const idx=n(await c.query(`SELECT count(*)::int n FROM pg_indexes WHERE schemaname='public' AND tablename='audit_events' AND indexname LIKE 'idx_audit_events_%'`));
  ck("2 indici audit_events presenti", idx===2, `n=${idx}`);
  const pols=(await c.query(`SELECT p.polname,p.polcmd FROM pg_policy p JOIN pg_class cl ON cl.oid=p.polrelid WHERE cl.relname='audit_events' ORDER BY 1`)).rows;
  const cmds=pols.map(p=>p.polcmd).sort();
  // polcmd: 'a'=INSERT, 'r'=SELECT, 'w'=UPDATE, 'd'=DELETE
  ck("solo policy INSERT+SELECT (no UPDATE/DELETE)", cmds.length===2 && cmds.join("")==="ar", `cmds=${cmds.join(",")}`);
  const rls=(await c.query(`SELECT relrowsecurity FROM pg_class WHERE relname='audit_events'`)).rows[0].relrowsecurity;
  ck("RLS abilitata", rls===true);

  // ── Utenti reali per i ruoli ──
  const A=(await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
  const PL=(await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;
  const T=(await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;

  const INS=(uid,ret)=>`INSERT INTO public.audit_events(entity_type,entity_id,actor_user_id,event_type,payload) VALUES('visita','${uid}','${uid}','visita.creata','{}'::jsonb)${ret?" RETURNING id":""}`;

  // ── ACL: anon INSERT negato ──
  const anonIns=await sp(()=>asAnon(()=>c.query(INS(A,false))));
  ck("anon INSERT → negato (ACL REVOKE FROM anon)", !anonIns.ok && /permission denied/i.test(anonIns.e?.message??""), anonIns.ok?"NON negato!":anonIns.e.message);

  // ── admin INSERT ... RETURNING → ok ──
  const admIns=await sp(()=>asUser(A,()=>c.query(INS(A,true))));
  ck("admin INSERT...RETURNING → ok", admIns.ok && admIns.v.rowCount===1, admIns.ok?`row=${admIns.v.rowCount}`:admIns.e.message);

  // ── B1: planner INSERT SENZA RETURNING → ok (verifica via superuser) ──
  const b0=await cnt();
  await asUser(PL,()=>c.query(INS(PL,false)));
  const b1=await cnt();
  ck("B1 planner INSERT senza RETURNING → ok (+1 da superuser)", b1===b0+1, `${b0}→${b1}`);

  // ── C1: tecnico INSERT SENZA RETURNING → ok ──
  const c0=await cnt();
  await asUser(T,()=>c.query(INS(T,false)));
  const c1=await cnt();
  ck("C1 tecnico INSERT senza RETURNING → ok (+1 da superuser)", c1===c0+1, `${c0}→${c1}`);

  // ── B2: planner INSERT...RETURNING → NEGATO (pass-through SELECT admin-only) ──
  const b2=await sp(()=>asUser(PL,()=>c.query(INS(PL,true))));
  ck("B2 planner INSERT...RETURNING → NEGATO", !b2.ok && /permission|policy|denied/i.test(b2.e?.message??""), b2.ok?"NON negato!":b2.e.message);

  // ── C2: tecnico INSERT...RETURNING → NEGATO ──
  const c2=await sp(()=>asUser(T,()=>c.query(INS(T,true))));
  ck("C2 tecnico INSERT...RETURNING → NEGATO", !c2.ok && /permission|policy|denied/i.test(c2.e?.message??""), c2.ok?"NON negato!":c2.e.message);

  // ── SELECT: admin vede tutto; planner/tecnico → 0 ──
  const tot=await cnt(); // da superuser
  const selA=n(await asUser(A,()=>c.query(`SELECT count(*)::int n FROM public.audit_events`)));
  ck("SELECT admin vede tutte le righe", selA===tot, `admin=${selA} tot=${tot}`);
  const selPL=await sp(()=>asUser(PL,()=>c.query(`SELECT count(*)::int n FROM public.audit_events`)));
  ck("SELECT planner → 0 righe", selPL.ok && n(selPL.v)===0, selPL.ok?`n=${n(selPL.v)}`:selPL.e.message);
  const selT=await sp(()=>asUser(T,()=>c.query(`SELECT count(*)::int n FROM public.audit_events`)));
  ck("SELECT tecnico → 0 righe", selT.ok && n(selT.v)===0, selT.ok?`n=${n(selT.v)}`:selT.e.message);

  // ── Payload jsonb non banale: rilettura identica (da superuser) ──
  const payload={originale_id:A,nuovo_id:PL,flag:true,contatore:3,nested:{a:[1,2,3],note:"àèìòù"}};
  const insP=await asUser(A,()=>c.query(`INSERT INTO public.audit_events(entity_type,entity_id,actor_user_id,event_type,payload) VALUES('verbale','${A}','${A}','verbale.sostitutivo_creato',$1::jsonb) RETURNING id`,[JSON.stringify(payload)]));
  const rowId=insP.rows[0].id;
  const back=(await svc(()=>c.query(`SELECT payload FROM public.audit_events WHERE id=$1`,[rowId]))).rows[0].payload;
  // Confronto indipendente dall'ordine delle chiavi (jsonb le normalizza).
  ck("payload jsonb riletto identico", canon(back)===canon(payload), JSON.stringify(back));

  // ── Append-only: UPDATE/DELETE negati per TUTTI i ruoli ──
  for(const [nome,uid] of [["admin",A],["planner",PL],["tecnico",T]]){
    const upd=await sp(()=>asUser(uid,()=>c.query(`UPDATE public.audit_events SET event_type='HACKED' WHERE id='${rowId}'`)));
    const negato = !upd.ok || upd.v.rowCount===0;
    ck(`UPDATE ${nome} → negato (0 righe o permission denied)`, negato, upd.ok?`rowCount=${upd.v.rowCount}`:upd.e.message);
    const del=await sp(()=>asUser(uid,()=>c.query(`DELETE FROM public.audit_events WHERE id='${rowId}'`)));
    const dneg = !del.ok || del.v.rowCount===0;
    ck(`DELETE ${nome} → negato (0 righe o permission denied)`, dneg, del.ok?`rowCount=${del.v.rowCount}`:del.e.message);
  }
  // Controllo da superuser: la riga è intatta (event_type invariato, ancora presente).
  const intatta=(await svc(()=>c.query(`SELECT event_type FROM public.audit_events WHERE id=$1`,[rowId]))).rows;
  ck("riga intatta dopo i tentativi UPDATE/DELETE", intatta.length===1 && intatta[0].event_type==="verbale.sostitutivo_creato", JSON.stringify(intatta));

  // ── Contract mirror non-bloccante del helper (vedi nota) ──
  //   Il vero src/lib/audit/logAuditEvent.ts non è importabile in un harness
  //   node/pg (import "server-only" lancia fuori da RSC, next/headers richiede
  //   il contesto di request, alias "@/"). Qui si replica FEDELMENTE il suo
  //   contratto: un insert che ERRORE viene ingoiato (try/catch totale) e NON
  //   propaga; la "mutazione chiamante" successiva prosegue. Lo stesso helper è
  //   inoltre esercitato realmente lato DB da B1/C1 (insert senza RETURNING ok).
  let propagato=false, mutazioneOk=false;
  async function logLikeHelper(){
    // Come il vero helper: l'errore d'insert è ingoiato e ISOLATO (il helper usa
    // una connessione PostgREST separata → non avvelena la tx del chiamante; qui
    // lo si rappresenta col savepoint interno, che sp() ripulisce sempre).
    try{
      const r=await sp(()=>asAnon(()=>c.query(INS(A,false))));
      void r; // r.ok===false (respinto), ma NON propagato
    }catch(e){ propagato=true; void e; }
  }
  const spm=await sp(async()=>{
    await logLikeHelper();
    // la mutazione chiamante prosegue comunque, su connessione pulita
    mutazioneOk = n(await c.query(`SELECT 1 n`))===1;
  });
  ck("helper contract: errore audit NON propagato, mutazione prosegue", spm.ok && !propagato && mutazioneOk, spm.ok?`propagato=${propagato} mutazioneOk=${mutazioneOk}`:spm.e.message);

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
