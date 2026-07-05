import { randomInt } from "node:crypto";

/**
 * Generazione password temporanea — modulo PURO (solo node:crypto), isolato per
 * essere unit-testabile senza `server-only` né path alias.
 *
 * - CSPRNG (node:crypto.randomInt), mai Math.random.
 * - Alfabeto senza caratteri ambigui (0/O/1/l/I) per una trascrizione affidabile.
 * - Garantisce almeno un carattere per classe (maiusc./minusc./cifra/simbolo).
 * - Lunghezza minima 16.
 *
 * Il valore è restituito una sola volta al chiamante: mai loggato, mai persistito,
 * mai incluso in messaggi d'errore (responsabilità di chi lo usa).
 */

const A_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const A_LOWER = "abcdefghijkmnopqrstuvwxyz";
const A_DIGIT = "23456789";
const A_SYMBOL = "!@#$%*?-_+=";
const A_ALL = A_UPPER + A_LOWER + A_DIGIT + A_SYMBOL;

export function generaPasswordTemporanea(lunghezza = 20): string {
  const len = Math.max(16, lunghezza);
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = [pick(A_UPPER), pick(A_LOWER), pick(A_DIGIT), pick(A_SYMBOL)];
  while (chars.length < len) chars.push(pick(A_ALL));
  // Shuffle Fisher-Yates non distorto: le classi obbligatorie non restano in testa.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
