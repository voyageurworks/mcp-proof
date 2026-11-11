import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain ES module in scripts/, used by the survey workflow; tests are not type-checked in the build.
import { handshakeOf, renderSurvey, resolveBin } from "../scripts/survey.mjs";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("resolveBin: which file a package starts", () => {
  it("takes a string bin as it is, without a leading ./", () => {
    expect(resolveBin({ name: "shadcn", bin: "./dist/index.js" })).toBe("dist/index.js");
  });
  it("prefers the bin named like the package, else the first one", () => {
    expect(resolveBin({ name: "@scope/thing-mcp", bin: { other: "a.js", "thing-mcp": "./b.js" } })).toBe("b.js");
    expect(resolveBin({ name: "@modelcontextprotocol/server-everything", bin: { "mcp-server-everything": "dist/index.js" } })).toBe("dist/index.js");
  });
  it("is undefined when there is no bin or it is odd", () => {
    expect(resolveBin({ name: "x" })).toBeUndefined();
    expect(resolveBin({ name: "x", bin: {} })).toBeUndefined();
    expect(resolveBin({ name: "x", bin: "../outside.js" })).toBeUndefined();
    expect(resolveBin({ name: "x", bin: "/abs/path.js" })).toBeUndefined();
  });
});

describe("handshakeOf: which handshake the log shows", () => {
  it("lists server/discover and initialize in that order, or a dash", () => {
    expect(handshakeOf(["server/discover", "tools/list"])).toBe("server/discover");
    expect(handshakeOf(["initialize", "tools/list"])).toBe("initialize");
    expect(handshakeOf(["server/discover", "initialize", "tools/list"])).toBe("server/discover, initialize");
    expect(handshakeOf(["tools/list"])).toBe("-");
  });
});

describe("renderSurvey", () => {
  const base = { date: "2026-12-03", claudeCode: "2.9.9", mcpProof: "0.1.5", system: "linux x64, Node 24.0.0" };
  const rows = [
    { slug: "a", pkg: "a-mcp", version: "1.0.0", claude: "verified", standin: "verified", handshake: "initialize", note: "" },
    { slug: "b", pkg: "@s/b", version: "2.0.0", claude: "failed", standin: "verified", handshake: "-", note: "re-run once" },
    { slug: "c", pkg: "c", version: "", claude: "not run", standin: "not run", handshake: "-", note: "install failed" },
  ];
  const text: string = renderSurvey({ ...base, rows });

  it("states the date, client version, system and what verified means", () => {
    expect(text).toContain("2026-12-03");
    expect(text).toContain("Claude Code 2.9.9");
    expect(text).toContain("linux x64, Node 24.0.0");
    expect(text).toMatch(/does \*\*not\*\* mean a tool was called/);
  });
  it("puts every server in the table with its exact version", () => {
    expect(text).toContain("| `a-mcp` 1.0.0 |");
    expect(text).toContain("| `@s/b` 2.0.0 |");
  });
  it("words a non-verified result neutrally and does not say a project is broken", () => {
    expect(text).toMatch(/did not verify in this run/);
    expect(text).not.toMatch(/\b(broken|buggy|bad|unreliable|fails)\b/i);
    expect(text).toMatch(/not a ranking/i);
  });
  it("says what is not covered", () => {
    expect(text).toMatch(/one real client/i);
    expect(text).toMatch(/no credentials/i);
  });
});

describe("survey/servers.json", () => {
  const list = JSON.parse(read("survey/servers.json")) as Array<{ slug: string; package: string; args?: string[] }>;
  it("has unique slugs, plausible package names and string-array args", () => {
    expect(list.length).toBeGreaterThanOrEqual(10);
    expect(new Set(list.map(s => s.slug)).size).toBe(list.length);
    for (const s of list) {
      expect(s.slug).toMatch(/^[a-z0-9-]+$/);
      expect(s.package).toMatch(/^(@[a-z0-9~._-]+\/)?[a-z0-9~._-]+$/);
      expect(Array.isArray(s.args ?? [])).toBe(true);
    }
  });
  it("carries no credential, no URL and no environment value", () => {
    const text = read("survey/servers.json");
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/(token|secret|password|api[_-]?key)/i);
  });
});

describe(".github/workflows/survey.yml", () => {
  const text = read(".github/workflows/survey.yml");
  it("runs by hand or monthly, never on a pull request, and only on a free runner", () => {
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).toMatch(/schedule:\s*\n\s+- cron: "\d+ \d+ \d+ \* \*"/);
    expect(text).not.toMatch(/pull_request_target/);
    expect(text).not.toMatch(/\bpull_request:/);
  });
  it("lets only the publish job write, and the job that runs third-party servers is read-only", () => {
    const runJob = text.slice(text.indexOf("\n  run:"), text.indexOf("\n  publish:"));
    const publishJob = text.slice(text.indexOf("\n  publish:"));
    expect(runJob).toMatch(/permissions:\s*\n\s+contents: read/);
    expect(runJob).not.toMatch(/contents: write/);
    expect(publishJob).toMatch(/contents: write/);
    expect(text.match(/contents: write/g)).toHaveLength(1);
  });
  it("does not run any dependency or third-party code in the publish job", () => {
    const publishJob = text.slice(text.indexOf("\n  publish:"));
    expect(publishJob).not.toMatch(/npm |pnpm |npx |node /);
  });
  it("uses only GitHub-owned actions pinned by full commit SHA", () => {
    const uses = [...text.matchAll(/uses:\s*(\S+)/g)].map(m => m[1]!);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/^actions\/[a-z-]+@[0-9a-f]{40}$/);
  });
  it("never writes to main", () => {
    expect(text).toMatch(/survey-data/);
    expect(text).not.toMatch(/push[^\n]*\bmain\b/);
  });
});
