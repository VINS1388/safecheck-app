/**
 * Sprint 16 — Test RLS-ENFORCED della migration 025 (policy per-ruolo + trigger).
 *
 * PROTOCOLLO OBBLIGATORIO: ogni scenario gira con RLS ENFORCED —
 *   SET LOCAL request.jwt.claims = {sub, role:'authenticated'} + SET LOCAL ROLE
 *   authenticated + RESET ROLE. MAI da superuser (bypassa la RLS: è così che il
 *   bug della policy DELETE mancante era sfuggito). Il "service role" è emulato
 *   azzerando i claims (auth.uid() → NULL), come createAdminClient() in app.
 *
 * La migration 025 viene applicata DENTRO la transazione (prod è a 024; l'enum
 * 'planner' è già committato, quindi le policy che lo referenziano funzionano) e
 * tutto viene ROLLBACK-ato: nessuna modifica persiste.
 *
 * Uso: node scripts/test-sprint16-025-rls.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
// La 025 è GIÀ applicata in prod (policy per-ruolo + trigger). Questa suite
// valida lo stato live e vi applica sopra il delta 026 (idempotente), riproducendo
// esattamente il set di policy di produzione. NON ri-applica la 025 (fallirebbe:
// le sue policy esistono già).
const SQL_026 = readFileSync(join(ROOT, "supabase", "migrations", "026_fix_visite_select_returning.sql"), "utf8");

function dbUrl() {
  for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i < 0) continue;
    if (l.slice(0, i).trim() === "DATABASE_URL")
      return l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("no DATABASE_URL");
}
const u = new URL(dbUrl());
const c = new pg.Client({
  host: "aws-1-eu-central-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${REF}`,
  password: decodeURIComponent(u.password),
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? "  — " + extra : ""}`);
  if (ok) pass++; else fail++;
}

/** Esegue fn "come utente autenticato uid" (RLS enforced), poi ripristina superuser. */
async function asUser(uid, fn) {
  await c.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: uid, role: "authenticated" })}'`);
  await c.query(`SET LOCAL ROLE authenticated`);
  try {
    return await fn();
  } finally {
    await c.query(`RESET ROLE`);
  }
}
/** Emula il service role: nessun sub → auth.uid() NULL (trigger esenti, RLS bypass superuser). */
async function asService(fn) {
  await c.query(`SELECT set_config('request.jwt.claims', NULL, true)`);
  await c.query(`RESET ROLE`);
  return fn();
}
async function rowsAs(uid, sql, params = []) {
  return asUser(uid, async () => (await c.query(sql, params)).rowCount);
}
// Un errore SQL (RLS WITH CHECK / trigger EXCEPTION) aborta l'INTERA transazione
// (25P02). Un SAVEPOINT isola lo statement: in caso di errore si torna al
// savepoint e la transazione resta usabile.
let spN = 0;
async function sp(fn) {
  const name = `sp_${++spN}`;
  await c.query(`SAVEPOINT ${name}`);
  try {
    const r = await fn();
    await c.query(`RELEASE SAVEPOINT ${name}`);
    return { ok: true, value: r };
  } catch (e) {
    await c.query(`ROLLBACK TO SAVEPOINT ${name}`);
    await c.query(`RELEASE SAVEPOINT ${name}`);
    return { ok: false, error: e };
  }
}
/** true se lo statement lancia (RLS/trigger violation), transazione preservata. */
async function throwsAs(uid, sql, params = []) {
  return asUser(uid, async () => !(await sp(() => c.query(sql, params))).ok);
}

// Replica ESATTA della collegaSlot TS (due UPDATE guardate), RLS enforced come uid.
async function collegaSlotAs(uid, slotId, visitaId, creatorId) {
  return asUser(uid, async () => {
    const p = await c.query(
      `UPDATE public.visite_pianificate
       SET visita_id=$2, tecnico_assegnato_id=$3, tecnico_personalizzato=true
       WHERE id=$1 AND visita_id IS NULL AND tecnico_assegnato_id IS NULL AND stato<>'eseguita'
       RETURNING id`, [slotId, visitaId, creatorId]);
    if (p.rowCount > 0) return { linked: true, path: "presa" };
    const a = await c.query(
      `UPDATE public.visite_pianificate SET visita_id=$2
       WHERE id=$1 AND visita_id IS NULL AND stato<>'eseguita' RETURNING id`, [slotId, visitaId]);
    return { linked: a.rowCount > 0, path: "assegnato" };
  });
}

async function creaVisita(sedeId, clienteId, specialistId, stato = "bozza") {
  const r = await c.query(
    `INSERT INTO public.visite (sede_id, cliente_id, specialist_id, template_snapshot, data_visita, stato)
     VALUES ($1,$2,$3,'{}'::jsonb, CURRENT_DATE, $4) RETURNING id`,
    [sedeId, clienteId, specialistId, stato]);
  return r.rows[0].id;
}
async function creaSlot(pianoId, sedeId, ciclo, numero, tecnico, visitaId = null, stato = "da_pianificare") {
  const r = await c.query(
    `INSERT INTO public.visite_pianificate
       (piano_id, sede_id, numero_visita, ciclo_numero, data_suggerita, stato, visita_id, tecnico_assegnato_id, tecnico_personalizzato)
     VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,false) RETURNING id`,
    [pianoId, sedeId, numero, ciclo, stato, visitaId, tecnico]);
  return r.rows[0].id;
}

await c.connect();
try {
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims', NULL, true)`);

  // ── Stato prod (025 già live) + delta 026 nella transazione ──
  await c.query(SQL_026);
  console.log("Stato prod (025 live) + migration 026 applicata in transazione.\n");

  // ── Attori reali ──
  const A = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0]?.id;
  const PL = (await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local' LIMIT 1`)).rows[0]?.id;
  const T = (await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local' LIMIT 1`)).rows[0]?.id;
  // "Altro utente" proprietario di una visita che T non deve vedere: un utente
  // attivo qualsiasi diverso da T (dopo la promozione dell'account reale ad admin,
  // tecnico.test è l'unico specialist → O può essere admin/planner, è indifferente
  // ai fini della prova "visita altrui / slot-assegnato-cross-owner").
  const O = (await c.query(
    `SELECT id FROM public.utenti WHERE attivo=true AND id NOT IN ($1,$2,$3) LIMIT 1`, [T, A, PL])).rows[0]?.id
    ?? (await c.query(`SELECT id FROM public.utenti WHERE attivo=true AND id<>$1 LIMIT 1`, [T])).rows[0]?.id;
  if (!A || !PL || !T || !O) {
    console.log(`⚠️  Attori mancanti: admin=${!!A} planner=${!!PL} tecnico=${!!T} altro-tecnico=${!!O}`);
    await c.query("ROLLBACK"); process.exit(1);
  }
  // O deve fare da "altro tecnico" NON privilegiato: dopo la promozione ad admin
  // dell'account reale, non esiste un secondo specialist reale → demoto O a
  // specialist SOLO nella transazione (service role, esente dal trigger; rolled-back).
  await asService(() => c.query(`UPDATE public.utenti SET ruolo='specialist' WHERE id=$1`, [O]));

  // ── Piano/sede/cliente + un secondo cliente NON raggiungibile dal tecnico ──
  const piano = (await c.query(
    `SELECT pv.id, pv.sede_id, s.cliente_id, pv.ciclo_corrente
     FROM public.piani_visite pv JOIN public.sedi s ON s.id=pv.sede_id LIMIT 1`)).rows[0];
  const { id: P, sede_id: S, cliente_id: C, ciclo_corrente: K } = piano;
  const totClienti = (await c.query(`SELECT count(*)::int n FROM public.clienti WHERE attivo=true`)).rows[0].n;
  const C2 = (await c.query(`SELECT id FROM public.clienti WHERE attivo=true AND id<>$1 LIMIT 1`, [C])).rows[0]?.id;

  // ── Dati di test (superuser, claims azzerati) ──
  const VT = await creaVisita(S, C, T);   // visita propria del tecnico (raggiungibile)
  const VO = await creaVisita(S, C, O);   // visita di un ALTRO tecnico
  const VLINK1 = await creaVisita(S, C, T);
  const VLINK2 = await creaVisita(S, C, T);
  const VLINK3 = await creaVisita(S, C, T);
  const VDEL = await creaVisita(S, C, T); // per test delete
  const slotMine = await creaSlot(P, S, K, 901, T);
  const slotUnassign = await creaSlot(P, S, K, 902, null);
  const slotOther = await creaSlot(P, S, K, 903, O);
  const slotOccupied = await creaSlot(P, S, K, 904, T, VT);
  const slotEseguita = await creaSlot(P, S, K, 905, T, null, "eseguita");
  const slotDisatt = await creaSlot(P, S, K, 906, null);   // per test tecnico disattivato
  const VLINK_DIS = await creaVisita(S, C, T);
  const R = (await c.query(
    `INSERT INTO public.risposte (visita_id, domanda_id, sezione_id, valore) VALUES ($1,'D-01-001','SEZ-01','C') RETURNING id`, [VT])).rows[0].id;
  const R2 = (await c.query(
    `INSERT INTO public.risposte (visita_id, domanda_id, sezione_id, valore) VALUES ($1,'D-01-002','SEZ-01','C') RETURNING id`, [VT])).rows[0].id;
  const VB = (await c.query(
    `INSERT INTO public.verbali_pdf (visita_id, storage_path, sha256_hash) VALUES ($1,'x/y.pdf','deadbeef') RETURNING id`, [VT])).rows[0].id;

  // ══════════════════════ SELECT SCOPING ══════════════════════
  check("BASE: admin vede TUTTI i clienti", await asUser(A, async () =>
    (await c.query(`SELECT count(*)::int n FROM public.clienti WHERE attivo=true`)).rows[0].n) === totClienti);
  check("BASE: planner vede TUTTI i clienti", await asUser(PL, async () =>
    (await c.query(`SELECT count(*)::int n FROM public.clienti WHERE attivo=true`)).rows[0].n) === totClienti);

  const tecClienti = await asUser(T, async () =>
    (await c.query(`SELECT count(*)::int n FROM public.clienti WHERE attivo=true`)).rows[0].n);
  check("SCOPE: tecnico vede SOLO i clienti raggiungibili (< totale)", tecClienti < totClienti, `tec=${tecClienti} tot=${totClienti}`);
  check("SCOPE: tecnico vede il proprio cliente C", await rowsAs(T, `SELECT 1 FROM public.clienti WHERE id=$1`, [C]) === 1);
  if (C2) check("SCOPE: tecnico NON vede un cliente non raggiungibile", await rowsAs(T, `SELECT 1 FROM public.clienti WHERE id=$1`, [C2]) === 0);
  check("SCOPE: tecnico vede la propria sede", await rowsAs(T, `SELECT 1 FROM public.sedi WHERE id=$1`, [S]) === 1);

  // ══════════════════════ VISITE ══════════════════════
  check("VISITE: tecnico NON vede visite altrui", await rowsAs(T, `SELECT 1 FROM public.visite WHERE id=$1`, [VO]) === 0);
  check("VISITE: tecnico vede la propria visita", await rowsAs(T, `SELECT 1 FROM public.visite WHERE id=$1`, [VT]) === 1);
  check("VISITE: planner LEGGE la visita del tecnico (supervisione)", await rowsAs(PL, `SELECT 1 FROM public.visite WHERE id=$1`, [VT]) === 1);
  check("VISITE: planner NON può aggiornare la visita del tecnico (own_or_admin)",
    await rowsAs(PL, `UPDATE public.visite SET note_conclusive='x' WHERE id=$1 RETURNING id`, [VT]) === 0);
  check("VISITE: planner NON può eliminare la visita del tecnico",
    await rowsAs(PL, `DELETE FROM public.visite WHERE id=$1 RETURNING id`, [VDEL]) === 0);
  check("VISITE: il tecnico PUÒ eliminare la propria visita (own)",
    await rowsAs(T, `DELETE FROM public.visite WHERE id=$1 RETURNING id`, [VDEL]) === 1);

  // ══════════════════════ INSERT/UPDATE...RETURNING sotto RLS — flusso reale creaVisita ══════════════════════
  // Gap che ha bucato il test 025 e il primo test visivo: .insert().select() e
  // .update().select() passano ANCHE dalla policy SELECT sulla riga del RETURNING.
  const mkVisita = (uid) => asUser(uid, () => sp(async () =>
    (await c.query(`INSERT INTO public.visite (sede_id, cliente_id, specialist_id, template_snapshot, data_visita, stato)
       VALUES ($1,$2,$3,'{}'::jsonb, CURRENT_DATE, 'bozza') RETURNING id`, [S, C, uid])).rows[0].id));
  const insT = await mkVisita(T);
  check("RETURNING: tecnico crea la propria visita (INSERT...RETURNING)", insT.ok, insT.ok ? "" : insT.error?.code);
  check("RETURNING: admin crea visita (INSERT...RETURNING)", (await mkVisita(A)).ok);
  check("RETURNING: planner crea visita (INSERT...RETURNING)", (await mkVisita(PL)).ok);

  if (insT.ok) {
    const vNew = insT.value;
    const slotFree = await creaSlot(P, S, K, 910, null);            // slot "Da assegnare"
    const link = await collegaSlotAs(T, slotFree, vNew, T);         // UPDATE...RETURNING
    check("RETURNING: collegaSlot presa in carico (UPDATE...RETURNING) del tecnico", link.linked && link.path === "presa");
    const apri = await asUser(T, async () => (await c.query(
      `SELECT v.id, cl.ragione_sociale, s.nome, us.nome_completo
       FROM public.visite v
       LEFT JOIN public.clienti cl ON cl.id=v.cliente_id
       LEFT JOIN public.sedi s ON s.id=v.sede_id
       LEFT JOIN public.utenti us ON us.id=v.specialist_id
       WHERE v.id=$1`, [vNew])).rows[0]);
    check("RETURNING: tecnico APRE la visita (getVisitaById JOIN cliente+sede+utente)",
      !!apri && !!apri.ragione_sociale && !!apri.nome && !!apri.nome_completo);
  }

  // Slot assegnato a T su visita di ALTRO utente → T la legge (scope 025 preservato dalla 026).
  const VO2 = await creaVisita(S, C, O);
  check("SLOT-READ control: T NON vede la visita altrui PRIMA del link",
    await rowsAs(T, `SELECT 1 FROM public.visite WHERE id=$1`, [VO2]) === 0);
  await creaSlot(P, S, K, 911, T, VO2);                            // slot di T collegato a VO2
  check("SLOT-READ: T LEGGE la visita altrui perché collegata a uno slot a lui assegnato",
    await rowsAs(T, `SELECT 1 FROM public.visite WHERE id=$1`, [VO2]) === 1);

  // ══════════════════════ TABELLE FIGLIE (can_read_visita + own_or_admin) ══════════════════════
  check("RISPOSTE: planner legge le risposte della visita del tecnico", await rowsAs(PL, `SELECT 1 FROM public.risposte WHERE id=$1`, [R]) === 1);
  check("RISPOSTE: altro tecnico NON legge le risposte", await rowsAs(O, `SELECT 1 FROM public.risposte WHERE id=$1`, [R]) === 0);
  check("RISPOSTE: altro tecnico NON elimina (own_or_admin)", await rowsAs(O, `DELETE FROM public.risposte WHERE id=$1 RETURNING id`, [R2]) === 0);
  check("RISPOSTE: il tecnico proprietario elimina (P6.4 DELETE own)", await rowsAs(T, `DELETE FROM public.risposte WHERE id=$1 RETURNING id`, [R2]) === 1);
  check("VERBALI: planner legge il verbale del tecnico", await rowsAs(PL, `SELECT 1 FROM public.verbali_pdf WHERE id=$1`, [VB]) === 1);
  check("VERBALI: altro tecnico NON legge il verbale", await rowsAs(O, `SELECT 1 FROM public.verbali_pdf WHERE id=$1`, [VB]) === 0);
  check("VERBALI: altro tecnico NON aggiorna (P6.4 UPDATE own)", await rowsAs(O, `UPDATE public.verbali_pdf SET storage_path='z' WHERE id=$1 RETURNING id`, [VB]) === 0);
  check("VERBALI: il tecnico proprietario aggiorna", await rowsAs(T, `UPDATE public.verbali_pdf SET storage_path='z' WHERE id=$1 RETURNING id`, [VB]) === 1);

  // ══════════════════════ visite_pianificate INSERT ══════════════════════
  const vpInsert = `INSERT INTO public.visite_pianificate (piano_id, sede_id, numero_visita, ciclo_numero, data_suggerita, stato) VALUES ($1,$2,999,$3,CURRENT_DATE,'da_pianificare')`;
  check("SLOT-INSERT: tecnico NEGATO", await throwsAs(T, vpInsert, [P, S, K]) === true);
  check("SLOT-INSERT: planner CONSENTITO", await rowsAs(PL, vpInsert + " RETURNING id", [P, S, K]) === 1);
  check("SLOT-INSERT: admin CONSENTITO", await rowsAs(A, vpInsert + " RETURNING id", [P, S, K]) === 1);

  // ══════════════════════ AGGANCIO SLOT (P6.1, scenari 1-4) ══════════════════════
  const r1 = await collegaSlotAs(T, slotMine, VLINK1, T);
  const s1 = (await c.query(`SELECT visita_id, tecnico_assegnato_id t, tecnico_personalizzato p FROM public.visite_pianificate WHERE id=$1`, [slotMine])).rows[0];
  check("1. tecnico aggancia slot PROPRIO → 1 riga, tecnico/flag invariati", r1.linked && s1.visita_id === VLINK1 && s1.t === T && s1.p === false, `path=${r1.path} t=${s1.t} flag=${s1.p}`);

  const r2 = await collegaSlotAs(T, slotUnassign, VLINK2, T);
  const s2 = (await c.query(`SELECT visita_id, tecnico_assegnato_id t, tecnico_personalizzato p FROM public.visite_pianificate WHERE id=$1`, [slotUnassign])).rows[0];
  check("2. tecnico aggancia slot DA ASSEGNARE → presa in carico (tecnico=self, flag=true)",
    r2.linked && r2.path === "presa" && s2.visita_id === VLINK2 && s2.t === T && s2.p === true, `path=${r2.path} t=${s2.t} flag=${s2.p}`);

  const r3 = await collegaSlotAs(T, slotOther, VLINK3, T);
  const s3 = (await c.query(`SELECT visita_id, tecnico_assegnato_id t FROM public.visite_pianificate WHERE id=$1`, [slotOther])).rows[0];
  check("3. tecnico aggancia slot di ALTRO tecnico → 0 righe, slot intatto", !r3.linked && s3.visita_id === null && s3.t === O, `linked=${r3.linked}`);

  const occ = await asUser(T, async () => (await c.query(
    `UPDATE public.visite_pianificate SET visita_id=$2 WHERE id=$1 AND visita_id IS NULL AND stato<>'eseguita' RETURNING id`, [slotOccupied, VLINK3])).rowCount);
  check("4a. tecnico UPDATE su slot OCCUPATO (visita_id NOT NULL) → 0 righe", occ === 0);
  const ese = await asUser(T, async () => (await c.query(
    `UPDATE public.visite_pianificate SET data_pianificata=CURRENT_DATE WHERE id=$1 AND stato<>'eseguita' RETURNING id`, [slotEseguita])).rowCount);
  check("4b. tecnico UPDATE su slot ESEGUITO → 0 righe", ese === 0);

  // ══════════════════════ is_attivo() sull'aggancio: tecnico DISATTIVATO negato dalla RLS ══════════════════════
  await asService(async () => c.query(`UPDATE public.utenti SET attivo=false WHERE id=$1`, [T]));
  const rDis = await collegaSlotAs(T, slotDisatt, VLINK_DIS, T);
  const sDis = (await c.query(`SELECT visita_id, tecnico_assegnato_id t FROM public.visite_pianificate WHERE id=$1`, [slotDisatt])).rows[0];
  check("is_attivo(): tecnico DISATTIVATO NON aggancia lo slot (0 righe, non solo scope app)",
    !rDis.linked && sDis.visita_id === null && sDis.t === null, `linked=${rDis.linked}`);
  await asService(async () => c.query(`UPDATE public.utenti SET attivo=true WHERE id=$1`, [T]));

  // ══════════════════════ admin/planner UPDATE slot pieno (scenario 7) ══════════════════════
  check("7. planner riassegna/pianifica uno slot (UPDATE pieno)",
    await rowsAs(PL, `UPDATE public.visite_pianificate SET tecnico_assegnato_id=$2, data_pianificata=CURRENT_DATE, stato='pianificata' WHERE id=$1 RETURNING id`, [slotOther, T]) === 1);
  check("7. admin riassegna uno slot (UPDATE pieno)",
    await rowsAs(A, `UPDATE public.visite_pianificate SET tecnico_assegnato_id=$2 WHERE id=$1 RETURNING id`, [slotMine, O]) === 1);

  // ══════════════════════ TRIGGER anti-escalation (scenari 5-6) ══════════════════════
  check("5. tecnico tenta di promuoversi admin → ECCEZIONE",
    await throwsAs(T, `UPDATE public.utenti SET ruolo='admin' WHERE id=$1`, [T]) === true);
  check("5b. tecnico tenta di cambiare il proprio 'attivo' → ECCEZIONE",
    await throwsAs(T, `UPDATE public.utenti SET attivo=false WHERE id=$1`, [T]) === true);
  const svc = await asService(() => sp(async () => {
    await c.query(`UPDATE public.utenti SET attivo=false WHERE id=$1`, [T]);
    return (await c.query(`UPDATE public.utenti SET attivo=true WHERE id=$1 RETURNING id`, [T])).rowCount;
  }));
  check("6. service role (auth.uid NULL) cambia ruolo/attivo → CONSENTITO (esenzione)", svc.ok && svc.value === 1);
  const adm = await asUser(A, () => sp(async () =>
    (await c.query(`UPDATE public.utenti SET attivo=false WHERE id=$1 RETURNING id`, [O])).rowCount));
  await asService(() => c.query(`UPDATE public.utenti SET attivo=true WHERE id=$1`, [O]));
  check("6b. admin cambia 'attivo' di un altro utente → CONSENTITO", adm.ok && adm.value === 1);

  // ══════════════════════ Q4: attivo=false ⇒ nessun accesso ══════════════════════
  await asService(async () => c.query(`UPDATE public.utenti SET attivo=false WHERE id=$1`, [T]));
  check("Q4: tecnico DISATTIVATO non vede più il proprio cliente", await rowsAs(T, `SELECT 1 FROM public.clienti WHERE id=$1`, [C]) === 0);
  check("Q4: tecnico DISATTIVATO non vede più la propria visita", await rowsAs(T, `SELECT 1 FROM public.visite WHERE id=$1`, [VT]) === 0);
  await asService(async () => c.query(`UPDATE public.utenti SET attivo=true WHERE id=$1`, [T]));

  await asService(async () => c.query(`UPDATE public.utenti SET attivo=false WHERE id=$1`, [A]));
  check("Q4: admin DISATTIVATO perde is_admin() (non vede clienti non raggiungibili)",
    await rowsAs(A, `SELECT 1 FROM public.clienti WHERE id=$1`, [C2 ?? C]) === 0);
  await asService(async () => c.query(`UPDATE public.utenti SET attivo=true WHERE id=$1`, [A]));

  // ══════════════════════ Buchi chiusi: sedi DELETE (P6.4) ══════════════════════
  check("SEDI-DEL: tecnico NON elimina la sede", await rowsAs(T, `DELETE FROM public.sedi WHERE id=$1 RETURNING id`, [S]) === 0);
  check("SEDI-DEL: planner NON elimina la sede", await rowsAs(PL, `DELETE FROM public.sedi WHERE id=$1 RETURNING id`, [S]) === 0);
  // admin: la policy ora esiste (buco deny-all chiuso). Verifica su una sede fittizia (nessun cascade reale).
  const admDelPolicy = await asUser(A, async () =>
    (await c.query(`SELECT count(*)::int n FROM pg_policies WHERE tablename='sedi' AND cmd='DELETE'`)).rows[0].n);
  check("SEDI-DEL: policy DELETE per admin ora ESISTE (buco chiuso)", admDelPolicy === 1);

  // ══════════════════════ Account reale promosso ad admin → scrive su clienti/sedi/piani ══════════════════════
  // Simula la sequenza di apply: O (= email-reale@studio.it, oggi specialist) viene
  // promosso ad admin PRIMA della 025; sotto la 025 deve poter creare anagrafiche/piani.
  const realEmail = (await c.query(`SELECT email FROM public.utenti WHERE id=$1`, [O])).rows[0].email;
  await asService(async () => c.query(`UPDATE public.utenti SET ruolo='admin' WHERE id=$1`, [O]));

  const insCli = await asUser(O, () => sp(async () =>
    (await c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('RBAC Test Srl') RETURNING id`)).rows[0].id));
  check(`account reale (${realEmail}) promosso admin: INSERT clienti OK`, insCli.ok && !!insCli.value);

  let insSede = { ok: false }, insPiano = { ok: false };
  if (insCli.ok) {
    insSede = await asUser(O, () => sp(async () =>
      (await c.query(`INSERT INTO public.sedi (cliente_id, nome, indirizzo, citta) VALUES ($1,'Sede RBAC','Via Test 1','Bari') RETURNING id`, [insCli.value])).rows[0].id));
    check("account reale promosso admin: INSERT sedi OK", insSede.ok && !!insSede.value);

    if (insSede.ok) {
      insPiano = await asUser(O, () => sp(async () =>
        (await c.query(`INSERT INTO public.piani_visite (sede_id, data_inizio_ciclo, visite_anno) VALUES ($1, CURRENT_DATE, 2) RETURNING id`, [insSede.value])).rowCount));
      check("account reale promosso admin: INSERT piani_visite OK", insPiano.ok && insPiano.value === 1);
    }
    check("account reale promosso admin: UPDATE clienti OK", (await asUser(O, () => sp(async () =>
      (await c.query(`UPDATE public.clienti SET note='ok' WHERE id=$1 RETURNING id`, [insCli.value])).rowCount))).value === 1);
  }
  await asService(async () => c.query(`UPDATE public.utenti SET ruolo='specialist' WHERE id=$1`, [O]));

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  console.log("ROLLBACK eseguito — nessuna modifica persistita.");
}
process.exit(fail === 0 ? 0 : 1);
