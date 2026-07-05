/**
 * STEP A+B della sequenza di apply Sprint 16 (parte 2).
 *
 *   a. Promuove l'account reale a 'admin' PRIMA della migration 025 (sotto le
 *      policy attuali permissive: nessun trigger anti-escalation ancora attivo).
 *   b. Verifica che il ruolo sia effettivamente 'admin'.
 *
 * PERSISTE su prod. Da eseguire SOLO dopo conferma esplicita di Vincenzo.
 * Idempotente. Uso: node scripts/apply-025-step-a-promote.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const EMAIL = "email-reale@studio.it";

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

await c.connect();
try {
  const before = (await c.query(`SELECT id, ruolo, attivo FROM public.utenti WHERE email=$1`, [EMAIL])).rows[0];
  if (!before) throw new Error(`Account ${EMAIL} inesistente.`);
  console.log(`PRIMA:  ${EMAIL} → ruolo=${before.ruolo} attivo=${before.attivo}`);

  await c.query(`UPDATE public.utenti SET ruolo='admin' WHERE email=$1 AND ruolo<>'admin'`, [EMAIL]);

  const after = (await c.query(`SELECT ruolo, attivo FROM public.utenti WHERE email=$1`, [EMAIL])).rows[0];
  console.log(`DOPO:   ${EMAIL} → ruolo=${after.ruolo} attivo=${after.attivo}`);
  console.log(after.ruolo === "admin" ? "\n✓ STEP A/B OK: ruolo = admin" : "\n✗ STEP A/B FALLITO");
  process.exit(after.ruolo === "admin" ? 0 : 1);
} finally {
  await c.end();
}
