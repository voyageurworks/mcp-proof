import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ownPackage, ownPackageNote, startedPackage } from "./ownPackage.js";
import { setupCommand, setupSteps } from "./setup.js";

const project = (json: string) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mcp-proof own-"));
  writeFileSync(path.join(dir, "package.json"), json);
  return dir;
};

describe("startedPackage: which package a downloader command starts", () => {
  it("reads npx, npm exec, pnpm dlx, yarn dlx and bunx, without the version", () => {
    expect(startedPackage("npx", ["-y", "my-server"])).toBe("my-server");
    expect(startedPackage("npx", ["-y", "@scope/my-server@1.2.3"])).toBe("@scope/my-server");
    expect(startedPackage("npx.cmd", ["--yes", "my-server@latest", "--flag"])).toBe("my-server");
    expect(startedPackage("npm", ["exec", "--", "my-server"])).toBe("my-server");
    expect(startedPackage("pnpm", ["dlx", "my-server"])).toBe("my-server");
    expect(startedPackage("yarn", ["dlx", "my-server"])).toBe("my-server");
    expect(startedPackage("bunx", ["my-server"])).toBe("my-server");
  });
  it("says nothing for anything else", () => {
    expect(startedPackage("node", ["dist/main.js"])).toBeUndefined();
    expect(startedPackage("npx", ["-p", "other", "my-server"])).toBeUndefined();
    expect(startedPackage("npx", ["--package=other", "my-server"])).toBeUndefined();
    expect(startedPackage("npx", ["./local-folder"])).toBeUndefined();
    expect(startedPackage("npx", ["git+https://example.invalid/x.git"])).toBeUndefined();
    expect(startedPackage("npm", ["install", "my-server"])).toBeUndefined();
    expect(startedPackage("npx", [])).toBeUndefined();
  });
});

describe("ownPackage: the server command starts the package whose folder you are in", () => {
  it("finds it in the folder itself and in a subfolder (npm treats the nearest package.json as the project)", () => {
    const dir = project('{"name":"@scope/my-server","version":"1.0.0"}');
    expect(ownPackage("npx", ["-y", "@scope/my-server"], dir)).toBe("@scope/my-server");
    expect(ownPackage("npx", ["-y", "@scope/my-server@2.0.0"], dir)).toBe("@scope/my-server");
    const sub = path.join(dir, "src", "deep");
    mkdirSync(sub, { recursive: true });
    expect(ownPackage("npx", ["-y", "@scope/my-server"], sub)).toBe("@scope/my-server");
  });
  it("is quiet for a different package, a non-downloader command, a missing or broken package.json", () => {
    const dir = project('{"name":"my-server"}');
    expect(ownPackage("npx", ["-y", "another-server"], dir)).toBeUndefined();
    expect(ownPackage("node", ["dist/main.js"], dir)).toBeUndefined();
    expect(ownPackage("npx", ["-y", "my-server"], project("not json"))).toBeUndefined();
    expect(ownPackage("npx", ["-y", "my-server"], project("{}"))).toBeUndefined();
    expect(ownPackage("npx", ["-y", "my-server"], mkdtempSync(path.join(os.tmpdir(), "mcp-proof empty-")))).toBeUndefined();
  });
  it("words the note with the package name, what npx does and the fix", () => {
    const note = ownPackageNote("@scope/my-server");
    expect(note).toContain("@scope/my-server");
    expect(note).toContain("--cwd");
    expect(note).toMatch(/not the published/);
  });
});

describe("setup warns when you are in the package's own folder", () => {
  it("adds --cwd .. and the reason to the run step, and nothing otherwise", () => {
    const plain = setupSteps({ server: "npx -y my-server", out: "proof", ci: false });
    expect(plain).not.toContain("--cwd");
    const own = setupSteps({ server: "npx -y my-server", out: "proof", ci: false, ownPackage: "my-server" });
    expect(own).toContain('--server "npx -y my-server" --cwd ..');
    expect(own).toContain('"my-server"');
    expect(own).toMatch(/not the published/);
  });
  it("detects it from the folder setup runs in", async () => {
    const dir = project('{"name":"my-server"}');
    const out: string[] = [];
    await setupCommand([], { out: s => void out.push(s), err: () => {}, cwd: dir });
    expect(out.join("")).toContain("--cwd ..");
    const other: string[] = [];
    await setupCommand(["--server", "npx -y something-else"], { out: s => void other.push(s), err: () => {}, cwd: dir });
    expect(other.join("")).not.toContain("--cwd");
  });
});
