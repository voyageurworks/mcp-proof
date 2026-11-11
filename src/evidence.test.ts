import { describe, expect, it } from "vitest";
import { labelFor } from "./evidence.js";
import { parseLog, summarize } from "./log.js";

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
