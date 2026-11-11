import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const json = (file: string) => JSON.parse(readFileSync(path.join(ROOT, file), "utf8")) as Record<string, any>;
const pkg = json("package.json");

describe("Claude Code plugin", () => {
  const plugin = () => json(".claude-plugin/plugin.json");
  const market = () => json(".claude-plugin/marketplace.json");

  it("has a plugin manifest that names the skill folder and carries the package version", () => {
    expect(plugin().name).toBe("mcp-proof");
    expect(plugin().version).toBe(pkg.version);
    expect(plugin().skills).toBe("./skill");
    expect(plugin().author.name).toBe("Voyageur Works");
    expect(plugin().license).toBe("MIT");
  });

  it("has a marketplace with one plugin that points at this repository and carries the same version", () => {
    expect(market().name).toBe("voyageurworks-mcp-proof");
    expect(market().plugins).toHaveLength(1);
    const entry = market().plugins[0];
    expect(entry.name).toBe("mcp-proof");
    expect(entry.source).toBe("./");
    expect(entry.version).toBe(pkg.version);
  });

  it("has a skill whose frontmatter name matches the plugin and that tells the assistant the rules that protect the owner", () => {
    const text = readFileSync(path.join(ROOT, "skill/SKILL.md"), "utf8");
    expect(text).toMatch(/^---\r?\nname: mcp-proof\r?\ndescription: .{40,}\r?\n---/);
    expect(text).toContain("--cwd ..");
    expect(text).toMatch(/never install/i);
    expect(text).toMatch(/--env NAME/);
    // The only `--env NAME=...` allowed is the placeholder in the warning; no example may carry a real-looking value.
    expect(text).not.toMatch(/--env [A-Z_]+=(?!value\b)\S/);
  });

  it("ships an icon the marketplace can show", () => {
    expect(existsSync(path.join(ROOT, ".claude-plugin/icon.png"))).toBe(true);
  });

  it("keeps the plugin out of the npm package (it installs from git, not from npm)", () => {
    expect(pkg.files).not.toContain("skill");
    expect(pkg.files).not.toContain(".claude-plugin");
  });
});
