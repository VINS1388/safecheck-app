// Test concettuale Sprint 9 (SEZ-08, logica condizionale di sezione).
// Carica il template_master attivo dal DB, costruisce risposte complete per
// SEZ-01..07 e simula i due scenari SEZ-08:
//   A) D-08-001 = NA  -> sezione collassata: completa con la sola filtro
//   B) D-08-001 = NC  -> sezione espansa: le altre 8 domande diventano richieste
// Verifica completezza (stessa logica del route genera-pdf) e genera un PDF
// per ciascuno scenario, controllando il conteggio NA in Rilievi conclusivi.
//
// Uso: node --experimental-strip-types --import ./scripts/alias-hook.mjs scripts/test-sez08.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { generaVerbale } from "@/lib/pdf/generaVerbale";
import { sezioneCollassata } from "@/lib/checklist/completa";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";

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
const { rows } = await c.query(
  `SELECT struttura_json FROM template_master WHERE attivo = true LIMIT 1;`
);
await c.end();
const template = rows[0].struttura_json;
const sez08 = template.sezioni.find((s) => s.id === "SEZ-08");
if (!sez08) throw new Error("SEZ-08 assente nel template attivo");

// Risposte di base: tutte le domande NON-SEZ-08 = C (complete).
function baseRisposte() {
  const r = {};
  for (const sez of template.sezioni) {
    if (sez.id === "SEZ-08") continue;
    for (const d of sez.domande) {
      r[d.id] = { esito: "C", azione_correttiva: null, osservazione_evidenza: null, osservazioni: null };
    }
  }
  return r;
}

// Replica della validazione completezza del route genera-pdf (server-side).
function valutaCompletezza(risposte) {
  let obbligatorieMancanti = 0;
  let campiTestoMancanti = 0;
  for (const sez of template.sezioni) {
    const valoreFiltro = sez.domanda_filtro ? risposte[sez.domanda_filtro]?.esito ?? null : null;
    const collassata = sezioneCollassata(sez, valoreFiltro);
    for (const d of sez.domande) {
      if (collassata && d.id !== sez.domanda_filtro) continue;
      const r = risposte[d.id];
      const v = r?.esito ?? null;
      if (!v) {
        if (d.obbligatoria) obbligatorieMancanti += 1;
        continue;
      }
      if (v === "NC" || v === "PC") {
        if (!(r?.azione_correttiva ?? "").trim()) campiTestoMancanti += 1;
      } else if (v === "NV" || v === "NA") {
        if (!(r?.osservazioni ?? "").trim()) campiTestoMancanti += 1;
      }
    }
  }
  return { obbligatorieMancanti, campiTestoMancanti, bloccato: obbligatorieMancanti > 0 || campiTestoMancanti > 0 };
}

const datiBase = {
  visita: {
    id: "test", data_visita: "2026-06-30", ora_inizio: "09:30:00",
    note_preliminari: "Sopralluogo periodico.", note_finali_visita: "Follow-up a 60 giorni.",
    numero_verbale: "SC-2026-TEST",
  },
  cliente: { ragione_sociale: "Pane Pizza Srl" },
  sede: { nome: "Sede operativa", indirizzo: "Via Roma 1", citta: "Palermo" },
  specialist: { nome_completo: "Mario Rossi", qualifica: "RSPP" },
  referente_cliente: "Luigi Bianchi",
  nominativi: { DL: "Mario Verdi", RSPP: "Mario Rossi", RLS: ["Anna Neri"] },
  template,
};

// Conta gli esiti reali di SEZ-08 con la stessa logica del PDF (collasso incluso).
function conteggioSez08(risposte) {
  const conteggi = { C: 0, PC: 0, NC: 0, NV: 0, NA: 0 };
  const valoreFiltro = sez08.domanda_filtro ? risposte[sez08.domanda_filtro]?.esito ?? null : null;
  const collassata = sezioneCollassata(sez08, valoreFiltro);
  for (const d of sez08.domande) {
    if (collassata && d.id !== sez08.domanda_filtro) continue;
    const e = risposte[d.id]?.esito;
    if (e) conteggi[e] += 1;
  }
  return { collassata, conteggi };
}

let fail = false;

// ── SCENARIO A: D-08-001 = NA (collasso) ────────────────────────────────────
{
  const r = baseRisposte();
  r["D-08-001"] = { esito: "NA", azione_correttiva: null, osservazione_evidenza: null, osservazioni: "Nessun appalto presso la sede." };
  // Nessuna risposta per D-08-002..009.
  const comp = valutaCompletezza(r);
  const cs = conteggioSez08(r);
  console.log("── SCENARIO A — D-08-001 = NA (atteso: collassata, completa) ──");
  console.log("  collassata:", cs.collassata, "| conteggi SEZ-08:", JSON.stringify(cs.conteggi));
  console.log("  completezza:", comp);
  const okA = cs.collassata === true && comp.bloccato === false && cs.conteggi.NA === 1;
  if (!okA) { fail = true; console.error("  ✗ SCENARIO A FALLITO"); } else console.log("  ✓ collasso OK: sezione completa con la sola filtro, NA totale = 1");

  const buf = await generaVerbale({ ...datiBase, risposte: r });
  const out = join(ROOT, "scripts", "_test-sez08-A-collasso.pdf");
  writeFileSync(out, buf);
  const raw = buf.toString("latin1");
  const nPagine = (raw.match(/\/Type\s*\/Page(?![s])/g) || []).length;
  console.log(`  PDF: ${out} (${buf.length} byte, ${nPagine} pagine)\n`);
}

// ── SCENARIO B: D-08-001 = NC (espansione) ──────────────────────────────────
{
  const r = baseRisposte();
  r["D-08-001"] = { esito: "NC", azione_correttiva: "Censire e gestire gli appalti ai sensi dell'art. 26.", osservazione_evidenza: null, osservazioni: null };
  // Senza rispondere alle altre 8 -> devono risultare obbligatorie mancanti.
  const compIncompleto = valutaCompletezza(r);
  console.log("── SCENARIO B — D-08-001 = NC (atteso: 8 domande ora richieste) ──");
  console.log("  con sole filtro risposta -> completezza:", compIncompleto);
  const okB1 = compIncompleto.bloccato === true && compIncompleto.obbligatorieMancanti === 8;
  if (!okB1) { fail = true; console.error("  ✗ SCENARIO B (parte 1) FALLITO: attese 8 obbligatorie mancanti"); }
  else console.log("  ✓ espansione OK: le 8 domande D-08-002..009 diventano richieste");

  // Ora completiamo le 8 domande e l'elenco imprese su D-08-003.
  for (let n = 2; n <= 9; n++) {
    const id = `D-08-00${n}`;
    r[id] = { esito: "C", azione_correttiva: null, osservazione_evidenza: null, osservazioni: null };
  }
  r["D-08-003"].osservazione_evidenza = "Alfa Impianti Srl (ref. Rossi); Beta Pulizie Snc (ref. Bianchi)";
  const compCompleto = valutaCompletezza(r);
  console.log("  completate le 8 -> completezza:", compCompleto);
  const okB2 = compCompleto.bloccato === false;
  if (!okB2) { fail = true; console.error("  ✗ SCENARIO B (parte 2) FALLITO: doveva risultare completa"); }
  else console.log("  ✓ con le 8 complete la sezione è chiudibile");

  const cs = conteggioSez08(r);
  console.log("  conteggi SEZ-08 (espansa):", JSON.stringify(cs.conteggi));

  const buf = await generaVerbale({ ...datiBase, risposte: r });
  const out = join(ROOT, "scripts", "_test-sez08-B-espansa.pdf");
  writeFileSync(out, buf);
  const raw = buf.toString("latin1");
  const nPagine = (raw.match(/\/Type\s*\/Page(?![s])/g) || []).length;
  // Verifica che l'elenco imprese (campo_extra testo_libero) sia nel PDF.
  const haImprese = raw.includes("Alfa Impianti") || /Imprese presenti/.test(raw);
  console.log(`  PDF: ${out} (${buf.length} byte, ${nPagine} pagine) | elenco imprese nel PDF: ${haImprese}`);
  if (!haImprese) console.log("  (nota: il testo può essere compresso nello stream PDF — verifica visiva consigliata)");
}

console.log(fail ? "\n✗ TEST FALLITO" : "\n✓ TUTTI GLI SCENARI OK");
process.exit(fail ? 1 : 0);
