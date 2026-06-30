/**
 * Seed dati di test per il CRUD clienti/sedi (micro-sprint CRUD-RECOVER).
 *
 * - Legge URL e SERVICE_ROLE_KEY da .env.local (service role: bypassa la RLS)
 * - Se la tabella clienti è VUOTA, inserisce 2 clienti fittizi con 2 sedi ciascuno
 * - Idempotente: se esistono già clienti, non fa nulla
 *
 * Dati esclusivamente fittizi (regola CLAUDE.md — niente dati reali).
 *
 * Uso: node scripts/seed-test-crud.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

const CLIENTI = [
  {
    ragione_sociale: "Pane Pizza Srl",
    partita_iva: "01234567890",
    citta: "Roma",
    provincia: "RM",
    indirizzo_sede_legale: "Via dei Forni 10",
    referente_principale: "Mario Bianchi",
    email_referente: "mario.bianchi@panepizza.test",
    sedi: [
      { nome: "Sede principale", indirizzo: "Via dei Forni 10", citta: "Roma", cap: "00185", provincia: "RM" },
      { nome: "Punto vendita Tuscolano", indirizzo: "Via Tuscolana 250", citta: "Roma", cap: "00181", provincia: "RM" },
    ],
  },
  {
    ragione_sociale: "Bella Costruzioni Srl",
    partita_iva: "09876543210",
    citta: "Milano",
    provincia: "MI",
    indirizzo_sede_legale: "Viale del Cantiere 5",
    referente_principale: "Giulia Verdi",
    email_referente: "giulia.verdi@bellacostruzioni.test",
    sedi: [
      { nome: "Cantiere Nord", indirizzo: "Via Bovisa 3", citta: "Milano", cap: "20158", provincia: "MI" },
      { nome: "Magazzino Sud", indirizzo: "Via Ripamonti 120", citta: "Milano", cap: "20141", provincia: "MI" },
    ],
  },
];

async function main() {
  const { count, error: countErr } = await supabase
    .from("clienti")
    .select("id", { count: "exact", head: true });

  if (countErr) throw countErr;

  if ((count ?? 0) > 0) {
    console.log(`Tabella clienti già popolata (${count} clienti) — nessun seed eseguito.`);
    return;
  }

  for (const c of CLIENTI) {
    const { sedi, ...cliente } = c;
    const { data: inserito, error: errC } = await supabase
      .from("clienti")
      .insert(cliente)
      .select("id")
      .single();
    if (errC) throw errC;

    const righe = sedi.map((s) => ({ ...s, cliente_id: inserito.id }));
    const { error: errS } = await supabase.from("sedi").insert(righe);
    if (errS) throw errS;

    console.log(`✓ ${cliente.ragione_sociale} (${sedi.length} sedi)`);
  }

  console.log("\n✓ Seed completato:", CLIENTI.length, "clienti.");
}

main().catch((e) => {
  console.error("\n✗ ERRORE:", e.message || e);
  process.exit(1);
});
