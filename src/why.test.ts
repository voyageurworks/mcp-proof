import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { explainFailure, parseProcess } from "./why.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const MAIN = path.join(ROOT, "dist", "main.js");

describe("parseProcess: what the wrapper saw the server process do", () => {
  it("reads a spawn error code and an exit record, ignoring message lines and damage", () => {
    const text = [
      JSON.stringify({ t: 1, direction: "client-to-server", kind: "request", method: "initialize", id: 0 }),
      "not json",
      JSON.stringify({ t: 2, process: "spawn-error", code: "ENOENT" }),
      JSON.stringify({ t: 3, process: "exit", code: 3, afterMs: 80, clientClosed: false }),
    ].join("\n");
    expect(parseProcess(text)).toEqual({ spawnError: "ENOENT", exit: { code: 3, afterMs: 80, clientClosed: false } });
  });
  it("keeps only safe values: an errno-looking code, a number, a boolean", () => {
    const text = [
      JSON.stringify({ process: "spawn-error", code: "C:\\Users\\someone\\secret path" }),
      JSON.stringify({ process: "exit", code: "7; rm", afterMs: "x", clientClosed: "yes" }),
    ].join("\n");
    expect(parseProcess(text)).toEqual({});
  });
  it("is empty for an empty log", () => {
    expect(parseProcess("")).toEqual({});
  });
});

describe("explainFailure", () => {
  const none = {};
  it("says the command was not found, and what to check, for ENOENT", () => {
    const text = explainFailure({ methods: [], process: { spawnError: "ENOENT" } });
    expect(text).toMatch(/could not be started/);
    expect(text).toMatch(/not found/);
    expect(text).toMatch(/PATH/);
  });
  it("names another start error by its code and nothing else", () => {
    expect(explainFailure({ methods: [], process: { spawnError: "EACCES" } })).toContain("EACCES");
  });
  it("says a server that ended by itself exited, with its code, and points at stdout versus stderr", () => {
    const text = explainFailure({ methods: ["server/discover"], process: { exit: { code: 3, afterMs: 120, clientClosed: false } } });
    expect(text).toMatch(/exited/);
    expect(text).toContain("code 3");
    expect(text).toMatch(/standard error/);
  });
  it("adds a spelling hint for the exit codes a shell gives a program it cannot find, and not for others", () => {
    const hint = (code: number) => explainFailure({ methods: [], process: { exit: { code, afterMs: 50, clientClosed: false } } });
    for (const code of [1, 127, 9009]) expect(hint(code)).toMatch(/check the spelling/);
    for (const code of [0, 3, 2]) expect(hint(code)).not.toMatch(/spelling/);
  });
  it("does not call an exit after the client had gone an early exit", () => {
    const text = explainFailure({ methods: ["server/discover"], process: { exit: { code: 0, afterMs: 31000, clientClosed: true } } });
    expect(text).not.toMatch(/exited by itself/);
    expect(text).toMatch(/never answered/);
  });
  it("says a server that kept running but stayed silent was still running", () => {
    const text = explainFailure({ methods: ["server/discover", "tools/list"], process: none });
    expect(text).toMatch(/still running/);
    expect(text).toMatch(/standard output/);
  });
  it("keeps the old words when the client never reached the server at all", () => {
    expect(explainFailure({ methods: [], process: none })).toMatch(/never reached the server/);
  });
});

/** Runs the real wrapper around a command and returns the log text, so the log lines are tested for real. */
function wrapLog(server: string[], stdin: "end" | "hold"): Promise<string> {
  const dir = mkdtempSync(path.join(process.env.MCP_PROOF_TEST_TMP ?? os.tmpdir(), "mcp-proof-why-"));
  const log = path.join(dir, "proof.log");
  return new Promise(resolve => {
    const child = spawn(process.execPath, [MAIN, "wrap", "--log", log, "--", ...server], { stdio: ["pipe", "ignore", "ignore"] });
    const finish = () => { try { resolve(readFileSync(log, "utf8")); } catch { resolve(""); } };
    child.on("close", finish);
    if (stdin === "end") child.stdin.end();
    else setTimeout(() => { child.kill(); }, 1500);
  });
}

describe("the wrapper records what the server process did (names, codes and times only)", () => {
  it("records an exit by itself, with its code, while the client was still connected", async () => {
    const text = await wrapLog([process.execPath, "-e", "process.exit(3)"], "hold");
    expect(parseProcess(text).exit).toMatchObject({ code: 3, clientClosed: false });
  });
  it("records a start error for a command that does not exist", async () => {
    const text = await wrapLog(["mcp-proof-no-such-command-xyz"], "hold");
    const seen = parseProcess(text);
    // On Windows the command runs through cmd, which exits with a code instead of failing to spawn.
    expect(seen.spawnError === "ENOENT" || (seen.exit?.code ?? 0) !== 0).toBe(true);
  });
  it("records nothing about an exit for a server that keeps running until the client kills the wrapper", async () => {
    const text = await wrapLog([process.execPath, "-e", "setInterval(()=>{},1000)"], "hold");
    expect(parseProcess(text).exit).toBeUndefined();
  });
});
