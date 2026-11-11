import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "./cli.js";
import { sample } from "./compat.test.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURE = path.join(ROOT, "test", "fixtures", "echo-server.mjs");

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) }, text: () => ({ out: out.join(""), err: err.join("") }) };
}
const temp = () => mkdtempSync(path.join(process.env.MCP_PROOF_TEST_TMP ?? os.tmpdir(), "mcp-proof-cli-"));

describe("basic commands", () => {
  it("prints usage with no arguments (exit 2) and with --help (exit 0)", async () => {
    const a = capture();
    expect(await main([], a.io, {})).toBe(2);
    expect(a.text().out).toContain("Usage:");
    const b = capture();
    expect(await main(["--help"], b.io, {})).toBe(0);
  });
  it("prints the version", async () => {
    const c = capture();
    expect(await main(["--version"], c.io, {})).toBe(0);
    expect(c.text().out).toMatch(/^\d+\.\d+\.\d+\n$/);
    // The reported version always equals package.json, so a release cannot ship with a stale number.
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string };
    expect(c.text().out.trim()).toBe(pkg.version);
  });
  it("rejects an unknown command", async () => {
    const c = capture();
    expect(await main(["frobnicate"], c.io, {})).toBe(2);
    expect(c.text().err).toContain("unknown command");
  });
});

describe("run argument errors (exit 2, one plain message)", () => {
  const cases: Array<[string[], RegExp]> = [
    [["run"], /Say which server/],
    [["run", "--client", "nope", "--", "x"], /unknown client/],
    [["run", "--timeout", "1", "--", "x"], /--timeout/],
    [["run", "--env", "9bad=1", "--", "x"], /variable name/],
    [["run", "--env", "NOT_SET_ANYWHERE", "--", "x"], /not set/],
    [["run", "--server", "a b", "--", "x"], /once/],
    [["run", "--wat", "--", "x"], /Unknown option/],
    [["run", "--client"], /needs a value/],
    [["run", "--server", 'a "b'], /quote/],
  ];
  for (const [argv, pattern] of cases) {
    it(argv.join(" "), async () => {
      const c = capture();
      expect(await main(argv, c.io, {})).toBe(2);
      expect(c.text().err).toMatch(pattern);
    });
  }
});

describe("run, table, badge and validate", () => {
  it("runs the stand-in against the fixture, writes outputs and exits 0", async () => {
    const out = path.join(temp(), "out");
    const c = capture();
    const code = await main(["run", "--client", "standin", "--out", out, "--scratch", temp(), "--", process.execPath, FIXTURE], c.io, {});
    expect(code).toBe(0);
    expect(c.text().out).toContain("verified");
    for (const file of ["compat.json", "table.md", path.join("badges", "standin.svg"), path.join("badges", "standin.json")]) expect(existsSync(path.join(out, file))).toBe(true);
    const compat = path.join(out, "compat.json");
    const v = capture();
    expect(await main(["validate", compat], v.io, {})).toBe(0);
    const t = capture();
    expect(await main(["table", compat], t.io, {})).toBe(0);
    expect(t.text().out).toContain("| Client |");
    const badges = path.join(temp(), "b");
    const b = capture();
    expect(await main(["badge", compat, "--out", badges], b.io, {})).toBe(0);
    expect(existsSync(path.join(badges, "standin.svg"))).toBe(true);
  });

  it("exits 1 when a server does not verify", async () => {
    const c = capture();
    const code = await main(["run", "--client", "standin", "--scratch", temp(), "--timeout", "10", "--env", "ECHO_SERVER_MODE=exit-early", "--", process.execPath, FIXTURE], c.io, {});
    expect(code).toBe(1);
    expect(c.text().out).toContain("failed");
  });

  it("says why on the error stream when a result does not verify, and keeps stdout exactly the summary", async () => {
    const c = capture();
    await main(["run", "--client", "standin", "--scratch", temp(), "--timeout", "10", "--env", "ECHO_SERVER_MODE=exit-early", "--", process.execPath, FIXTURE], c.io, {});
    const { out, err } = c.text();
    expect(out.trim().split(String.fromCharCode(10))).toHaveLength(1);
    expect(err).toMatch(/Why it did not verify/);
    expect(err).toMatch(/mcp-proof stand-in client: .*(exited|answering)/);
  });
  it("prints no reason block for a verified run", async () => {
    const c = capture();
    await main(["run", "--client", "standin", "--scratch", temp(), "--", process.execPath, FIXTURE], c.io, {});
    expect(c.text().err).not.toMatch(/Why it did not verify/);
  });

  it("copies a named variable from the environment passed in", async () => {
    const c = capture();
    const code = await main(["run", "--client", "standin", "--scratch", temp(), "--json", "--env", "ECHO_SERVER_MODE", "--", process.execPath, FIXTURE], c.io, { ECHO_SERVER_MODE: "no-tools" });
    expect(code).toBe(1);
    expect(JSON.parse(c.text().out).results[0].label).toBe("started");
  });

  it("validate and table reject broken files; badge needs --out", async () => {
    const dir = temp();
    const bad = path.join(dir, "bad.json");
    writeFileSync(bad, "{}");
    const good = path.join(dir, "good.json");
    writeFileSync(good, JSON.stringify(sample()));
    const notJson = path.join(dir, "x.json");
    writeFileSync(notJson, "nope");
    expect(await main(["validate", bad], capture().io, {})).toBe(1);
    expect(await main(["validate", notJson], capture().io, {})).toBe(1);
    expect(await main(["table", bad], capture().io, {})).toBe(1);
    expect(await main(["table", path.join(dir, "missing.json")], capture().io, {})).toBe(2);
    expect(await main(["badge", good], capture().io, {})).toBe(2);
    expect(readFileSync(good, "utf8")).toContain("claude-code");
  });

  it("lists clients", async () => {
    const c = capture();
    expect(await main(["clients"], c.io, {})).toBe(0);
    expect(c.text().out).toContain("standin");
    expect(c.text().out).toContain("claude-code");
  });
});
