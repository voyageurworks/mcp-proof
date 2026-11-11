import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLog } from "./log.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const MAIN = path.join(ROOT, "dist", "main.js");
const FIXTURE = path.join(ROOT, "test", "fixtures", "echo-server.mjs");

function runWrapper(logFile: string, input: string, server: string[] = [process.execPath, FIXTURE]): Promise<{ stdout: string; code: number | null }> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [MAIN, "wrap", "--log", logFile, "--", ...server], { stdio: ["pipe", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString("utf8"); });
    child.on("close", code => resolve({ stdout, code }));
    child.stdin.end(input);
  });
}

describe("mcp-proof wrap", () => {
  it("passes messages through unchanged and logs method names only", async () => {
    const secret = "FAKE-secret-" + "z".repeat(24);
    const log = path.join(mkdtempSync(path.join(process.env.MCP_PROOF_TEST_TMP ?? os.tmpdir(), "mcp-proof-wrap-")), "proof.log");
    const input = [
      JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: secret } } }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    ].join("\n") + "\n";
    const direct = await new Promise<string>(resolve => {
      const child = spawn(process.execPath, [FIXTURE], { stdio: ["pipe", "pipe", "ignore"] });
      let out = "";
      child.stdout.on("data", chunk => { out += chunk.toString("utf8"); });
      child.on("close", () => resolve(out));
      child.stdin.end(input);
    });
    const wrapped = await runWrapper(log, input);
    // The client sees exactly what the server said.
    expect(wrapped.stdout).toBe(direct);
    expect(wrapped.code).toBe(0);
    const text = readFileSync(log, "utf8");
    expect(text).not.toContain(secret);
    expect(text).not.toContain("echo-fixture");
    const entries = parseLog(text);
    expect(entries.filter(entry => entry.direction === "client-to-server").map(entry => entry.method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    expect(entries.filter(entry => entry.direction === "server-to-client").map(entry => entry.kind)).toEqual(["response", "response"]);
  });

  it("ends when the server cannot start and says why in plain words", async () => {
    const log = path.join(mkdtempSync(path.join(process.env.MCP_PROOF_TEST_TMP ?? os.tmpdir(), "mcp-proof-wrap-")), "proof.log");
    const result = await runWrapper(log, "", [path.join(ROOT, "no-such-program.exe")]);
    expect(result.code).toBe(127);
    // Only one short fact is written (what kind of start error), never a message: so the result can say "not found".
    expect(existsSync(log)).toBe(true);
    const lines = readFileSync(log, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ process: "spawn-error", code: "ENOENT" });
  });

  it("returns the server's exit code", async () => {
    const log = path.join(mkdtempSync(path.join(process.env.MCP_PROOF_TEST_TMP ?? os.tmpdir(), "mcp-proof-wrap-")), "proof.log");
    const result = await runWrapper(log, "", [process.execPath, "-e", "process.exit(7)"]);
    expect(result.code).toBe(7);
  });

  it("rejects bad usage", async () => {
    const code = await new Promise<number | null>(resolve => {
      const child = spawn(process.execPath, [MAIN, "wrap", "--log"], { stdio: "ignore" });
      child.on("close", resolve);
    });
    expect(code).toBe(2);
  });
});
