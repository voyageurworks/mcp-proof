import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA, systemInfo, type ClientResult, type CompatRecord } from "./compat.js";
import { labelFor } from "./evidence.js";
import { compareSnapshots, createHome, realHome, snapshot } from "./home.js";
import type { Launch } from "./launch.js";
import { parseLog, summarize } from "./log.js";
import { killAllChildren } from "./proc.js";
import { redactArgs, scrubPaths } from "./redact.js";
import type { Recipe, RunResult } from "./types.js";

// One source of truth: package.json sits one folder above both src/ and dist/.
export const VERSION: string = (JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as { version: string }).version;
/** The compiled entry point of this program, used to build the command a client runs (mcp-proof wraps the server). */
const SIBLING = fileURLToPath(new URL("./main.js", import.meta.url));
// Loaded from TypeScript source (tests), there is no main.js next to this file; use the compiled one in dist.
export const SELF = existsSync(SIBLING) ? SIBLING : fileURLToPath(new URL("../dist/main.js", import.meta.url));

export interface RunOptions {
  server: Launch;
  recipes: Recipe[];
  /** Variables the server needs: name to value. Values go to the client's server entry only; the record keeps names. */
  serverEnv: Record<string, string>;
  timeoutMs: number;
  /** Where throwaway homes are made. Defaults to a fresh folder in the system temp directory. */
  scratchRoot?: string;
  /** Working folder of the server (so relative paths in its command work). The client itself always runs in the throwaway home. */
  serverCwd?: string;
  /** Path of the compiled mcp-proof entry point that clients are told to run. Defaults to this program's own main.js. */
  self?: string;
  /** Keep the throwaway homes after the run (default: remove them). */
  keep?: boolean;
  onProgress?: (message: string) => void;
}

export async function runAll(options: RunOptions): Promise<CompatRecord> {
  const base = options.scratchRoot ?? os.tmpdir();
  mkdirSync(base, { recursive: true });
  // Everything this run creates lives in one folder of its own, so a run that is interrupted can be cleaned up completely.
  const scratch = mkdtempSync(path.join(base, "mcp-proof-run-"));
  const stop = (code: number) => () => {
    killAllChildren();
    if (!options.keep) rmSync(scratch, { recursive: true, force: true });
    process.exit(code);
  };
  const onInterrupt = stop(130);
  const onTerminate = stop(143);
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);
  const results: ClientResult[] = [];
  for (const recipe of options.recipes) {
    options.onProgress?.(`${recipe.name}: checking`);
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    const probe = createHome(scratch, {});
    const found = await recipe.detect(probe.env).catch(() => ({ installed: false, version: undefined as string | undefined }));
    rmSync(probe.root, { recursive: true, force: true });
    if (!found.installed) {
      results.push({ client: recipe.id, clientName: recipe.name, standin: !!recipe.standin, clientVersion: null, label: "not-installed", commands: [], startedAt, durationMs: Date.now() - started, methods: [], realHome: "unknown", notes: [], installHint: recipe.installHint });
      continue;
    }
    options.onProgress?.(`${recipe.name}${found.version ? ` ${found.version}` : ""}: running`);
    const home = createHome(scratch, {});
    const workDir = path.join(home.root, "work");
    mkdirSync(workDir, { recursive: true });
    const logFile = path.join(home.root, "proof.log");
    const cwdArgs = options.serverCwd ? ["--cwd", options.serverCwd] : [];
    const wrapped: Launch = { command: process.execPath, args: [options.self ?? SELF, "wrap", "--log", logFile, ...cwdArgs, "--", options.server.command, ...options.server.args] };
    const before = recipe.realHomePaths.length > 0 ? snapshot(realHome(), recipe.realHomePaths) : null;
    const run: RunResult = await recipe.run({ home, workDir, wrapped, logFile, serverEnv: options.serverEnv, timeoutMs: options.timeoutMs })
      .catch((error: NodeJS.ErrnoException) => ({ commands: [], exitCode: null, timedOut: false, notes: [`The recipe failed to run: ${error.code ?? "error"}`] }));
    const after = before === null ? null : snapshot(realHome(), recipe.realHomePaths);
    const handshake = summarize(existsSync(logFile) ? parseLog(readFileSync(logFile, "utf8")) : []);
    const scrub = (text: string) => scrubPaths(text, [[home.root, "<home>"], [options.self ?? SELF, "<mcp-proof>"], [process.execPath, "node"], ...Object.values(options.serverEnv).filter(value => value.length >= 3).map((value): [string, string] => [value, "<env value>"])]);
    const realHomeState = before === null || after === null ? "unknown" : compareSnapshots(before, after);
    const notes = run.notes.map(scrub);
    const label = labelFor(handshake);
    // A result that is not verified must say, in plain words, where it stopped.
    if (label === "failed" && notes.length === 0) {
      notes.push(handshake.methods.length === 0
        ? "The client never reached the server: nothing was exchanged. Check that the server command works on its own, and whether the client asked for approval."
        : "The client reached the server command, but the handshake (initialize or server/discover) was never answered. The server may have exited at once; check that the command works on its own.");
    }
    if (label === "started" && notes.length === 0) notes.push("The server answered the handshake (initialize or server/discover), but tools/list was not answered.");
    if (realHomeState === "changed") notes.push("Files in your real home folder for this client changed during the run. mcp-proof only writes inside its throwaway home, so a copy of this client that was already running is the likely cause.");
    results.push({
      client: recipe.id, clientName: recipe.name, standin: !!recipe.standin, clientVersion: found.version ?? null,
      label, commands: run.commands.map(scrub), startedAt, durationMs: Date.now() - started,
      methods: handshake.methods, realHome: realHomeState, notes,
    });
    if (!options.keep) rmSync(home.root, { recursive: true, force: true });
  }
  process.off("SIGINT", onInterrupt);
  process.off("SIGTERM", onTerminate);
  if (options.keep) options.onProgress?.(`Kept the throwaway homes in ${scratch}. They hold the --env values you passed; delete the folder when you are done.`);
  else rmSync(scratch, { recursive: true, force: true });
  return {
    schema: SCHEMA, tool: "mcp-proof", version: VERSION, generatedAt: new Date().toISOString(), system: systemInfo(),
    server: { command: path.basename(options.server.command), args: redactArgs(options.server.args), envNames: Object.keys(options.serverEnv) },
    results,
  };
}
