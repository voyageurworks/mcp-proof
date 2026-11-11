import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The trap for a server author: inside a package's own folder, `npx -y <that package>` does not fetch the published package. npm sees
 * that the current project has that name and runs the copy in this folder, which is usually neither installed nor built there, so the
 * client gets "'name' is not recognized" and mcp-proof reports `failed` (seen 2026-11-11 with handoff-desk 1.2.4). `setup` suggests
 * exactly this command from the package.json beside you, so both `setup` and a failed `run` say what is going on and what to do.
 */

const NAME = /^(@[a-z0-9~._-]+\/[a-z0-9~._-]+|[a-z0-9~._-]+)(@[^\s]*)?$/i;

/** The package a downloader command starts, without its version: `npx -y @scope/name@1.2` gives `@scope/name`. Undefined for anything else. */
export function startedPackage(command: string, args: string[]): string | undefined {
  const base = path.basename(command).toLowerCase().replace(/\.(cmd|exe|ps1)$/, "");
  let rest = args;
  if (base === "npm" && rest[0] === "exec") rest = rest.slice(1);
  else if ((base === "pnpm" || base === "yarn") && rest[0] === "dlx") rest = rest.slice(1);
  else if (base !== "npx" && base !== "bunx" && base !== "pnpx") return undefined;
  // `-p` / `--package` change which package is started, so the first word is not the package: say nothing rather than guess.
  if (rest.some(arg => arg === "-p" || arg.startsWith("--package"))) return undefined;
  const spec = rest.find(arg => arg !== "--" && !arg.startsWith("-"));
  return spec === undefined ? undefined : NAME.exec(spec)?.[1];
}

/** The name in the nearest package.json at or above `cwd` (npm treats that folder as the project). */
function projectName(cwd: string): string | undefined {
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    const file = path.join(dir, "package.json");
    if (existsSync(file)) {
      try {
        const name = (JSON.parse(readFileSync(file, "utf8")) as { name?: unknown }).name;
        return typeof name === "string" ? name : undefined;
      } catch {
        return undefined;
      }
    }
    if (path.dirname(dir) === dir) return undefined;
  }
}

/** The package name when the server command starts the package whose project folder `cwd` is in; otherwise undefined. */
export function ownPackage(command: string, args: string[], cwd: string): string | undefined {
  const started = startedPackage(command, args);
  return started !== undefined && started === projectName(cwd) ? started : undefined;
}

/** What to tell the author. Plain words: what npx did, and the fix. */
export function ownPackageNote(name: string): string {
  return `This folder is the project of "${name}", so npx runs the copy in this folder (usually not installed or built here), not the published package. Run again with --cwd set to another folder, for example --cwd ..`;
}
