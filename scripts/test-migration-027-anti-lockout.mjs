/**
 * Test dedicato migration 027 (trigger anti-lockout su utenti). La 027 NON è in
 * prod: qui si applica SOLO la 027 in transazione (025 già live) e si verifica.
 * Tutto RLS-enforced (SET ROLE authenticated per i casi "self"), mai superuser
 * per esercitare le policy; i casi "service role" usano il contesto senza jwt
 * (auth.uid() NULL) per provare che il trigger NON è bypassabile. BEGIN…ROLLBACK.
 *
 * Copertura (mandato Fase A):
 *   - disattivazione ultimo admin bloccata: self (T1) e via service role (T3)
 *   - retrocessione ultimo admin bloccata: self (T2) e via service role (T4)
 *   - operazioni legittime: promozione (T5), demote non-ultimo (T6),
 *     disattivazione non-ultimo (T7), self-disattivazione non-ultimo (T8)
 *   - trigger NON bypassabile con service role (T3/T4)
 *   - anti-escalation 025 intatto (T10 ruolo, T11 attivo)
 *   - RETURNING dove il client lo userà (T1/T3 blocked + T9 allowed)
 *
 * Uso: node scripts/test-migration-027-anti-lockout.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_027 = readFileSync(join(ROOT, "supabase", "migrations", "027_sprint16_anti_lockout.sql"), "utf8");
function dbUrl(){for(const l of readFileSync(join(ROOT,".env.local"),"utf8").split(/\r?\n/)){const i=l.indexOf("=");if(i<0)continue;if(l.slice(0,i).trim()==="DATABASE_URL")return l.slice(i+1).trim().replace(/^["']|["']$/g,"");}throw new Error("no url");}
const u=new URL(dbUrl());
const c=new pg.Client({host:"aws-1-eu-central-1.pooler.supabase.com",port:5432,user:`postgres.${REF}`,password:decodeURIComponent(u.password),database:"postgres",ssl:{rejectUnauthorized:false},connectionTimeoutMillis:20000});
let pass=0,fail=0;
function ck(n,ok,x=""){console.log(`${ok?"✓":"✗"} ${n}${x?"  — "+x:""}`);if(ok)pass++;else fail++;}

// Contesto utente reale (RLS attiva). NIENTE finally-reset: SET LOCAL role/jwt
// sono savepoint-scoped → il ROLLBACK TO SAVEPOINT di iso() li ripristina. Un
// RESET ROLE nel finally girerebbe su una tx già abortita (25P02) mascherando
// l'errore reale del trigger.
async function asUser(uid,fn){await c.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({sub:uid,role:"authenticated"})}'`);await c.query(`SET LOCAL ROLE authenticated`);return fn();}
// Contesto service role: nessun jwt (auth.uid() NULL), ruolo di connessione (BYPASSRLS).
async function svc(fn){await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);await c.query(`RESET ROLE`);return fn();}
// Isola una prova in un savepoint e la ANNULLA sempre (ripristina la baseline).
async function iso(fn){await c.query("SAVEPOINT s");let r;try{r={ok:true,v:await fn()};}catch(e){r={ok:false,e};}await c.query("ROLLBACK TO SAVEPOINT s");await c.query("RELEASE SAVEPOINT s");return r;}
const isLockout=(e)=>e&&e.code==="SC001";

await c.connect();
try{
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);
  await c.query(SQL_027);   // 025 già live; qui solo la 027
  console.log("Migration 027 applicata in transazione (sopra la 025 live).\n");

  // Struttura presente
  const fn=(await c.query(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='trg_utenti_anti_lockout'`)).rowCount;
  const trg=(await c.query(`SELECT 1 FROM pg_trigger t JOIN pg_class cl ON cl.oid=t.tgrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname='utenti' AND t.tgname='trg_utenti_anti_lockout' AND NOT t.tgisinternal`)).rowCount;
  ck("struttura: funzione trg_utenti_anti_lockout presente", fn===1);
  ck("struttura: trigger trg_utenti_anti_lockout su utenti presente", trg===1);
  const esc=(await c.query(`SELECT 1 FROM pg_trigger t JOIN pg_class cl ON cl.oid=t.tgrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname='utenti' AND t.tgname='trg_utenti_anti_escalation' AND NOT t.tgisinternal`)).rowCount;
  ck("struttura: trigger anti-escalation 025 ancora presente (invariato)", esc===1);

  // Utenti reali riutilizzabili
  const U1=(await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;   // diventa admin
  const U2=(await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;   // resta non-admin

  // ── BASELINE B: U1 unico admin attivo; U2 specialist attivo; nessun altro admin attivo ──
  await svc(async()=>{
    await c.query(`UPDATE public.utenti SET ruolo='admin', attivo=true WHERE id=$1`,[U1]);
    await c.query(`UPDATE public.utenti SET ruolo='specialist', attivo=true WHERE id=$1`,[U2]);
    await c.query(`UPDATE public.utenti SET attivo=false WHERE ruolo='admin' AND attivo=true AND id<>$1`,[U1]);
  });
  const nAdmin=(await c.query(`SELECT count(*)::int n FROM public.utenti WHERE ruolo='admin' AND attivo=true`)).rows[0].n;
  ck("baseline: esattamente 1 admin attivo (U1)", nAdmin===1, `n=${nAdmin}`);

  // ── ULTIMO ADMIN: rimozione bloccata ──
  const t1=await iso(()=>asUser(U1,()=>c.query(`UPDATE public.utenti SET attivo=false WHERE id=$1 RETURNING id`,[U1])));
  ck("T1 self: ultimo admin si auto-DISATTIVA (RETURNING) → BLOCCATO (SC001)", !t1.ok && isLockout(t1.e), t1.ok?"consentito!":t1.e.code);

  const t2=await iso(()=>asUser(U1,()=>c.query(`UPDATE public.utenti SET ruolo='specialist' WHERE id=$1`,[U1])));
  ck("T2 self: ultimo admin si RETROCEDE → BLOCCATO (SC001)", !t2.ok && isLockout(t2.e), t2.ok?"consentito!":t2.e.code);

  const t3=await iso(()=>svc(()=>c.query(`UPDATE public.utenti SET attivo=false WHERE id=$1 RETURNING id`,[U1])));
  ck("T3 service role: DISATTIVA ultimo admin (RETURNING) → BLOCCATO, NON bypassabile", !t3.ok && isLockout(t3.e), t3.ok?"BYPASS!":t3.e.code);

  const t4=await iso(()=>svc(()=>c.query(`UPDATE public.utenti SET ruolo='specialist' WHERE id=$1`,[U1])));
  ck("T4 service role: RETROCEDE ultimo admin → BLOCCATO, NON bypassabile", !t4.ok && isLockout(t4.e), t4.ok?"BYPASS!":t4.e.code);

  // ── OPERAZIONI LEGITTIME ──
  const t5=await iso(()=>svc(()=>c.query(`UPDATE public.utenti SET ruolo='admin', attivo=true WHERE id=$1`,[U2])));
  ck("T5 promozione: U2 → admin attivo → CONSENTITA", t5.ok && t5.v.rowCount===1, t5.ok?"":t5.e.code);

  const t6=await iso(()=>svc(async()=>{
    await c.query(`UPDATE public.utenti SET ruolo='admin', attivo=true WHERE id=$1`,[U2]);   // ora 2 admin
    return c.query(`UPDATE public.utenti SET ruolo='specialist' WHERE id=$1`,[U2]);          // retrocedo il NON-ultimo
  }));
  ck("T6 demote non-ultimo: con 2 admin, retrocedo U2 (resta U1) → CONSENTITO", t6.ok && t6.v.rowCount===1, t6.ok?"":t6.e.code);

  const t7=await iso(()=>svc(async()=>{
    await c.query(`UPDATE public.utenti SET ruolo='admin', attivo=true WHERE id=$1`,[U2]);
    return c.query(`UPDATE public.utenti SET attivo=false WHERE id=$1`,[U2]);
  }));
  ck("T7 disattiva non-ultimo: con 2 admin, disattivo U2 (resta U1) → CONSENTITO", t7.ok && t7.v.rowCount===1, t7.ok?"":t7.e.code);

  const t8=await iso(async()=>{
    await svc(()=>c.query(`UPDATE public.utenti SET ruolo='admin', attivo=true WHERE id=$1`,[U2]));   // 2 admin
    return asUser(U1,()=>c.query(`UPDATE public.utenti SET attivo=false WHERE id=$1 RETURNING id`,[U1]));  // self, non ultimo
  });
  ck("T8 self non-ultimo: U1 si disattiva con U2 admin attivo → CONSENTITO", t8.ok && t8.v.rowCount===1, t8.ok?"":t8.e?.code);

  // ── RETURNING su percorso consentito (mirror .update().select() del client) ──
  const t9=await iso(()=>svc(()=>c.query(`UPDATE public.utenti SET ruolo='admin', attivo=true WHERE id=$1 RETURNING id, ruolo, attivo`,[U2])));
  ck("T9 RETURNING consentito: promozione U2 restituisce la riga", t9.ok && t9.v.rows[0]?.ruolo==="admin" && t9.v.rows[0]?.attivo===true, t9.ok?"":t9.e.code);

  // ── ANTI-ESCALATION 025 intatto (regressione) ──
  const t10=await iso(()=>asUser(U2,()=>c.query(`UPDATE public.utenti SET ruolo='admin' WHERE id=$1`,[U2])));
  ck("T10 anti-escalation: non-admin (U2) si auto-promuove ruolo → BLOCCATO", !t10.ok && /privilegi admin/i.test(t10.e?.message||""), t10.ok?"consentito!":t10.e.message);

  const t11=await iso(()=>asUser(U2,()=>c.query(`UPDATE public.utenti SET attivo=false WHERE id=$1`,[U2])));
  ck("T11 anti-escalation: non-admin (U2) cambia il proprio 'attivo' → BLOCCATO", !t11.ok && /privilegi admin/i.test(t11.e?.message||""), t11.ok?"consentito!":t11.e.message);

  // ── DELETE (ramo BEFORE DELETE) ──
  // Il trigger valuta SOLO l'anti-lockout; gli esiti FK sono indipendenti → per i
  // casi "consentiti dal trigger" si asserisce che l'errore NON sia SC001 (può
  // essere successo oppure 23503 FK, entrambi = trigger ha lasciato passare).
  const notLockout=(r)=>r.ok || (r.e && r.e.code!=="SC001");

  const t12=await iso(()=>svc(()=>c.query(`DELETE FROM public.utenti WHERE id=$1`,[U1])));
  ck("T12 service role: DELETE ultimo admin → BLOCCATO (SC001), non bypassabile", !t12.ok && isLockout(t12.e), t12.ok?"cancellato!":t12.e.code);

  const t13=await iso(()=>svc(async()=>{
    await c.query(`UPDATE public.utenti SET ruolo='admin', attivo=true WHERE id=$1`,[U2]);   // 2 admin
    return c.query(`DELETE FROM public.utenti WHERE id=$1`,[U2]);                              // cancello il NON-ultimo
  }));
  ck("T13 DELETE non-ultimo: con 2 admin, il trigger CONSENTE la delete di U2 (a prescindere da FK)", notLockout(t13), t13.ok?"ok":t13.e?.code);

  const t14=await iso(()=>svc(()=>c.query(`DELETE FROM public.utenti WHERE id=$1`,[U2])));    // U2 = specialist (baseline)
  ck("T14 DELETE non-admin: il trigger CONSENTE la delete di un non-admin (a prescindere da FK)", notLockout(t14), t14.ok?"ok":t14.e?.code);

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
}finally{await c.query("ROLLBACK").catch(()=>{});await c.end();console.log("ROLLBACK — nessuna modifica persistita.");}
process.exit(fail===0?0:1);
