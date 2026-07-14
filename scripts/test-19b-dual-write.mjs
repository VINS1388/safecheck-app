/**
 * Test Sprint 19.B — dual-write applicativo `organizzazione_membri`.
 *
 * Esercita IL CODICE REALE del Core (creaUtenteCore/cambiaRuoloCore/
 * impostaAttivoCore/orgIdChiamante da @/lib/server/organizzazione-core) contro il
 * Supabase reale, con un utente USA-E-GETTA fittizio e cleanup garantito in
 * `finally`. Verifica i 5 effetti attesi (creazione, cambio ruolo, sospensione,
 * riattivazione, cascade su delete fisico).
 *
 * Il Core è importabile da Node perché NON ha `import "server-only"`; le funzioni
 * ricevono il client service-role e il `chiamanteId` (un admin reale già attivo)
 * come parametri — nessun contesto di request Next necessario.
 *
 * Uso:
 *   node --experimental-strip-types --experimental-loader ./scripts/alias-hook.mjs scripts/test-19b-dual-write.mjs
 *
 * NON tocca gli utenti fixture (tecnico.test@safecheck.local /
 * planner.test@safecheck.local) né alcun dato reale del cliente: crea ed elimina
 * solo il proprio utente di test.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  creaUtenteCore,
  cambiaRuoloCore,
  impostaAttivoCore,
  orgIdChiamante,
} from "@/lib/server/organizzazione-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
function env(name) {
  for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i < 0) continue;
    if (l.slice(0, i).trim() === name) return l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(`env mancante: ${name}`);
}
const URL_SB = env("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(URL_SB, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0, fail = 0;
function ck(n, ok, x = "") {
  console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`);
  if (ok) pass++; else fail++;
}

// Service role bypassa la RLS deny-all su organizzazione_membri.
async function membership(uid) {
  const { data, error } = await admin
    .from("organizzazione_membri")
    .select("organization_id, ruolo, stato")
    .eq("user_id", uid);
  if (error) throw new Error("lettura organizzazione_membri fallita: " + error.message);
  return data ?? [];
}

const ts = Date.now();
const email = `test-19b-${ts}@safecheck.local`;
const nome = `Test 19B ${ts}`;
let uid = null;

try {
  // Chiamante: un admin reale ESISTENTE e attivo (non ne creiamo uno).
  const { data: adminRow, error: aErr } = await admin
    .from("utenti")
    .select("id")
    .eq("ruolo", "admin")
    .eq("attivo", true)
    .limit(1)
    .single();
  if (aErr || !adminRow) throw new Error("Nessun admin attivo per il chiamante: " + (aErr?.message ?? ""));
  const chiamanteId = adminRow.id;
  const orgAttesa = await orgIdChiamante(admin, chiamanteId);
  console.log(`chiamante=${chiamanteId}  org=${orgAttesa}  test-user=${email}\n`);

  // 1 — creaUtenteCore → esattamente 1 membership, org+ruolo+stato corretti
  const { utente } = await creaUtenteCore(admin, chiamanteId, { nome, email, ruolo: "specialist" });
  uid = utente.id;
  const m1 = await membership(uid);
  ck(
    "1. creaUtenteCore → 1 riga membership (org=chiamante, ruolo=specialist, stato=attivo)",
    m1.length === 1 &&
      m1[0].organization_id === orgAttesa &&
      m1[0].ruolo === "specialist" &&
      m1[0].stato === "attivo",
    `righe=${m1.length} org_ok=${m1[0]?.organization_id === orgAttesa} ruolo=${m1[0]?.ruolo} stato=${m1[0]?.stato}`
  );

  // 2 — cambiaRuoloCore → membership.ruolo allineato
  await cambiaRuoloCore(admin, uid, "planner");
  const m2 = await membership(uid);
  ck("2. cambiaRuoloCore('planner') → membership.ruolo allineato", m2.length === 1 && m2[0].ruolo === "planner", `ruolo=${m2[0]?.ruolo}`);

  // 3 — impostaAttivoCore(false) → stato='sospeso'
  await impostaAttivoCore(admin, uid, false);
  const m3 = await membership(uid);
  ck("3. impostaAttivoCore(false) → membership.stato='sospeso'", m3.length === 1 && m3[0].stato === "sospeso", `stato=${m3[0]?.stato}`);

  // 4 — impostaAttivoCore(true) → stato='attivo'
  await impostaAttivoCore(admin, uid, true);
  const m4 = await membership(uid);
  ck("4. impostaAttivoCore(true) → membership.stato='attivo'", m4.length === 1 && m4[0].stato === "attivo", `stato=${m4[0]?.stato}`);

  // 5 — delete fisico → membership sparita (cascade) + utenti rimosso
  const { error: dErr } = await admin.auth.admin.deleteUser(uid);
  if (dErr) throw new Error("deleteUser fallito: " + dErr.message);
  const m5 = await membership(uid);
  const { data: uRow } = await admin.from("utenti").select("id").eq("id", uid);
  ck(
    "5. delete fisico → membership sparita (cascade FK) + riga utenti rimossa",
    m5.length === 0 && (uRow ?? []).length === 0,
    `membership=${m5.length} utenti=${(uRow ?? []).length}`
  );
  uid = null; // già eliminato: niente cleanup
} catch (e) {
  console.error("ERRORE:", e instanceof Error ? e.message : e);
  fail++;
} finally {
  if (uid) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    console.log(`cleanup: utente di test ${uid} rimosso`);
  }
  console.log(`\n${pass} passati, ${fail} falliti`);
  process.exit(fail === 0 ? 0 : 1);
}
