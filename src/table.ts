import type { CompatRecord } from "./compat.js";
import { LABEL_MEANING } from "./evidence.js";
import type { Label } from "./types.js";

// Text in a compat.json may come from a file nobody here wrote, so it never reaches the Markdown as HTML or as a new line:
// line breaks become spaces, and < and > become entities (which render as the same characters).
const plain = (text: string) => text.replace(/\r?\n|\r/g, " ").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escapeCell = (text: string) => plain(text).replaceAll("|", "\\|");

/**
 * A README-ready table of one record. Stand-in rows say so, and each label used is explained below the table,
 * so a reader can tell what ran. No server output and no private paths appear here.
 */
export function renderTable(record: CompatRecord): string {
  const rows = record.results.map(result => {
    const name = result.standin ? `${result.clientName} (stand-in, not a real product)` : result.clientName;
    const version = result.clientVersion ?? "n/a";
    const system = `${record.system.os} ${record.system.arch}, Node ${record.system.node.replace(/^v/, "")}`;
    return `| ${escapeCell(name)} | ${escapeCell(version)} | ${escapeCell(system)} | ${result.label} | ${result.startedAt.slice(0, 10)} |`;
  });
  const used = [...new Set(record.results.map(result => result.label))] as Label[];
  const legend = used.map(label => `- **${label}**: ${LABEL_MEANING[label]}`);
  const notes = record.results.flatMap(result => result.notes.map(note => `- ${plain(result.clientName)}: ${plain(note)}`));
  return [
    `Checked with mcp-proof ${record.version} on ${record.generatedAt.slice(0, 10)}.`,
    "",
    "| Client | Version | System | Result | Date |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    ...legend,
    ...(notes.length > 0 ? ["", ...notes] : []),
    "",
  ].join("\n");
}

/** Why each result that ran but did not verify did not, one line per note, for the terminal (line breaks become spaces). */
export function renderNotes(record: CompatRecord): string[] {
  const oneLine = (text: string) => text.split(String.fromCharCode(13)).join("").split(String.fromCharCode(10)).join(" ");
  return record.results
    .filter(result => result.label !== "verified" && result.label !== "not-installed")
    .flatMap(result => result.notes.map(note => `${result.clientName}: ${oneLine(note)}`));
}

/** Plain text for the terminal. */
export function renderSummary(record: CompatRecord): string {
  const width = Math.max(...record.results.map(result => result.clientName.length), 6);
  const lines = record.results.map(result => {
    const version = result.clientVersion ? ` ${result.clientVersion}` : "";
    const extra = result.label === "not-installed" && result.installHint ? `  (${result.installHint})` : "";
    return `${result.clientName.padEnd(width)}  ${result.label}${version}${extra}`;
  });
  return `${lines.join("\n")}\n`;
}
