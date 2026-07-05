/**
 * Unit test del modello filtri (src/lib/filters.ts). Round-trip, valori
 * invalidi ignorati, default periodo, risoluzione range. Nessun DB, nessuna rete.
 *
 * Uso: node --experimental-strip-types scripts/test-filters.ts
 */
import {
  parseFiltri,
  serializeFiltri,
  rangePeriodo,
  contaFiltriAttivi,
  PERIODO_DEFAULT,
  type Filtri,
} from "../src/lib/filters.ts";

let pass = 0,
  fail = 0;
function ck(n: string, ok: boolean, x = "") {
  console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`);
  if (ok) pass++;
  else fail++;
}
// Confronto canonico: ordina le chiavi e scarta gli undefined (l'ordine di
// dichiarazione non è significativo per l'uguaglianza dei filtri).
const canon = (o: unknown) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(o as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
    )
  );
const eq = (a: unknown, b: unknown) => canon(a) === canon(b);

// default periodo su input vuoto
const vuoto = parseFiltri(new URLSearchParams());
ck("default: periodo = 30gg su input vuoto", vuoto.periodo === PERIODO_DEFAULT && vuoto.cliente === undefined);

// valori invalidi ignorati
const inval = parseFiltri(new URLSearchParams("periodo=pippo&da=non-una-data&criticita=boh&cliente=%20%20"));
ck("invalido: periodo sconosciuto → default", inval.periodo === PERIODO_DEFAULT);
ck("invalido: criticita non riconosciuta → undefined", inval.criticita === undefined);
ck("invalido: cliente solo-spazi → undefined", inval.cliente === undefined);

// da/a validi solo con periodo personalizzato
const conDate = parseFiltri(new URLSearchParams("periodo=personalizzato&da=2026-06-01&a=2026-06-30"));
ck("personalizzato: da/a validi conservati", conDate.da === "2026-06-01" && conDate.a === "2026-06-30");
const dateSenzaPerso = parseFiltri(new URLSearchParams("da=2026-06-01&a=2026-06-30"));
ck("da/a ignorati se periodo non personalizzato", dateSenzaPerso.da === undefined && dateSenzaPerso.a === undefined);
const dataMalformata = parseFiltri(new URLSearchParams("periodo=personalizzato&da=2026-13-40"));
ck("personalizzato: data impossibile (2026-13-40) → ignorata", dataMalformata.da === undefined);

// criticita: forme accettate
ck("criticita=nc → true", parseFiltri(new URLSearchParams("criticita=nc")).criticita === true);
ck("criticita=1 → true", parseFiltri(new URLSearchParams("criticita=1")).criticita === true);

// round-trip: parse(serialize(f)) === f (normalizzato)
const campioni: Filtri[] = [
  { periodo: "30gg" },
  { periodo: "oggi", cliente: "c1" },
  { periodo: "7gg", cliente: "c1", sede: "s1", stato: "bozza", criticita: true },
  { periodo: "personalizzato", da: "2026-01-01", a: "2026-02-01", tecnico: "t1" },
  { periodo: "30gg", stato: "da_assegnare", tipologia: "sicurezza" },
];
for (const [i, f] of campioni.entries()) {
  const rt = parseFiltri(serializeFiltri(f));
  ck(`round-trip #${i + 1}`, eq(rt, parseFiltri(serializeFiltri(rt))) && eq(rt, f), JSON.stringify(rt));
}

// serialize: default periodo NON scritto
ck("serialize: periodo default omesso", !serializeFiltri({ periodo: "30gg" }).has("periodo"));
ck("serialize: criticita → criticita=nc", serializeFiltri({ periodo: "30gg", criticita: true }).get("criticita") === "nc");

// rangePeriodo (oggi passato dall'esterno, mai data di sistema)
const OGGI = "2026-07-05";
ck("range oggi", eq(rangePeriodo({ periodo: "oggi" }, OGGI), { da: OGGI, a: OGGI }));
ck("range 7gg = [oggi-6, oggi]", eq(rangePeriodo({ periodo: "7gg" }, OGGI), { da: "2026-06-29", a: OGGI }));
ck("range 30gg = [oggi-29, oggi]", eq(rangePeriodo({ periodo: "30gg" }, OGGI), { da: "2026-06-06", a: OGGI }));
ck("range personalizzato usa da/a", eq(rangePeriodo({ periodo: "personalizzato", da: "2026-01-01", a: "2026-03-01" }, OGGI), { da: "2026-01-01", a: "2026-03-01" }));

// conteggio filtri attivi (periodo default non conta)
ck("contaFiltriAttivi: default = 0", contaFiltriAttivi({ periodo: "30gg" }) === 0);
ck("contaFiltriAttivi: cliente+stato+criticita = 3", contaFiltriAttivi({ periodo: "30gg", cliente: "c", stato: "bozza", criticita: true }) === 3);
ck("contaFiltriAttivi: periodo non-default conta", contaFiltriAttivi({ periodo: "oggi" }) === 1);

// ── preset "sempre" + default di contesto (pagine di sezione) ──
ck("range sempre = nessuna restrizione", eq(rangePeriodo({ periodo: "sempre" }, OGGI), {}));
ck("parse: periodo assente con default 'sempre' → sempre", parseFiltri(new URLSearchParams("cliente=c1"), "sempre").periodo === "sempre");
ck("parse: periodo assente senza default → 30gg", parseFiltri(new URLSearchParams("cliente=c1")).periodo === "30gg");
ck("serialize: con default 'sempre' NON scrive periodo=sempre", !serializeFiltri({ periodo: "sempre" }, "sempre").has("periodo"));
ck("serialize: con default 'sempre' scrive periodo=30gg (scelta esplicita)", serializeFiltri({ periodo: "30gg" }, "sempre").get("periodo") === "30gg");
ck("contaFiltriAttivi: 'sempre' con default 'sempre' = 0", contaFiltriAttivi({ periodo: "sempre" }, "sempre") === 0);
ck("contaFiltriAttivi: '30gg' con default 'sempre' = 1", contaFiltriAttivi({ periodo: "30gg" }, "sempre") === 1);
// round-trip pagine di sezione (default sempre)
const sez: Filtri = { periodo: "7gg", cliente: "c1", criticita: true };
ck("round-trip sezione (default sempre)", eq(parseFiltri(serializeFiltri(sez, "sempre"), "sempre"), sez));

console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
