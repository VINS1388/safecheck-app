/**
 * TEST RACE a 2 connessioni per la migration 027 (anti-lockout) — richiede 027
 * GIÀ LIVE in prod. Dimostra che l'advisory lock serializza le rimozioni di admin
 * attivi: con ESATTAMENTE 2 admin attivi, due disattivazioni CONCORRENTI (una per
 * connessione) → ESATTAMENTE UNA passa, l'altra è bloccata (SC001).
 *
 * ⚠️ A DIFFERENZA DEGLI ALTRI TEST, questo COMMITTA uno stato transitorio: per
 * ottenere "esattamente 2 admin attivi" globali, disattiva temporaneamente
 * l'admin reale (e ogni altro admin) lasciando attivi solo i 2 account di test
 * (tecnico.test, planner.test), che sono i due "in gara". L'admin reale NON è mai
 * bersaglio della gara. Al termine, teardown in finally ripristina ESATTAMENTE lo
 * snapshot iniziale (riattivazione = mai bloccata dal trigger) e verifica il
 * ripristino. Se il ripristino fallisse, stampa l'SQL di recupero manuale.
 *
 * Uso: node scripts/test-migration-027-race.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
function dbUrl(){for(const l of readFileSync(join(ROOT,".env.local"),"utf8").split(/\r?\n/)){const i=l.indexOf("=");if(i<0)continue;if(l.slice(0,i).trim()==="DATABASE_URL")return l.slice(i+1).trim().replace(/^["']|["']$/g,"");}throw new Error("no url");}
const PW=decodeURIComponent(new URL(dbUrl()).password);
const newClient=()=>new pg.Client({host:"aws-1-eu-central-1.pooler.supabase.com",port:5432,user:`postgres.${REF}`,password:PW,database:"postgres",ssl:{rejectUnauthorized:false},connectionTimeoutMillis:20000});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
function ck(n,ok,x=""){console.log(`${ok?"✓":"✗"} ${n}${x?"  — "+x:""}`);if(ok)pass++;else fail++;}

const cA=newClient(), cB=newClient();
let snap=new Map(), U1, U2, activeAdminIds=[];

await cA.connect(); await cB.connect();
try{
  // Precondizione: 027 live.
  const live=(await cA.query(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='trg_utenti_anti_lockout'`)).rowCount;
  if(live!==1){console.log("✗ 027 non live: eseguire prima l'apply. Test annullato.");process.exit(1);}

  U1=(await cA.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;
  U2=(await cA.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;

  // Snapshot degli utenti che toccheremo: U1, U2 e tutti gli admin attivi correnti.
  const rows=(await cA.query(`SELECT id, ruolo, attivo FROM public.utenti WHERE id=$1 OR id=$2 OR (ruolo='admin' AND attivo=true)`,[U1,U2])).rows;
  for(const r of rows) snap.set(r.id,{ruolo:r.ruolo,attivo:r.attivo});
  activeAdminIds=rows.filter(r=>r.ruolo==="admin"&&r.attivo).map(r=>r.id);
  console.log(`Snapshot: ${snap.size} righe; admin attivi iniziali: ${activeAdminIds.length}.`);

  // ── SETUP (autocommit): esattamente 2 admin attivi = {U1, U2} ──
  await cA.query(`UPDATE public.utenti SET ruolo='admin', attivo=true WHERE id=$1`,[U1]);
  await cA.query(`UPDATE public.utenti SET ruolo='admin', attivo=true WHERE id=$1`,[U2]);
  await cA.query(`UPDATE public.utenti SET attivo=false WHERE ruolo='admin' AND attivo=true AND id<>$1 AND id<>$2`,[U1,U2]);
  const n0=(await cA.query(`SELECT count(*)::int n FROM public.utenti WHERE ruolo='admin' AND attivo=true`)).rows[0].n;
  ck("setup: esattamente 2 admin attivi committati (U1, U2)", n0===2, `n=${n0}`);

  // ── RACE ──
  // A disattiva U1 in una tx aperta → prende l'advisory lock e lo trattiene.
  await cA.query("BEGIN");
  const rA=await cA.query(`UPDATE public.utenti SET attivo=false WHERE id=$1`,[U1]);

  // B (altra connessione) prova a disattivare U2: si bloccherà sull'advisory lock.
  let bErr=null;
  const pB=(async()=>{ await cB.query("BEGIN"); try{ await cB.query(`UPDATE public.utenti SET attivo=false WHERE id=$1`,[U2]); }catch(e){ bErr=e; } })();

  // Osserva che B stia ASPETTANDO l'advisory lock (granted=false) → prova che il lock serializza.
  let observedWait=false;
  for(let i=0;i<60;i++){
    const w=await cA.query(`SELECT granted FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=81027 AND objsubid=1`);
    if(w.rows.some(r=>r.granted===false)){observedWait=true;break;}
    await sleep(50);
  }
  ck("race: B osservata IN ATTESA sull'advisory lock (serializzazione)", observedWait);

  // A committa → rilascia il lock; B riprende e il trigger la blocca (nessun altro admin attivo).
  await cA.query("COMMIT");
  await pB;
  await cB.query("ROLLBACK").catch(()=>{});

  const aOk = rA.rowCount===1;                 // A ha disattivato U1 e committato
  const bBlocked = !!bErr && bErr.code==="SC001";
  ck("race: A (disattiva U1) PASSA e committa", aOk);
  ck("race: B (disattiva U2) BLOCCATA con SC001", bBlocked, bErr?bErr.code:"nessun errore!");
  ck("race: ESATTAMENTE una delle due passa", (aOk?1:0)+(bBlocked?0:1)===1 && aOk && bBlocked);

  const n1=(await cA.query(`SELECT count(*)::int n FROM public.utenti WHERE ruolo='admin' AND attivo=true`)).rows[0].n;
  ck("race: dopo la gara resta 1 admin attivo (U2)", n1===1, `n=${n1}`);
}catch(e){
  ck("esecuzione senza eccezioni impreviste", false, e.message);
}finally{
  // ── TEARDOWN: ripristino esatto dello snapshot ──
  try{ await cA.query("ROLLBACK"); }catch{}
  try{ await cB.query("ROLLBACK"); }catch{}
  try{
    // pass 1: riattiva i floor (admin attivi originali) → mai bloccato
    for(const [id,s] of snap) if(s.ruolo==="admin"&&s.attivo) await cA.query(`UPDATE public.utenti SET ruolo='admin', attivo=true WHERE id=$1`,[id]);
    // pass 2: ripristino esatto di ogni riga
    for(const [id,s] of snap) await cA.query(`UPDATE public.utenti SET ruolo=$2, attivo=$3 WHERE id=$1`,[id,s.ruolo,s.attivo]);

    // verifica: gli admin attivi originali sono di nuovo esattamente quelli
    const nowAdmins=(await cA.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true ORDER BY id`)).rows.map(r=>r.id);
    const want=[...activeAdminIds].sort();
    const restored=nowAdmins.length===want.length && want.every((id,i)=>id===nowAdmins.slice().sort()[i]);
    ck("teardown: snapshot admin attivi ripristinato esattamente", restored, `now=[${nowAdmins}] want=[${want}]`);
    if(!restored){
      console.log("\n⚠️  RIPRISTINO MANUALE (esegui come service role):");
      for(const id of activeAdminIds) console.log(`   UPDATE public.utenti SET ruolo='admin', attivo=true WHERE id='${id}';`);
    }
  }catch(e){
    ck("teardown eseguito", false, e.message);
    console.log("\n⚠️  TEARDOWN FALLITO — RIPRISTINO MANUALE admin reali:");
    for(const id of activeAdminIds) console.log(`   UPDATE public.utenti SET ruolo='admin', attivo=true WHERE id='${id}';`);
  }
  await cA.end(); await cB.end();
  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
  process.exit(fail===0?0:1);
}
