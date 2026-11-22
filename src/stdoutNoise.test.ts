import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LineLogger, type LogEntry } from "./log.js";
import { parseProcess, stdoutNoiseNote } from "./why.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const MAIN = path.join(ROOT, "dist", "main.js");

describe("LineLogger counts lines that are not protocol messages", () => {
  const run = (chunks: string[], end = true) => {
    const entries: LogEntry[] = [];
    const logger = new LineLogger("server-to-client", entry => entries.push(entry));
    for (const chunk of chunks) logger.push(chunk);
    if (end) logger.end();
    return { entries, noise: logger.noiseLines };
  };
  it("counts a banner but not JSON-RPC lines or blank lines", () => {
    const rpc = JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} });
    const { entries, noise } = run(["starting up...\n", "\n", rpc + "\n", "   \n", "listening on 3000\n"]);
    expect(noise).toBe(2);
    expect(entries).toHaveLength(1);
  });
  it("counts a banner split across chunks once, and an unterminated last line at end()", () => {
    expect(run(["start", "ing up\n"]).noise).toBe(1);
    expect(run(["half a banner"]).noise).toBe(1);
    expect(run(["half a banner"], false).noise).toBe(0);
  });
  it("does not count a JSON-RPC batch array, CRLF line ends or a BOM before the first message", () => {
    const rpc = JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} });
    expect(run([`[${rpc},${rpc}]\n`]).noise).toBe(0);
    expect(run([`${rpc}\r\n`, "﻿" + rpc + "\n"]).noise).toBe(0);
  });
  it("does not count the tail of an oversized line that was dropped, and keeps counting after it", () => {
    const logger = new LineLogger("server-to-client", () => {});
    logger.push("x".repeat(4_000_001));
    logger.push("tail of the same huge line\n");
    expect(logger.noiseLines).toBe(0);
    logger.push("a real banner\n");
    expect(logger.noiseLines).toBe(1);
  });
  it("calls onFirstNoise once, at the first noise line", () => {
    const logger = new LineLogger("server-to-client", () => {});
    let calls = 0;
    logger.onFirstNoise = () => { calls += 1; };
    logger.push("one\ntwo\nthree\n");
    expect(calls).toBe(1);
    expect(logger.noiseLines).toBe(3);
  });
  it("keeps no text of the noise", () => {
    const secret = "sk-FAKE-" + "y".repeat(20);
    const { entries } = run([`token ${secret}\n`]);
    expect(JSON.stringify(entries)).not.toContain(secret);
  });
});

describe("the noise count reaches the note", () => {
  it("parseProcess reads the stdout-noise fact and ignores a bad one", () => {
    const good = JSON.stringify({ t: 1, process: "stdout-noise", lines: 3 });
    expect(parseProcess(good + "\n").stdoutNoiseLines).toBe(3);
    expect(parseProcess(JSON.stringify({ t: 1, process: "stdout-noise", lines: 0 })).stdoutNoiseLines).toBeUndefined();
    expect(parseProcess(JSON.stringify({ t: 1, process: "stdout-noise", lines: "many" })).stdoutNoiseLines).toBeUndefined();
  });
  it("stdoutNoiseNote says logs belong on stderr and handles one line", () => {
    expect(stdoutNoiseNote(1)).toContain("1 line to stdout that is not a JSON-RPC message");
    expect(stdoutNoiseNote(2)).toContain("2 lines to stdout that are not");
    expect(stdoutNoiseNote(2)).toContain("stderr");
  });
});

describe("mcp-proof wrap records a banner count and passes every byte through", () => {
  it("writes one stdout-noise fact with a count and no text", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mcp-proof-noise-"));
    try {
      const server = path.join(dir, "server.mjs");
      writeFileSync(server, "console.log('SECRET-BANNER starting');\nconsole.log(JSON.stringify({jsonrpc:'2.0',id:0,result:{}}));\nprocess.stdin.resume();\nsetTimeout(()=>process.exit(0),300);\n");
      const logFile = path.join(dir, "proof.log");
      const child = spawn(process.execPath, [MAIN, "wrap", "--log", logFile, "--", process.execPath, server], { stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      child.stdout.on("data", chunk => { out += chunk.toString("utf8"); });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize" }) + "\n");
      await new Promise(resolve => child.on("close", resolve));
      const log = readFileSync(logFile, "utf8");
      expect(out).toContain("SECRET-BANNER starting");
      expect(log).toContain('"process":"stdout-noise"');
      expect(log).toContain('"lines":1');
      expect(log).not.toContain("SECRET-BANNER");
      expect(parseProcess(log).stdoutNoiseLines).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
