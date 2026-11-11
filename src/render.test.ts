import { describe, expect, it } from "vitest";
import { badgeSvg, renderBadges, slug } from "./badge.js";
import { sample } from "./compat.test.js";
import { renderNotes, renderSummary, renderTable } from "./table.js";

describe("renderTable", () => {
  it("shows each client, explains each label used, and says stand-ins are not products", () => {
    const record = sample();
    record.results.push({ ...record.results[0]!, client: "standin", clientName: "mcp-proof stand-in client", standin: true, clientVersion: "built-in" });
    const table = renderTable(record);
    expect(table).toContain("| Claude Code | 2.1.317 |");
    expect(table).toContain("stand-in, not a real product");
    expect(table).toContain("- **verified**:");
    expect(table).toContain("- **not-installed**:");
    expect(table).not.toContain("- **failed**:");
    expect(table).toContain("2026-11-03");
  });
  it("escapes pipes in cells and lists notes", () => {
    const record = sample();
    record.results[0]!.clientName = "A|B";
    record.results[0]!.notes = ["watch out"];
    const table = renderTable(record);
    expect(table).toContain("A\\|B");
    expect(table).toContain("- A|B: watch out");
  });
});

describe("renderTable with a hostile compat.json", () => {
  it("never emits raw HTML and never lets a note start a new line or row", () => {
    const record = sample();
    record.results[0]!.clientName = "<script>alert(1)</script>";
    record.results[0]!.clientVersion = '1"><img src=x>';
    record.results[0]!.notes = ["first line\n| injected | row |\n- fake bullet"];
    const table = renderTable(record);
    expect(table).not.toMatch(/<script|<img/);
    expect(table).toContain("&lt;script&gt;");
    expect(table.split("\n").filter(line => line.startsWith("| injected"))).toEqual([]);
    expect(table.split("\n").filter(line => line.startsWith("- fake bullet"))).toEqual([]);
  });
});

describe("renderNotes: why a result did not verify, for the terminal", () => {
  it("lists the notes of results that did not verify, one line each, with the client name", () => {
    const record = sample();
    record.results[0]!.label = "failed";
    record.results[0]!.notes = ["The server exited at once." + String.fromCharCode(10) + "Check the command.", "A second note."];
    expect(renderNotes(record)).toEqual(["Claude Code: The server exited at once. Check the command.", "Claude Code: A second note."]);
  });
  it("says nothing for a verified result, even one with notes, and nothing for not-installed", () => {
    const record = sample();
    record.results[0]!.label = "verified";
    record.results[0]!.notes = ["Files in your real home folder changed."];
    expect(renderNotes(record)).toEqual([]);
    record.results[0]!.label = "not-installed";
    expect(renderNotes(record)).toEqual([]);
  });
});

describe("renderSummary", () => {
  it("prints the install hint for a missing client", () => {
    expect(renderSummary(sample())).toMatch(/Codex\s+not-installed\s+\(Install Codex by hand\.\)/);
  });
});

describe("badges", () => {
  it("makes an svg and a Shields endpoint file per client, with escaped text", () => {
    const record = sample();
    record.results[0]!.clientName = "A&B <x>";
    const files = renderBadges(record);
    expect(files.map(file => file.name)).toEqual(["claude-code.svg", "claude-code.json", "codex.svg", "codex.json"]);
    const svg = files[0]!.content;
    expect(svg).toContain("A&amp;B &lt;x&gt;");
    expect(svg).not.toContain("<x>");
    expect(JSON.parse(files[1]!.content)).toEqual({ schemaVersion: 1, label: "A&B <x>", message: "verified 2.1.317", color: "brightgreen" });
    expect(JSON.parse(files[3]!.content).color).toBe("lightgrey");
  });
  it("slug is file-name safe", () => {
    expect(slug("Claude Code / CLI!")).toBe("claude-code-cli");
    expect(slug("***")).toBe("client");
  });
  it("badgeSvg has a title for accessibility", () => {
    expect(badgeSvg("a", "b", "#000")).toContain("<title>a: b</title>");
  });
});
