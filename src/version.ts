import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

declare const __OPENCLAW_VERSION__: string | undefined;

function readVersionFromPackageJson(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    return pkg.version ?? null;
  } catch {
    try {
      const self = fileURLToPath(import.meta.url);
      const root = path.resolve(path.dirname(self), "..");
      const pkgPath = path.join(root, "package.json");
      const require = createRequire(import.meta.url);
      const pkg = require(pkgPath) as { version?: string };
      return pkg.version ?? null;
    } catch {
      try {
        const require = createRequire(import.meta.url);
        const pkg = require(path.join(process.cwd(), "package.json")) as { version?: string };
        return pkg.version ?? null;
      } catch {
        return null;
      }
    }
  }
}

function readVersionFromBuildInfo(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const info = require("../build-info.json") as { version?: string };
    return info.version ?? null;
  } catch {
    return null;
  }
}

// Single source of truth for the current OpenClaw version.
// - Embedded/bundled builds: injected define or env var.
// - Dev/npm builds: package.json.
export const VERSION =
  (typeof __OPENCLAW_VERSION__ === "string" && __OPENCLAW_VERSION__) ||
  process.env.OPENCLAW_BUNDLED_VERSION ||
  readVersionFromPackageJson() ||
  readVersionFromBuildInfo() ||
  "0.0.0";
