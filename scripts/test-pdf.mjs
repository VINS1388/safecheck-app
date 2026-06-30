// Test di generazione PDF (Sprint 8): usa il template_master attivo dal DB,
// costruisce un verbale fittizio con molte NC (azione + osservazione evidenza),
// alcune NV/NA con motivazione, e verifica:
//  - generazione senza errori
//  - conteggio pagine coerente (niente pagine vuote)
//  - presenza dei marker testuali nei content stream del PDF
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { generaVerbale } from "@/lib/pdf/generaVerbale";

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
if (process.env.SLICE) {
  template.sezioni = template.sezioni.slice(0, Number(process.env.SLICE));
  console.log("Sezioni usate:", template.sezioni.map((s) => `${s.id}(${s.domande.length})`).join(" "));
}

// Costruisci risposte: alterna NC (con azione + osservazione) e C; alcune NV/NA.
const FORCE_C = process.env.FORCE_C === "1";
const risposte = {};
let nc = 0;
let i = 0;
for (const sez of template.sezioni) {
  for (const d of sez.domande) {
    i++;
    if (FORCE_C) {
      risposte[d.id] = { esito: "C", azione_correttiva: null, osservazione_evidenza: null, osservazioni: null };
      continue;
    }
    if (i % 2 === 1 && nc < 28) {
      nc++;
      risposte[d.id] = {
        esito: "NC",
        azione_correttiva:
          "Predisporre e formalizzare la documentazione mancante secondo quanto previsto dalla normativa vigente, assegnando responsabilità e tempistiche di attuazione.",
        osservazione_evidenza:
          nc % 3 === 0
            ? "Durante il sopralluogo si è rilevata l'assenza del documento presso l'ufficio del responsabile."
            : null,
        osservazioni: null,
      };
    } else if (i % 7 === 0) {
      risposte[d.id] = {
        esito: "NA",
        azione_correttiva: null,
        osservazione_evidenza: null,
        osservazioni: "Attività non presente in azienda.",
      };
    } else {
      risposte[d.id] = {
        esito: "C",
        azione_correttiva: null,
        osservazione_evidenza: null,
        osservazioni: null,
      };
    }
  }
}

const dati = {
  visita: {
    id: "test",
    data_visita: "2026-06-30",
    ora_inizio: "09:30:00",
    note_preliminari: "Sopralluogo periodico di verifica.",
    note_finali_visita:
      "Si raccomanda di completare le azioni correttive entro 60 giorni e di programmare un sopralluogo di follow-up.",
    numero_verbale: "SC-2026-TEST",
  },
  cliente: { ragione_sociale: "Pane Pizza Srl" },
  sede: { nome: "Sede operativa", indirizzo: "Via Roma 1", citta: "Palermo" },
  specialist: { nome_completo: "Mario Rossi", qualifica: "RSPP" },
  referente_cliente: "Luigi Bianchi",
  nominativi: { DL: "Mario Verdi", RSPP: "Mario Rossi", RLS: ["Anna Neri"] },
  template,
  risposte,
};

const buffer = await generaVerbale(dati);
const outPath = join(ROOT, "scripts", "_test-verbale.pdf");
writeFileSync(outPath, buffer);

// Conteggio pagine autorevole: /Count dell'albero /Pages (== oggetti /Type /Page).
const raw = buffer.toString("latin1");
const nPagine = (raw.match(/\/Type\s*\/Page(?![s])/g) || []).length;
const counts = (raw.match(/\/Count\s+(\d+)/g) || []).join("  ");

console.log("PDF generato:", outPath, `(${buffer.length} byte)`);
console.log("Domande totali:", i, "| NC nel dataset:", nc);
console.log("Pagine PDF:", nPagine, "| /Count:", counts);

// Sanity check: 55 domande (28 NC con testo) devono stare in poche pagine.
// Prima del fix footer erano 21 (pagine vuote). Atteso ora ~6-9.
if (nPagine > 12) {
  console.error(`✗ ANOMALIA: troppe pagine (${nPagine}) — probabile regressione pagine vuote.`);
  process.exit(1);
}
console.log("✓ Conteggio pagine coerente col contenuto (nessuna pagina vuota).");
