import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { ownPackage, ownPackageNote } from "./ownPackage.js";

/**
 * `mcp-proof setup`: a guided first run. It asks (or takes flags for) which server to prove, which clients to try and where to put the
 * evidence, then prints every step with your server filled in: the warm-up for a server that has to be downloaded, the run, how to read
 * the labels, how to paste the table and badges into a README and an optional GitHub Actions job. It writes nothing and runs nothing
 * itself; the only file it reads is the package.json beside you, for the package name (public information).
 */
export const PACKAGE = "@voyageurworks/mcp-proof";

/** A block to paste into an AI assistant that can run commands. docs/setup-prompt.md carries the same text. */
export const SETUP_PROMPT = `Please prove that my MCP server starts in real clients, using mcp-proof. It starts each client in a throwaway home, never installs a client and never touches my real client settings.
1. Run: npx -y ${PACKAGE} setup --help
2. Ask me for the command that starts my MCP server (for example: npx -y my-mcp-server). If this folder has a package.json, offer its name as the default.
3. Run: npx -y ${PACKAGE} setup --server "<that command>", then run each step it prints, one at a time. If the server is started with npx, run the warm-up step first.
4. Do not pass my API keys, tokens or other secrets on the command line. If the server needs one, tell me and wait.
5. Tell me in plain words which clients verified, which were not installed, which failed and why, and how to paste the table into my README.`;

const USAGE = `Usage: mcp-proof setup [--server "<server command line>"] [--out <dir>] [--ci] [--prompt]
  A guided first run: prints every step with your server filled in. With no flags in a terminal it asks. It writes nothing and runs nothing itself.
  --server  the command that starts your MCP server (default: npx -y <name from ./package.json>, when there is one)
  --out     where the evidence goes (default: proof)
  --ci      also print a GitHub Actions job
  --prompt  print a block to paste into an AI assistant that can run commands`;

/** ownPackage is set when the server command starts the package whose folder you are in (see ownPackage.ts). */
export type SetupChoice = { server: string; out: string; ci: boolean; ownPackage?: string };

/** Commands that download the server the first time they run, so the first client start can be slower than the client waits. */
export const needsWarmUp = (server: string) => /^\s*(npx|pnpm\s+dlx|yarn\s+dlx|bunx|uvx|pipx\s+run)\b/.test(server);

/** `npx -y <name>` from the package.json in `cwd`, or undefined. */
export function defaultServer(cwd: string): string | undefined {
  const file = path.join(cwd, "package.json");
  if (!existsSync(file)) return undefined;
  try {
    const name = (JSON.parse(readFileSync(file, "utf8")) as { name?: unknown }).name;
    return typeof name === "string" && /^(@[a-z0-9~._-]+\/)?[a-z0-9~._-]+$/.test(name) ? `npx -y ${name}` : undefined;
  } catch {
    return undefined;
  }
}

const quote = (value: string) => (/[\s"']/.test(value) ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : value);

/** Every step as text. Pure, so it can be tested for each choice. */
export function setupSteps(choice: SetupChoice): string {
  const indent = (text: string) => text.split("\n").map((line) => `     ${line}`).join("\n");
  const run = `npx -y ${PACKAGE} run --out ${quote(choice.out)} --server ${JSON.stringify(choice.server)}${choice.ownPackage ? " --cwd .." : ""}`;
  const ownNote = choice.ownPackage ? ownPackageNote(choice.ownPackage).split(" Run again")[0]! : "";
  const steps: string[] = [];
  if (needsWarmUp(choice.server)) steps.push(`Warm up your server once, so its first download is already done (a cold download can take longer than a client waits, and the client then shows "failed"):\n${indent(`${choice.server} --help`)}\n   (any quick run of the server will do; stop it with Ctrl+C if it waits for input)`);
  steps.push(`See which clients are installed here (mcp-proof never installs one, and never reads your real client settings):\n${indent(`npx -y ${PACKAGE} clients`)}`);
  steps.push(`Prove it. Each installed client starts in a throwaway home and is made to run your server:\n${indent(run)}\n   Exit code 0 = every client that ran was verified; 1 = one did not verify; 2 = a usage problem.${choice.ownPackage ? `
   --cwd .. starts your server from the parent folder. ${ownNote}` : ""}`);
  steps.push("Read the labels: verified = the client started your server and the log shows the handshake (initialize and initialized, or the newer server/discover) and tools/list; started = it started but tools/list did not follow; failed = it never completed the handshake; not-installed = nothing was run. Anything but verified comes with a note saying why.");
  steps.push(`Paste the evidence into your README: ${choice.out}/table.md is a ready table, ${choice.out}/badges/ holds badges and ${choice.out}/compat.json is the machine-readable record. Keep the date with it: a result only says what was true that day.`);
  if (choice.ci) steps.push(`Optional: refresh it in GitHub Actions. The job only finds clients you installed in an earlier step:\n${indent(ciJob(choice))}`);
  return `mcp-proof setup\nServer: ${choice.server}\nEvidence folder: ${choice.out}\n\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n\n")}`;
}

export const ciJob = (choice: SetupChoice) => `- uses: voyageurworks/mcp-proof@v0\n  with:\n    server: ${choice.server}\n    out: ${choice.out}`;

export type SetupIo = { out(text: string): void; err(text: string): void; ask?: (question: string) => Promise<string>; interactive?: boolean; cwd: string };

const flag = (args: string[], name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

/** The `setup` command. Returns the exit code: 0 ok, 2 for a usage problem. */
export async function setupCommand(args: string[], io: SetupIo): Promise<0 | 2> {
  if (args.includes("--help") || args.includes("-h")) return io.out(`${USAGE}\n`), 0;
  if (args.includes("--prompt")) return io.out(`${SETUP_PROMPT}\n`), 0;
  let server = flag(args, "--server");
  let out = flag(args, "--out");
  const suggested = defaultServer(io.cwd);
  if (io.interactive && io.ask) {
    if (!server) server = (await io.ask(`Command that starts your MCP server${suggested ? ` [${suggested}]` : " (for example: npx -y my-mcp-server)"} > `)).trim() || suggested;
    if (!out) out = (await io.ask("Folder for the evidence [proof] > ")).trim() || "proof";
  }
  server ??= suggested;
  out ??= "proof";
  if (!server) return io.err('mcp-proof: say which server to prove: mcp-proof setup --server "npx -y my-mcp-server" (or run it in a folder with a package.json).\n'), 2;
  const [command = "", ...rest] = server.trim().split(" ").filter(Boolean);
  const own = ownPackage(command, rest, io.cwd);
  io.out(`${setupSteps({ server, out, ci: args.includes("--ci"), ...(own ? { ownPackage: own } : {}) })}\n`);
  return 0;
}

/** Reads answers from the terminal. */
export function terminalAsk(): { ask: (question: string) => Promise<string>; close: () => void } {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return { ask: (question) => rl.question(question), close: () => rl.close() };
}

/** What to do after a `run`, from the labels only (printed on stderr, so the summary on stdout stays exactly the summary). */
export function nextHints(labels: string[], options: { out?: string; server: string }): string[] {
  const has = (label: string) => labels.includes(label);
  const ran = labels.filter((label) => label !== "not-installed");
  const hints: string[] = [];
  if (ran.length === 0) hints.push("No client was found on this computer, so nothing ran. Install one yourself (mcp-proof never installs a client); `mcp-proof clients` says which are supported and how.");
  if (has("verified")) hints.push(options.out ? `Paste ${options.out}/table.md into your README (and the badges from ${options.out}/badges/). The date is part of the evidence.` : "Add --out proof to write a README-ready table, badges and compat.json.");
  if (has("failed") || has("started")) {
    hints.push("A client did not verify: the reasons are listed above under Why it did not verify. If your server is started with npx or another downloader, run it once yourself first so the download is cached (a cold download can take longer than the client waits), then run again; --timeout 180 gives more time and --keep keeps the throwaway home to look at.");
  }
  if (has("not-installed") && ran.length > 0) hints.push("Clients marked not-installed were not run; that is not a failure.");
  hints.push("First time? mcp-proof setup   (a guided walk-through)");
  return hints;
}
