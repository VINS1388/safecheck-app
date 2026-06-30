// Loader Node: risolve l'alias "@/..." → "src/..." per poter importare i
// moduli TS del progetto in uno script standalone (con type-stripping nativo).
import { pathToFileURL } from "node:url";
import { resolve as pathResolve } from "node:path";
import { existsSync, statSync } from "node:fs";

const SRC = pathResolve(process.cwd(), "src");
const isFile = (p) => existsSync(p) && statSync(p).isFile();

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const candidates = [
      pathResolve(SRC, rel + ".ts"),
      pathResolve(SRC, rel + ".tsx"),
      pathResolve(SRC, rel, "index.ts"),
      pathResolve(SRC, rel), // file senza estensione (raro)
    ];
    for (const c of candidates) {
      if (isFile(c)) return nextResolve(pathToFileURL(c).href, context);
    }
  }
  return nextResolve(specifier, context);
}
