/**
 * Version — single source of truth lida de package.json em runtime.
 *
 * Importar deste modulo em vez de hardcodar strings de versao garante que
 * package.json, McpServer, /health e metadata fiquem sempre sincronizados.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readVersion(): string {
  // Em build (dist/), package.json esta um nivel acima (../../package.json).
  // Em src/ (tsx dev), tambem esta um nivel acima (../package.json).
  // Resolvemos relativamente a este arquivo para funcionar em ambos.
  for (const candidate of ["../package.json", "../../package.json"]) {
    try {
      const pkgPath = join(__dirname, candidate);
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (typeof pkg.version === "string") return pkg.version;
    } catch {
      // tenta proximo candidato
    }
  }
  return "0.0.0-unknown";
}

export const VERSION: string = readVersion();
