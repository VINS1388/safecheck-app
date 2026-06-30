// Resolver hook per eseguire moduli TS con import "@/..." sotto
// `node --experimental-strip-types`. Mappa "@/x" -> "<root>/src/x" provando
// le estensioni .ts/.tsx e /index.ts. Uso:
//   node --experimental-strip-types --import ./scripts/alias-hook.mjs <file>
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = new URL("../src/", import.meta.url);
const EXTS = [".ts", ".tsx", ".mts", ".js", "/index.ts", "/index.tsx", ""];

function isFile(url) {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = new URL(specifier.slice(2), SRC);
    for (const ext of EXTS) {
      const candidate = new URL(base.href + ext);
      if (isFile(candidate)) {
        return next(candidate.href, context);
      }
    }
    return next(base.href, context);
  }
  return next(specifier, context);
}
