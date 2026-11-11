import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { IdMap, LineLogger, type LogEntry } from "./log.js";
import { platformLaunch, type Launch } from "./launch.js";

/**
 * `mcp-proof wrap --log <file> -- <server command>`: sits between a client and a server on stdio.
 * Every byte is passed through unchanged in both directions; only the method names are written to the log file.
 * Resolves with the server's exit code.
 */
export function wrap(logFile: string, launch: Launch, cwd?: string): Promise<number> {
  const real = platformLaunch(launch);
  const record = (entry: LogEntry) => appendFileSync(logFile, `${JSON.stringify({ t: Date.now(), ...entry })}\n`);
  // What the server PROCESS did, as short facts (an errno-like word, an exit code, a time): never any message content.
  const processFact = (fact: Record<string, string | number | boolean>) => appendFileSync(logFile, `${JSON.stringify({ t: Date.now(), ...fact })}\n`);
  const startedAt = Date.now();
  let clientClosed = false;
  let spawnFailed = false;
  const ids = new IdMap();
  const fromClient = new LineLogger("client-to-server", record, ids);
  const fromServer = new LineLogger("server-to-client", record, ids);
  return new Promise(resolve => {
    const child = spawn(real.command, real.args, { stdio: ["pipe", "pipe", "inherit"], windowsHide: true, windowsVerbatimArguments: real.verbatim === true, ...(cwd ? { cwd } : {}) });
    child.on("error", error => { spawnFailed = true; const code = (error as NodeJS.ErrnoException).code; if (typeof code === "string" && /^[A-Z][A-Z0-9_]{1,20}$/.test(code)) processFact({ process: "spawn-error", code }); process.stdin.destroy(); process.stderr.write(`mcp-proof: could not start the server: ${(error as NodeJS.ErrnoException).code ?? "error"}\n`); resolve(127); });
    process.stdin.on("data", chunk => { fromClient.push(chunk); child.stdin.write(chunk); });
    process.stdin.on("end", () => { clientClosed = true; fromClient.end(); child.stdin.end(); });
    child.stdin.on("error", () => { /* the server closed its input first */ });
    child.stdout.on("data", chunk => { fromServer.push(chunk); process.stdout.write(chunk); });
    child.stdout.on("end", () => fromServer.end());
    // When the server is gone the wrapper must end too, so the client sees a disconnect instead of a hang.
    child.on("close", code => { if (typeof code === "number" && !spawnFailed) processFact({ process: "exit", code, afterMs: Date.now() - startedAt, clientClosed }); process.stdin.destroy(); resolve(code ?? 0); });
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill());
  });
}
