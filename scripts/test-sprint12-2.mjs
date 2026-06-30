// Test Sprint 12.2 — SEZ-03 logica DL/RSPP. In-memory (nessuna scrittura su
// DB): usa il template v7 reale (read-only) e le funzioni reali (formazione.ts:
// istanzeFormazione, genericheFormazione, dlCoincideRspp; completa.ts:
// completezzaFormazione; generaVerbale).
//
// Regola: DL e RSPP stessa persona (STESSO id stabile) → un'unica domanda
// combinata DL-SPP (su D-03-005); persone diverse → domande separate.
//
// Uso: node --experimental-strip-types --experimental-loader ./scripts/alias-hook.mjs scripts/test-sprint12-2.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import pg from "pg";
import { generaVerbale } from "@/lib/pdf/generaVerbale";
import {
  istanzeFormazione,
  genericheFormazione,
  dlCoincideRspp,
  FIGURA_DLSPP,
} from "@/lib/checklist/formazione";
import { completezzaFormazione } from "@/lib/checklist/completa";
import { normalizzaNominativi } from "@/lib/nominativi";
import { idRispostaFormazione } from "@/types";

const require = createRequire(import.meta.url);
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
const { rows } = await c.query(`SELECT struttura_json FROM template_master WHERE attivo=true LIMIT 1;`);
await c.end();
const template = rows[0].struttura_json;
const sez03 = template.sezioni.find((s) => s.id === "SEZ-03");
const Q_DLSPP = "D-03-005";

let fail = false;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) fail = true;
};

// Domande mappate a una figura (con figura_nominativo): da qui derivano DL e RSPP.
const mappate = sez03.domande.filter((d) => d.figura_nominativo);
const qDi = (fig) => mappate.find((d) => d.figura_nominativo === fig)?.id;
const Q_DL = qDi("DL");
const Q_RSPP = qDi("RSPP");

// Helper: composite id attivi (con fusione applicata) per uno stato nominativi.
const norm = (n) => normalizzaNominativi(n);
const idsAttivi = (n) => istanzeFormazione(sez03, norm(n)).map((i) => i.compositeId);
const istanze = (n) => istanzeFormazione(sez03, norm(n));
const generiche = (n) => genericheFormazione(sez03, norm(n)).map((d) => d.id);

// ── STRUTTURA — precondizioni del template v7 ───────────────────────────────
console.log("── STRUTTURA — precondizioni template ──");
check("template v7", template.versione === 7);
check("SEZ-03 ha marker formazione_per_nominativo", sez03.formazione_per_nominativo === true);
check("esiste domanda figura DL", Boolean(Q_DL), `${Q_DL}`);
check("esiste domanda figura RSPP", Boolean(Q_RSPP), `${Q_RSPP}`);
check(
  "D-03-005 è generica (nessuna figura_nominativo)",
  Boolean(sez03.domande.find((d) => d.id === Q_DLSPP)) &&
    !sez03.domande.find((d) => d.id === Q_DLSPP).figura_nominativo
);

// ── SCENARIO A — persone diverse → domande separate ─────────────────────────
console.log("\n── SCENARIO A — DL ≠ RSPP (persone diverse) ──");
const nomA = {
  DL: [{ id: "dl1", nome: "Mario Datore" }],
  RSPP: [{ id: "r1", nome: "Anna Esperta" }],
};
{
  check("dlCoincideRspp = null (id diversi)", dlCoincideRspp(norm(nomA)) === null);
  const ids = idsAttivi(nomA);
  check("istanza DL separata presente", ids.includes(idRispostaFormazione(Q_DL, "dl1")));
  check("istanza RSPP separata presente", ids.includes(idRispostaFormazione(Q_RSPP, "r1")));
  check("nessuna istanza DL-SPP combinata", istanze(nomA).every((i) => i.figuraKey !== FIGURA_DLSPP));
  check("nessuna istanza su D-03-005", ids.every((id) => !id.startsWith(Q_DLSPP + "::")));
  check("D-03-005 resta domanda generica diretta", generiche(nomA).includes(Q_DLSPP));
}

// ── SCENARIO B — stessa persona (stesso id) → domanda DL-SPP combinata ──────
console.log("\n── SCENARIO B — DL = RSPP (stesso id) → fusione ──");
const nomB = {
  DL: [{ id: "dl1", nome: "Mario Datore" }],
  RSPP: [{ id: "dl1", nome: "Mario Datore" }],
};
{
  const merged = dlCoincideRspp(norm(nomB));
  check("dlCoincideRspp ritorna il nominativo fuso", merged?.id === "dl1");
  const lista = istanze(nomB);
  const dlspp = lista.filter((i) => i.figuraKey === FIGURA_DLSPP);
  check("esattamente 1 istanza DL-SPP", dlspp.length === 1);
  check(
    "istanza DL-SPP basata su D-03-005::dl1",
    dlspp[0]?.compositeId === idRispostaFormazione(Q_DLSPP, "dl1")
  );
  const ids = idsAttivi(nomB);
  check("nessuna istanza DL separata (assorbita)", !ids.includes(idRispostaFormazione(Q_DL, "dl1")));
  check("nessuna istanza RSPP separata (assorbita)", !ids.includes(idRispostaFormazione(Q_RSPP, "dl1")));
  check("D-03-005 NON è più domanda generica diretta", !generiche(nomB).includes(Q_DLSPP));
  check("D-03-001 (Lavoratori) resta generica diretta", generiche(nomB).includes("D-03-001"));
}

// ── SCENARIO C — confronto per id, mai per nome ─────────────────────────────
console.log("\n── SCENARIO C — confronto su id, non su nome ──");
{
  // Stesso nome ma id diversi (omonimia/refuso) → NON fusi.
  const omonimi = {
    DL: [{ id: "dl1", nome: "Mario Rossi" }],
    RSPP: [{ id: "r9", nome: "Mario Rossi" }],
  };
  check("stesso nome ma id diversi → non fusi", dlCoincideRspp(norm(omonimi)) === null);
  check("omonimi → istanze separate", idsAttivi(omonimi).includes(idRispostaFormazione(Q_RSPP, "r9")));

  // Stesso id ma nome diverso (refuso nel nome) → fusi (l'id vince).
  const refuso = {
    DL: [{ id: "x1", nome: "Giuseppe Verdi" }],
    RSPP: [{ id: "x1", nome: "Giuseppe Verde" }],
  };
  check("stesso id, nome diverso → fusi", dlCoincideRspp(norm(refuso))?.id === "x1");
}

// ── SCENARIO D — completezza della domanda DL-SPP fusa ──────────────────────
console.log("\n── SCENARIO D — completezza DL-SPP fuso ──");
{
  const cid = idRispostaFormazione(Q_DLSPP, "dl1");
  const ids = idsAttivi(nomB).filter((id) => id === cid); // solo la DL-SPP per dl1
  check("la sola istanza per dl1 è la DL-SPP", ids.length === 1);

  const store = new Map();
  const getR = (id) => store.get(id) ?? null;

  // 1) non risposta → mancante
  let r = completezzaFormazione([cid], getR);
  check("DL-SPP non risposta → mancanti 1, non completa", r.mancanti === 1 && !r.completa);

  // 2) C → completa
  store.set(cid, { esito: "C", azioneCorrettiva: null, osservazione: null });
  r = completezzaFormazione([cid], getR);
  check("DL-SPP = C → completa (mancanti 0)", r.mancanti === 0 && r.completa);

  // 3) NC senza azione → blocca
  store.set(cid, { esito: "NC", azioneCorrettiva: "", osservazione: null });
  r = completezzaFormazione([cid], getR);
  check("DL-SPP = NC senza azione → mancanti 1", r.mancanti === 1 && !r.completa);

  // 4) NC con azione → completa
  store.set(cid, { esito: "NC", azioneCorrettiva: "Completare percorso art. 34.", osservazione: null });
  r = completezzaFormazione([cid], getR);
  check("DL-SPP = NC con azione → completa", r.mancanti === 0 && r.completa);
}

// ── SCENARIO E — fusione/sfusione: diff istanze e individuazione orfani ─────
console.log("\n── SCENARIO E — orfani su fusione e sfusione ──");
{
  // Fusione: da separate (DL=dl1, RSPP=r1, entrambe risposte) a fuse (RSPP=dl1).
  const prima = new Set(idsAttivi(nomA));
  const dopoFus = new Set(idsAttivi(nomB));
  const orfaneFus = [...prima].filter((id) => !dopoFus.has(id));
  check(
    "fusione → DL::dl1 e RSPP::r1 diventano orfane",
    orfaneFus.includes(idRispostaFormazione(Q_DL, "dl1")) &&
      orfaneFus.includes(idRispostaFormazione(Q_RSPP, "r1")) &&
      orfaneFus.length === 2
  );
  check(
    "fusione → compare D-03-005::dl1 come nuova attiva",
    [...dopoFus].includes(idRispostaFormazione(Q_DLSPP, "dl1")) && !prima.has(idRispostaFormazione(Q_DLSPP, "dl1"))
  );

  // Sfusione: da fuse (DL=RSPP=dl1) a RSPP vuoto (il tecnico reinserirà).
  const nomSfuso = { DL: [{ id: "dl1", nome: "Mario Datore" }], RSPP: [] };
  const dopoSfus = new Set(idsAttivi(nomSfuso));
  const orfaneSfus = [...dopoFus].filter((id) => !dopoSfus.has(id));
  check(
    "sfusione → D-03-005::dl1 diventa orfana",
    orfaneSfus.length === 1 && orfaneSfus[0] === idRispostaFormazione(Q_DLSPP, "dl1")
  );
  check(
    "sfusione → riappare l'istanza DL separata (DL::dl1)",
    [...dopoSfus].includes(idRispostaFormazione(Q_DL, "dl1"))
  );
}

// ── SCENARIO F — PDF: domanda combinata vs domande separate ─────────────────
console.log("\n── SCENARIO F — PDF DL-SPP combinato vs separato ──");
{
  // Fusi: il PDF stampa la domanda combinata DL-SPP, non due righe DL+RSPP.
  const cidFus = idRispostaFormazione(Q_DLSPP, "dl1");
  const rispFus = {
    [cidFus]: { esito: "C", azione_correttiva: null, osservazione_evidenza: null, osservazioni: null, data_verifica: "2025-05-20" },
  };
  const bufFus = await generaVerbale(datiPDF(nomB, rispFus));
  const txtFus = decodePdf(bufFus);
  check("PDF fuso: etichetta 'Formazione DL-SPP di Mario Datore'", txtFus.includes("Formazione DL-SPP di Mario Datore"));
  check("PDF fuso: intestazione 'percorso DL-SPP'", /percorso DL-SPP/i.test(txtFus));

  // Separati: due righe 'Formazione di' distinte per DL e RSPP.
  const rispSep = {
    [idRispostaFormazione(Q_DL, "dl1")]: { esito: "C", azione_correttiva: null, osservazione_evidenza: null, osservazioni: null, data_verifica: null },
    [idRispostaFormazione(Q_RSPP, "r1")]: { esito: "C", azione_correttiva: null, osservazione_evidenza: null, osservazioni: null, data_verifica: null },
  };
  const bufSep = await generaVerbale(datiPDF(nomA, rispSep));
  const txtSep = decodePdf(bufSep);
  check("PDF separato: 'Formazione di Mario Datore' (DL)", txtSep.includes("Formazione di Mario Datore"));
  check("PDF separato: 'Formazione di Anna Esperta' (RSPP)", txtSep.includes("Formazione di Anna Esperta"));
  check("PDF separato: nessuna riga DL-SPP combinata", !txtSep.includes("Formazione DL-SPP"));
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function datiPDF(nominativi, risposte) {
  return {
    visita: { id: "test", data_visita: "2026-06-30", ora_inizio: "09:30:00", note_preliminari: null, note_finali_visita: null, numero_verbale: "SC-2026-TEST" },
    cliente: { ragione_sociale: "Pane Pizza Srl" },
    sede: { nome: "Sede", indirizzo: "Via Roma 1", citta: "Palermo" },
    specialist: { nome_completo: "Mario Rossi", qualifica: "RSPP" },
    referente_cliente: null,
    nominativi,
    template,
    risposte,
  };
}

function decodePdf(buf) {
  const zlib = require("zlib");
  const s = buf.toString("latin1");
  let out = "";
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const st = m.index + m[0].length;
    const en = buf.indexOf("endstream", st);
    if (en < 0) continue;
    let inf;
    try { inf = zlib.inflateSync(buf.subarray(st, en)).toString("latin1"); } catch { continue; }
    inf.replace(/<([0-9A-Fa-f]+)>/g, (_, h) => {
      for (let i = 0; i + 1 < h.length; i += 2) out += String.fromCharCode(parseInt(h.substr(i, 2), 16));
      return "";
    });
  }
  return out;
}

console.log(fail ? "\n✗ TEST FALLITO" : "\n✓ TUTTI GLI SCENARI OK");
process.exit(fail ? 1 : 0);
