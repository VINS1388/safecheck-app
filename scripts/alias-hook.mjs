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
  // Import relativi SENZA estensione (es. `./x` verso `./x.ts`): sotto
  // --experimental-strip-types Node non prova le estensioni. Fallback additivo:
  // tenta la risoluzione standard e SOLO se fallisce prova le stesse estensioni.
  // Non altera i relativi già risolvibili né i bare specifier (pacchetti).
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    try {
      return await next(specifier, context);
    } catch (err) {
      const base = new URL(specifier, context.parentURL);
      for (const ext of EXTS) {
        const candidate = new URL(base.href + ext);
        if (isFile(candidate)) {
          return next(candidate.href, context);
        }
      }
      throw err;
    }
  }
  return next(specifier, context);
}
