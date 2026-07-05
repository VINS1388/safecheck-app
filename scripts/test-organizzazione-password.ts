/**
 * Unit test del generatore di password temporanee (modulo puro
 * src/lib/server/genera-password.ts). Verifica le proprietà di sicurezza:
 * lunghezza minima, presenza di tutte le classi, assenza di caratteri ambigui,
 * alfabeto ammesso, unicità (entropia). Nessun DB, nessuna rete.
 *
 * Uso: node --experimental-strip-types scripts/test-organizzazione-password.ts
 */
import { generaPasswordTemporanea } from "../src/lib/server/genera-password.ts";

let pass = 0,
  fail = 0;
function ck(n: string, ok: boolean, x = "") {
  console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`);
  if (ok) pass++;
  else fail++;
}

const AMMESSI = /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?\-_+=]+$/;
const AMBIGUI = /[0O1lI]/;
const campione = Array.from({ length: 2000 }, () => generaPasswordTemporanea());

ck("lunghezza default >= 16 (20)", campione.every((p) => p.length === 20));
ck("lunghezza minima forzata a 16 anche se si chiede meno", generaPasswordTemporanea(8).length === 16);
ck("lunghezza personalizzata rispettata (32)", generaPasswordTemporanea(32).length === 32);
ck("solo caratteri dell'alfabeto ammesso", campione.every((p) => AMMESSI.test(p)));
ck("nessun carattere ambiguo (0/O/1/l/I)", campione.every((p) => !AMBIGUI.test(p)));
ck(
  "almeno una maiuscola, una minuscola, una cifra, un simbolo",
  campione.every(
    (p) =>
      /[A-Z]/.test(p) && /[a-z]/.test(p) && /[2-9]/.test(p) && /[!@#$%*?\-_+=]/.test(p)
  )
);
ck("unicità su 2000 campioni (entropia)", new Set(campione).size === campione.length, `distinti=${new Set(campione).size}`);
// La posizione delle classi obbligatorie non è fissa (shuffle): il primo char varia.
ck("primo carattere non sempre maiuscolo (shuffle efficace)", new Set(campione.map((p) => /[A-Z]/.test(p[0]))).size === 2);

console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
