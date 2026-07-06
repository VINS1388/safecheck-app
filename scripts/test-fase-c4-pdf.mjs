/**
 * Fase C4 — generazione PDF HACCP. Costruisce uno snapshot applicativo dal
 * template canonico, un verbale sintetico con mix di esiti (osservazioni su
 * PC/NC, motivazione su NV) e intestazione_extra, e verifica che generaVerbale
 * produca un PDF valido via il renderer HACCP dedicato. Salva il PDF nello
 * scratchpad per ispezione. Nessun DB.
 *
 * Uso: node --experimental-strip-types --experimental-loader ./scripts/alias-hook.mjs scripts/test-fase-c4-pdf.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generaVerbale } from "@/lib/pdf/generaVerbale";
import { costruisciSnapshotHaccp } from "@/lib/checklist/haccpSnapshot";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "C:/Users/vince/AppData/Local/Temp/claude/F--StudioBilello-2026-safecheck-app/288796d5-1556-4d08-a7f2-b6729c7eb359/scratchpad";
const canon = JSON.parse(readFileSync(join(ROOT, "seed", "template-haccp-generico-v1.0.json"), "utf8"));
const snap = costruisciSnapshotHaccp(canon);

let pass = 0, fail = 0;
function ck(n, ok, x = "") { console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`); if (ok) pass++; else fail++; }

// Costruisce le risposte per uno scenario dato (mapper id → esito).
function costruisciRisposte(esitoDi) {
  const out = {};
  for (const s of snap.sezioni)
    for (const d of s.domande) {
      const v = esitoDi(d.id, s.id);
      out[d.id] = {
        esito: v,
        azione_correttiva: null,
        osservazione_evidenza: v === "PC" || v === "NC" ? `Osservazione per ${d.id}` : null,
        osservazioni: v === "NV" ? `Motivazione NV per ${d.id}` : v === "NA" ? `Non applicabile: ${d.id}` : null,
      };
    }
  return out;
}

const intestazioneExtra = {
  ora_fine: "11:30",
  funzione_referente: "Titolare",
  attivita_in_corso: "Preparazione e somministrazione pasti",
  aree_visitate: ["cucina", "cella frigo", "dispensa", "sala"],
  aree_non_visitate_motivo: "Magazzino esterno non accessibile al momento della visita",
  flag_rilievi_fotografici: true,
  presa_visione_referente_testuale: "Il referente ha preso visione dei rilievi e delle osservazioni.",
};

function datiBase(risposte) {
  return {
    visita: {
      id: "test-haccp", data_visita: "2026-07-06", ora_inizio: "09:00:00",
      note_preliminari: null, note_finali_visita: "Nel complesso l'attività risulta conforme, con alcune aree migliorabili.",
      numero_verbale: "HACCP-2026-0001",
    },
    cliente: { ragione_sociale: "Pane Pizza Srl" },
    sede: { nome: "Sede operativa", indirizzo: "Via Roma 1", citta: "Palermo" },
    specialist: { nome_completo: "Vincenzo Bilello", qualifica: "RSPP / Consulente HACCP" },
    referente_cliente: "Mario Rossi",
    nominativi: {},
    template: snap,
    intestazioneExtra,
    risposte,
  };
}

const isPDF = (buf) => buf.length > 2000 && buf.subarray(0, 5).toString("latin1") === "%PDF-";

// Scenario A — mix realistico (NC, PC, NV, NA + molte C)
{
  const risposte = costruisciRisposte((id) => {
    if (id === "D-H01-001") return "NC";
    if (id === "D-H03-002") return "PC";
    if (id === "D-H04-001") return "NV";
    if (id === "D-H01-006" || id === "D-H05-006") return "NA"; // domande con applicabilità
    return "C";
  });
  const buf = await generaVerbale(datiBase(risposte));
  ck("Scenario mix: PDF valido generato", isPDF(buf), `${buf.length} byte`);
  writeFileSync(join(OUT, "verbale-haccp-mix.pdf"), buf);
}

// Scenario B — tutte C (nessun rilievo)
{
  const risposte = costruisciRisposte(() => "C");
  const buf = await generaVerbale(datiBase(risposte));
  ck("Scenario tutte-C (nessun rilievo): PDF valido", isPDF(buf), `${buf.length} byte`);
  writeFileSync(join(OUT, "verbale-haccp-tutte-c.pdf"), buf);
}

// Scenario C — intestazione_extra vuota (form non ancora compilato): non deve crashare
{
  const risposte = costruisciRisposte(() => "C");
  const dati = datiBase(risposte);
  dati.intestazioneExtra = {};
  const buf = await generaVerbale(dati);
  ck("Scenario intestazione_extra vuota: PDF valido (nessun crash)", isPDF(buf), `${buf.length} byte`);
}

// Il verbale sicurezza NON deve passare dal renderer HACCP: snapshot senza
// tipo_scoring → ramo sicurezza. (verifica indiretta: template sicurezza-like)
{
  const sicuro = { id: "s", nome: "Sicurezza", versione: 6, sezioni: [{ id: "SEZ-01", nome: "Org", ordine: 1, domande: [{ id: "D-01-001", testo: "x", ordine: 1, obbligatoria: true, tipo_risposta: "conformita_5" }] }] };
  const dati = datiBase({ "D-01-001": { esito: "C", azione_correttiva: null, osservazione_evidenza: null, osservazioni: null } });
  dati.template = sicuro;
  const buf = await generaVerbale(dati);
  ck("snapshot senza tipo_scoring → ramo sicurezza, PDF valido", isPDF(buf), `${buf.length} byte`);
}

console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
console.log(`PDF salvati in: ${OUT}`);
process.exit(fail === 0 ? 0 : 1);
