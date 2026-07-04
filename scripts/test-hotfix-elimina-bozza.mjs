/**
 * HOTFIX — Eliminazione bozza. Test in BEGIN…ROLLBACK con RLS ENFORCED
 * (SET ROLE authenticated + request.jwt.claims), non da superuser: è l'unico
 * modo per riprodurre il root cause (policy DELETE mancante = deny silenzioso).
 *
 * Scenari:
 *   0. Root cause: senza policy DELETE, un DELETE come utente autenticato tocca
 *      0 righe (deny silenzioso, nessun errore).
 *   A. Con migration 023: l'utente proprietario elimina la propria bozza → 1 riga.
 *   B. Criterio allineato: bozza con stato='in_corso' ma numero_verbale IS NULL
 *      → eliminabile (il vecchio guard stato='bozza' l'avrebbe rifiutata).
 *   C. Verbale CHIUSO (numero_verbale valorizzato) → guard nega (0 righe).
 *   D. Non proprietario → RLS nega (0 righe) [own_or_admin].
 *   E. Compensating delete (bozza vergine collegata a slot) → elimina + slot
 *      svincolato via FK ON DELETE SET NULL.
 *
 * Uso: node scripts/test-hotfix-elimina-bozza.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_023 = readFileSync(join(ROOT, "supabase", "migrations", "023_visite_delete_policy.sql"), "utf8");

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

// Esegue una funzione "come utente autenticato X" (RLS enforced), poi ripristina superuser.
async function asUser(uid, fn) {
  await c.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: uid, role: "authenticated" })}'`);
  await c.query(`SET LOCAL ROLE authenticated`);
  try {
    return await fn();
  } finally {
    await c.query(`RESET ROLE`);
  }
}
// Replica del DELETE dell'app (guard numero_verbale IS NULL + RETURNING). Ritorna n righe.
async function deleteBozza(id) {
  const r = await c.query(
    `DELETE FROM public.visite WHERE id=$1 AND numero_verbale IS NULL RETURNING id`,
    [id]
  );
  return r.rowCount;
}

await c.connect();
try {
  await c.query("BEGIN");

  const owner = "0660b18e-0df8-4b9a-a158-0647b6609356"; // specialist reale
  const sede = (await c.query(`SELECT id, cliente_id FROM public.sedi LIMIT 1`)).rows[0];

  async function nuovaBozza(specialist = owner, stato = "bozza", numero = null) {
    const r = await c.query(
      `INSERT INTO public.visite (sede_id, cliente_id, specialist_id, template_snapshot, data_visita, stato, numero_verbale, stato_verbale)
       VALUES ($1,$2,$3,'{}'::jsonb, CURRENT_DATE, $4, $5, $6) RETURNING id`,
      [sede.id, sede.cliente_id, specialist, stato, numero, numero ? "chiuso" : null]
    );
    return r.rows[0].id;
  }

  // Simula lo stato PRE-FIX: la migration 023 è ormai permanente in prod, quindi
  // per riprodurre il bug (policy DELETE assente) la rimuovo nella transazione
  // (rolled back → prod invariata). Poi la 023 la ri-crea.
  await c.query(`DROP POLICY IF EXISTS "visite_delete_own_or_admin" ON public.visite`);

  // ── 0. Root cause: SENZA policy DELETE → deny silenzioso ──
  const bRoot = await nuovaBozza();
  const nRoot = await asUser(owner, () => deleteBozza(bRoot));
  check("0. ROOT CAUSE: senza policy DELETE, l'utente autenticato tocca 0 righe (deny silenzioso)", nRoot === 0, `righe=${nRoot}`);
  const rootAncora = (await c.query(`SELECT count(*)::int n FROM public.visite WHERE id=$1`, [bRoot])).rows[0].n;
  check("0. ROOT CAUSE: la bozza è ancora lì (conferma il sintomo prod)", rootAncora === 1);

  // ── Applica migration 023 ──
  await c.query(SQL_023);
  console.log("… migration 023 applicata (policy DELETE own_or_admin)\n");

  // ── A. Proprietario elimina la propria bozza ──
  const nA = await asUser(owner, () => deleteBozza(bRoot));
  check("A. Con 023: il proprietario elimina la propria bozza → 1 riga", nA === 1, `righe=${nA}`);

  // ── B. Criterio allineato: stato='in_corso' + numero_verbale NULL → eliminabile ──
  const bInCorso = await nuovaBozza(owner, "in_corso", null);
  const nB = await asUser(owner, () => deleteBozza(bInCorso));
  check("B. Bozza con stato='in_corso' (numero_verbale NULL) è eliminabile (guard allineato)", nB === 1, `righe=${nB}`);

  // ── C. Verbale CHIUSO (numero_verbale valorizzato) → guard nega ──
  const chiuso = await nuovaBozza(owner, "verbale_generato", "SC-TEST-9999");
  const nC = await asUser(owner, () => deleteBozza(chiuso));
  check("C. Verbale chiuso NON eliminabile (guard numero_verbale IS NULL → 0 righe)", nC === 0, `righe=${nC}`);
  await c.query(`DELETE FROM public.visite WHERE id=$1`, [chiuso]); // cleanup (superuser)

  // ── D. Non proprietario → RLS nega ──
  const bAltrui = await nuovaBozza(owner);
  const fake = "11111111-2222-3333-4444-555555555555";
  const nD = await asUser(fake, () => deleteBozza(bAltrui));
  check("D. Non proprietario: RLS nega (0 righe)", nD === 0, `righe=${nD}`);
  const altruiAncora = (await c.query(`SELECT count(*)::int n FROM public.visite WHERE id=$1`, [bAltrui])).rows[0].n;
  check("D. La bozza altrui è intatta", altruiAncora === 1);
  await c.query(`DELETE FROM public.visite WHERE id=$1`, [bAltrui]);

  // ── E. Compensating delete: bozza vergine collegata a slot → svincolo FK ──
  const slot = (await c.query(
    `SELECT vp.id FROM public.visite_pianificate vp WHERE vp.sede_id=$1 AND vp.visita_id IS NULL AND vp.stato<>'eseguita' LIMIT 1`,
    [sede.id]
  )).rows[0];
  if (slot) {
    const bComp = await nuovaBozza(owner);
    await c.query(`UPDATE public.visite_pianificate SET visita_id=$1 WHERE id=$2`, [bComp, slot.id]);
    const nE = await asUser(owner, () => deleteBozza(bComp)); // compensating delete come creatore
    const slotDopo = (await c.query(`SELECT visita_id, stato FROM public.visite_pianificate WHERE id=$1`, [slot.id])).rows[0];
    check("E. Compensating delete: bozza vergine eliminata (1 riga)", nE === 1, `righe=${nE}`);
    check("E. Slot svincolato via FK ON DELETE SET NULL, stato coerente", slotDopo.visita_id === null && slotDopo.stato !== "eseguita", `visita_id=${slotDopo.visita_id} stato=${slotDopo.stato}`);
  } else {
    console.log("… (scenario E saltato: nessuno slot libero sulla sede di test)");
  }

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  console.log("ROLLBACK eseguito — nessuna modifica persistita.");
}
process.exit(fail === 0 ? 0 : 1);
