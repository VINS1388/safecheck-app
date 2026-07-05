/**
 * STEP C+D della sequenza di apply Sprint 16 (parte 2).
 *
 *   c. Applica la migration 025 (helper + policy + trigger) su prod, ATOMICA
 *      (batch statement unico → transazione implicita all-or-nothing).
 *   d. Verifica post-apply: helper presenti, trigger presente, policy chiave
 *      attive, e — in una transazione ROLLBACK-ata (nessuna scrittura persiste) —
 *      che l'account reale (ora admin) scriva su clienti/sedi senza errori.
 *
 * PRECONDIZIONE: step A (promozione account reale ad admin) già eseguito.
 * PERSISTE su prod (la sola 025; la verifica d è rolled-back). Da eseguire SOLO
 * dopo conferma esplicita di Vincenzo.
 * Uso: node scripts/apply-025-step-c-migration.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const EMAIL = "email-reale@studio.it";
const SQL_025 = readFileSync(join(ROOT, "supabase", "migrations", "025_sprint16_rbac_policies.sql"), "utf8");

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

let ok = true;
function must(name, cond, extra = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  — " + extra : ""}`);
  if (!cond) ok = false;
}

await c.connect();
try {
  // Precondizione: account reale già admin.
  const real = (await c.query(`SELECT id, ruolo FROM public.utenti WHERE email=$1`, [EMAIL])).rows[0];
  if (!real || real.ruolo !== "admin") {
    console.log(`✗ PRECONDIZIONE FALLITA: ${EMAIL} ruolo=${real?.ruolo ?? "assente"} (atteso admin). Eseguire prima lo step A.`);
    process.exit(1);
  }

  // ── c. Apply 025 (atomico) ──
  await c.query(SQL_025);
  console.log("✓ Migration 025 applicata.\n");

  // ── d. Verifiche post-apply ──
  const fns = ["is_admin", "is_attivo", "is_planner", "is_admin_or_planner", "can_access_sede", "can_access_cliente", "can_read_visita"];
  const present = (await c.query(
    `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND proname=ANY($1)`, [fns])).rows.map(r => r.proname);
  must(`helper presenti (${present.length}/${fns.length})`, present.length === fns.length, present.join(", "));

  const trg = (await c.query(
    `SELECT 1 FROM pg_trigger t JOIN pg_class cl ON cl.oid=t.tgrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
     WHERE n.nspname='public' AND cl.relname='utenti' AND t.tgname='trg_utenti_anti_escalation' AND NOT t.tgisinternal`)).rowCount;
  must("trigger trg_utenti_anti_escalation presente su utenti", trg === 1);

  const checkPol = async (tbl, name) =>
    (await c.query(`SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=$1 AND policyname=$2`, [tbl, name])).rowCount === 1;
  must("policy clienti_select_scope", await checkPol("clienti", "clienti_select_scope"));
  must("policy sedi_delete_admin (buco chiuso)", await checkPol("sedi", "sedi_delete_admin"));
  must("policy visite_select_scope", await checkPol("visite", "visite_select_scope"));
  must("policy vp_update_tecnico_aggancio", await checkPol("visite_pianificate", "vp_update_tecnico_aggancio"));
  must("policy risposte_delete_via_visita (P6.4)", await checkPol("risposte", "risposte_delete_via_visita"));
  must("policy verbali_update_via_visita (P6.4)", await checkPol("verbali_pdf", "verbali_update_via_visita"));

  // d. account reale (admin) scrive su clienti/sedi — in transazione ROLLBACK-ata.
  await c.query("BEGIN");
  try {
    await c.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: real.id, role: "authenticated" })}'`);
    await c.query(`SET LOCAL ROLE authenticated`);
    const cli = (await c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('POST-APPLY probe') RETURNING id`)).rows[0].id;
    const sede = (await c.query(`INSERT INTO public.sedi (cliente_id, nome, indirizzo, citta) VALUES ($1,'probe','x','Bari') RETURNING id`, [cli])).rowCount;
    await c.query(`RESET ROLE`);
    must("account reale (admin) scrive su clienti/sedi senza errori (rolled-back)", !!cli && sede === 1);
  } catch (e) {
    await c.query(`RESET ROLE`).catch(() => {});
    must("account reale (admin) scrive su clienti/sedi senza errori (rolled-back)", false, e.message);
  } finally {
    await c.query("ROLLBACK");
  }

  console.log(ok ? "\n✓ STEP C/D OK" : "\n✗ STEP C/D con problemi");
  process.exit(ok ? 0 : 1);
} finally {
  await c.end();
}
