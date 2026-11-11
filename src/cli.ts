import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHome } from "./home.js";
import { parseCompat, validate } from "./compat.js";
import { renderBadges } from "./badge.js";
import { parseLaunch, type Launch } from "./launch.js";
import { RECIPES, recipeById } from "./recipes/index.js";
import { runAll, VERSION } from "./run.js";
import { nextHints, setupCommand, terminalAsk } from "./setup.js";
import { renderNotes, renderSummary, renderTable } from "./table.js";
import { wrap } from "./wrap.js";

export interface Io { out(text: string): void; err(text: string): void }

const USAGE = [
  "mcp-proof: prove an MCP server starts in real clients.",
  "",
  "Usage:",
  "  mcp-proof setup                         a guided first run: asks a few questions and prints every step (--prompt: a block for an AI assistant)",
  "  mcp-proof run [options] -- <server command> [args...]",
  "  mcp-proof run [options] --server \"<server command line>\"",
  "  mcp-proof clients                       list clients and whether each is installed",
  "  mcp-proof table <compat.json>           print a README-ready Markdown table",
  "  mcp-proof badge <compat.json> --out <dir>   write static SVG badges and Shields endpoint JSON",
  "  mcp-proof validate <compat.json>        check a compat.json file",
  "  mcp-proof wrap --log <file> -- <cmd...> used by clients: log method names only",
  "",
  "run options:",
  "  --client <id>     only this client (repeatable); default: every client, installed or not",
  "  --env <NAME[=VALUE]>  give the server a variable (NAME alone copies it from this shell); only names are recorded",
  "  --out <dir>       write compat.json, table.md and badges/ into this folder",
  "  --json            print compat.json on stdout instead of the summary",
  "  --timeout <sec>   per-client limit (default 90)",
  "  --cwd <dir>       the server's working folder (default: the current folder); clients always run in a throwaway home",
  "  --scratch <dir>   where throwaway homes are made (default: the system temp folder)",
  "  --keep            keep the throwaway homes. A kept home holds the --env values you passed, in the client's own config; delete it yourself when done",
  "",
  "Exit codes: 0 every client that ran was verified (and at least one ran), 1 a client ran but did not verify or a client you named is missing, 2 usage problem.",
  "mcp-proof never installs a client and never reads your real client settings. Logs hold method names only.",
  "",
].join("\n");

interface RunArgs { server: Launch; clients: string[]; env: Record<string, string>; out?: string; cwd?: string; json: boolean; timeoutSec: number; scratch?: string; keep: boolean }

function parseRun(argv: string[], io: Io, environment: NodeJS.ProcessEnv): RunArgs | null {
  const args: RunArgs = { server: { command: "", args: [] }, clients: [], env: {}, json: false, timeoutSec: 90, keep: false };
  let serverText: string | undefined;
  const dash = argv.indexOf("--");
  const options = dash >= 0 ? argv.slice(0, dash) : argv;
  const trailing = dash >= 0 ? argv.slice(dash + 1) : [];
  for (let i = 0; i < options.length; i++) {
    const flag = options[i]!;
    const value = () => { const next = options[++i]; if (next === undefined) throw new Error(`${flag} needs a value.`); return next; };
    try {
      if (flag === "--client") args.clients.push(value());
      else if (flag === "--server") serverText = value();
      else if (flag === "--env") {
        const text = value();
        const at = text.indexOf("=");
        const name = at < 0 ? text : text.slice(0, at);
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("--env needs a variable name like NAME or NAME=value.");
        const given = at < 0 ? environment[name] : text.slice(at + 1);
        if (given === undefined) throw new Error(`--env ${name}: that variable is not set in this shell.`);
        args.env[name] = given;
      } else if (flag === "--out") args.out = value();
      else if (flag === "--scratch") args.scratch = value();
      else if (flag === "--cwd") args.cwd = value();
      else if (flag === "--timeout") {
        const seconds = Number(value());
        if (!Number.isFinite(seconds) || seconds < 5 || seconds > 3600) throw new Error("--timeout must be between 5 and 3600 seconds.");
        args.timeoutSec = seconds;
      } else if (flag === "--json") args.json = true;
      else if (flag === "--keep") args.keep = true;
      else throw new Error(`Unknown option ${flag}.`);
    } catch (error) {
      io.err(`mcp-proof: ${(error as Error).message}\n`);
      return null;
    }
  }
  try {
    if (serverText !== undefined && trailing.length > 0) throw new Error("Give the server once: with --server or after --, not both.");
    if (serverText !== undefined) args.server = parseLaunch(serverText);
    else if (trailing.length > 0) args.server = { command: trailing[0]!, args: trailing.slice(1) };
    else throw new Error("Say which server to check, for example: mcp-proof run -- npx -y your-mcp-server (or run mcp-proof setup for a guided first run).");
  } catch (error) {
    io.err(`mcp-proof: ${(error as Error).message}\n`);
    return null;
  }
  for (const id of args.clients) {
    if (!recipeById(id)) { io.err(`mcp-proof: unknown client "${id}". Known: ${RECIPES.map(recipe => recipe.id).join(", ")}.\n`); return null; }
  }
  return args;
}

function writeOutputs(dir: string, record: ReturnType<typeof parseCompat>): void {
  mkdirSync(path.join(dir, "badges"), { recursive: true });
  writeFileSync(path.join(dir, "compat.json"), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(path.join(dir, "table.md"), renderTable(record));
  for (const file of renderBadges(record)) writeFileSync(path.join(dir, "badges", file.name), file.content);
}

export async function main(argv: string[], io: Io, environment: NodeJS.ProcessEnv = process.env): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "-h" || command === "help") { io.out(USAGE); return command === undefined ? 2 : 0; }
  if (command === "--version" || command === "-v") { io.out(`${VERSION}\n`); return 0; }

  if (command === "setup") {
    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY) && !rest.includes("--help") && !rest.includes("--prompt");
    const terminal = interactive ? terminalAsk() : undefined;
    try {
      return await setupCommand(rest, { ...io, ask: terminal?.ask, interactive, cwd: process.cwd() });
    } finally {
      terminal?.close();
    }
  }

  if (command === "wrap") {
    const dash = rest.indexOf("--");
    const logAt = rest.indexOf("--log");
    const cwdAt = rest.indexOf("--cwd");
    if (dash < 0 || logAt < 0 || logAt > dash || !rest[logAt + 1] || dash + 1 >= rest.length || (cwdAt >= 0 && (cwdAt > dash || !rest[cwdAt + 1]))) {
      io.err("Usage: mcp-proof wrap --log <file> [--cwd <dir>] -- <server command> [args...]\n");
      return 2;
    }
    return wrap(rest[logAt + 1]!, { command: rest[dash + 1]!, args: rest.slice(dash + 2) }, cwdAt >= 0 ? rest[cwdAt + 1] : undefined);
  }

  if (command === "clients") {
    const lines: string[] = [];
    // Detection runs the client's own --version, so it gets a throwaway home too and never your real settings.
    const scratch = mkdtempSync(path.join(os.tmpdir(), "mcp-proof-"));
    const probe = createHome(scratch, {}, environment);
    for (const recipe of RECIPES) {
      const found = await recipe.detect(probe.env).catch(() => ({ installed: false, version: undefined as string | undefined }));
      lines.push(`${recipe.id.padEnd(12)} ${found.installed ? `installed${found.version ? ` ${found.version}` : ""}` : `not installed. ${recipe.installHint}`}`);
    }
    rmSync(scratch, { recursive: true, force: true });
    io.out(`${lines.join("\n")}\n`);
    return 0;
  }

  if (command === "table" || command === "badge" || command === "validate") {
    const outAt = rest.indexOf("--out");
    const file = rest.find((arg, index) => !arg.startsWith("--") && index !== (outAt >= 0 ? outAt + 1 : -1));
    if (!file) { io.err(`Usage: mcp-proof ${command} <compat.json>${command === "badge" ? " --out <dir>" : ""}\n`); return 2; }
    let text: string;
    try { text = readFileSync(file, "utf8"); } catch { io.err("mcp-proof: could not read that file.\n"); return 2; }
    if (command === "validate") {
      let problems: string[];
      try { problems = validate(JSON.parse(text)); } catch { io.err("mcp-proof: the file is not valid JSON.\n"); return 1; }
      if (problems.length > 0) { io.err(`${problems.join("\n")}\n`); return 1; }
      io.out("ok\n");
      return 0;
    }
    let record;
    try { record = parseCompat(text); } catch (error) { io.err(`mcp-proof: ${(error as Error).message}\n`); return 1; }
    if (command === "table") { io.out(renderTable(record)); return 0; }
    if (outAt < 0 || !rest[outAt + 1]) { io.err("Usage: mcp-proof badge <compat.json> --out <dir>\n"); return 2; }
    mkdirSync(rest[outAt + 1]!, { recursive: true });
    for (const badge of renderBadges(record)) writeFileSync(path.join(rest[outAt + 1]!, badge.name), badge.content);
    io.out(`Wrote ${record.results.length * 2} badge files.\n`);
    return 0;
  }

  if (command === "run") {
    const args = parseRun(rest, io, environment);
    if (!args) return 2;
    const recipes = args.clients.length > 0 ? args.clients.map(id => recipeById(id)!) : RECIPES;
    const record = await runAll({ server: args.server, recipes, serverEnv: args.env, timeoutMs: args.timeoutSec * 1000, scratchRoot: args.scratch, serverCwd: path.resolve(args.cwd ?? process.cwd()), keep: args.keep, onProgress: message => io.err(`${message}\n`) });
    if (args.out) writeOutputs(args.out, record);
    io.out(args.json ? `${JSON.stringify(record, null, 2)}\n` : renderSummary(record));
    const why = renderNotes(record);
    if (!args.json && why.length > 0) io.err(["", "Why it did not verify:", ...why.map(line => `  ${line}`), ""].join(String.fromCharCode(10)));
    if (!args.json) io.err(`\n${nextHints(record.results.map(result => result.label), { out: args.out, server: args.server.command }).map(line => `- ${line}`).join("\n")}\n`);
    const ran = record.results.filter(result => result.label !== "not-installed");
    const named = new Set(args.clients);
    const missingNamed = record.results.some(result => result.label === "not-installed" && named.has(result.client));
    if (ran.length === 0 || missingNamed || ran.some(result => result.label !== "verified")) return 1;
    return 0;
  }

  io.err(`mcp-proof: unknown command "${command}".\n${USAGE}`);
  return 2;
}
