/**
 * Crea (idempotente) il bucket privato "verbali" su Supabase Storage.
 *
 * - Legge SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY da .env.local
 * - Bucket: public=false, solo application/pdf, max 10MB
 * - Se il bucket esiste già, non fa nulla (nessun errore)
 *
 * Uso: node scripts/setup-storage.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BUCKET = "verbali";

function loadEnv() {
  const env = {};
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error("Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: esistenti, error: listErr } =
    await supabase.storage.listBuckets();
  if (listErr) throw listErr;

  if (esistenti.some((b) => b.name === BUCKET)) {
    console.log(`Bucket "${BUCKET}" già presente — nessuna azione.`);
    return;
  }

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    allowedMimeTypes: ["application/pdf"],
    fileSizeLimit: "10MB",
  });
  if (error) throw error;

  // Verifica
  const { data: check, error: getErr } =
    await supabase.storage.getBucket(BUCKET);
  if (getErr) throw getErr;

  console.log(`✓ Bucket "${BUCKET}" creato.`);
  console.log(`  public: ${check.public}`);
  console.log(`  allowedMimeTypes: ${check.allowed_mime_types}`);
  console.log(`  fileSizeLimit: ${check.file_size_limit}`);
}

main().catch((e) => {
  console.error("✗ ERRORE:", e.message || e);
  process.exit(1);
});
