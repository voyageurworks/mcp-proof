import { describe, expect, it } from "vitest";
import { labelFor } from "./evidence.js";
import { IdMap, LineLogger, parseLog, summarize, type Direction, type LogEntry } from "./log.js";

const log = (lines: object[]) => parseLog(lines.map(line => JSON.stringify(line)).join("\n"));

// What Claude Code 2.1.322 sent to a server that understands the newer handshake (server/discover instead of initialize).
const discoverFlow = [
  { direction: "client-to-server", kind: "request", method: "server/discover", id: 0 },
  { direction: "server-to-client", kind: "response", id: 0 },
  { direction: "client-to-server", kind: "request", method: "tools/list", id: 1 },
  { direction: "server-to-client", kind: "response", id: 1 },
];

// What the same client sent to a server that does not know server/discover: an error, then the classic handshake.
const fallbackFlow = [
  { direction: "client-to-server", kind: "request", method: "server/discover", id: 0 },
  { direction: "server-to-client", kind: "error", id: 0 },
  { direction: "client-to-server", kind: "request", method: "initialize", id: 1 },
  { direction: "server-to-client", kind: "response", id: 1 },
  { direction: "client-to-server", kind: "notification", method: "notifications/initialized" },
  { direction: "client-to-server", kind: "request", method: "tools/list", id: 2 },
  { direction: "server-to-client", kind: "response", id: 2 },
];

describe("labelFor", () => {
  it("verifies the classic handshake", () => {
    expect(labelFor(summarize(log(fallbackFlow)))).toBe("verified");
  });
  it("verifies a server that answered server/discover and tools/list, with no initialize", () => {
    const handshake = summarize(log(discoverFlow));
    expect(handshake).toMatchObject({ initialize: false, discover: true, toolsListAnswered: true });
    expect(labelFor(handshake)).toBe("verified");
  });
  it("does not count a server/discover that the server answered with an error", () => {
    const erroredOnly = discoverFlow.map(line => (line.id === 0 && line.kind === "response" ? { ...line, kind: "error" } : line));
    expect(summarize(log(erroredOnly)).discover).toBe(false);
    expect(labelFor(summarize(log(erroredOnly)))).toBe("failed");
  });
  it("is started, not verified, when server/discover was answered but tools/list was not", () => {
    expect(labelFor(summarize(log(discoverFlow.slice(0, 2))))).toBe("started");
    const noTools = discoverFlow.map(line => (line.id === 1 && line.kind === "response" ? { ...line, kind: "error" } : line));
    expect(labelFor(summarize(log(noTools)))).toBe("started");
  });
  it("is failed when nothing was answered", () => {
    expect(labelFor(summarize(log([])))).toBe("failed");
    expect(labelFor(summarize(log(discoverFlow.filter(line => line.direction === "client-to-server"))))).toBe("failed");
  });
  it("is started, not verified, when only initialize was answered", () => {
    expect(labelFor(summarize(log(fallbackFlow.slice(0, 4))))).toBe("started");
  });
});

// Claude Code 2.1.322 opens with server/discover under an id that is not a plain integer (the log must not keep it).
describe("ids that are not plain integers", () => {
  const through = (lines: Array<[Direction, object]>) => {
    const out: LogEntry[] = [];
    const ids = new IdMap();
    const loggers = { "client-to-server": new LineLogger("client-to-server", entry => out.push(entry), ids), "server-to-client": new LineLogger("server-to-client", entry => out.push(entry), ids) };
    for (const [direction, message] of lines) loggers[direction].push(JSON.stringify(message) + "\n");
    return out;
  };
  const SECRET_ID = "tok-FAKE-" + "z".repeat(16);

  it("matches an answer to a request whose id is a string, and never writes the string", () => {
    const entries = through([
      ["client-to-server", { jsonrpc: "2.0", id: SECRET_ID, method: "server/discover" }],
      ["server-to-client", { jsonrpc: "2.0", id: SECRET_ID, result: { name: "x" } }],
      ["client-to-server", { jsonrpc: "2.0", id: 7, method: "tools/list" }],
      ["server-to-client", { jsonrpc: "2.0", id: 7, result: { tools: [] } }],
    ]);
    expect(JSON.stringify(entries)).not.toContain(SECRET_ID);
    const handshake = summarize(entries);
    expect(handshake).toMatchObject({ discover: true, toolsListAnswered: true });
    expect(labelFor(handshake)).toBe("verified");
  });
  it("does not let a server request with the same id answer a client request", () => {
    const entries = through([
      ["client-to-server", { jsonrpc: "2.0", id: 0, method: "tools/list" }],
      ["server-to-client", { jsonrpc: "2.0", id: 0, method: "ping" }],
      ["client-to-server", { jsonrpc: "2.0", id: 0, result: {} }],
    ]);
    expect(summarize(entries).toolsListAnswered).toBe(false);
  });
  it("does not let an old answer count for a later request that reuses the id", () => {
    const entries = through([
      ["client-to-server", { jsonrpc: "2.0", id: "a", method: "initialize" }],
      ["server-to-client", { jsonrpc: "2.0", id: "a", result: {} }],
      ["client-to-server", { jsonrpc: "2.0", id: "a", method: "tools/list" }],
    ]);
    expect(summarize(entries)).toMatchObject({ initialize: true, toolsListAnswered: false });
  });
  it("ignores an answer with an id nobody asked for, and a null id", () => {
    const entries = through([
      ["client-to-server", { jsonrpc: "2.0", id: 1, method: "tools/list" }],
      ["server-to-client", { jsonrpc: "2.0", id: 99, result: {} }],
      ["server-to-client", { jsonrpc: "2.0", id: null, error: { code: -32700 } }],
    ]);
    expect(summarize(entries).toolsListAnswered).toBe(false);
  });
  it("counts an error answer as not answered", () => {
    const entries = through([
      ["client-to-server", { jsonrpc: "2.0", id: "q", method: "server/discover" }],
      ["server-to-client", { jsonrpc: "2.0", id: "q", error: { code: -32601, message: "Method not found" } }],
    ]);
    expect(summarize(entries).discover).toBe(false);
  });
});
