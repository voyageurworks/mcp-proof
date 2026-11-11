/**
 * The proof log: one JSON line per MCP message, holding the direction and the method name ONLY.
 * Parameters, results, ids that are not plain integers, and every other field are dropped on purpose, so the log can be
 * shown to anyone (including an AI assistant) without exposing what a client and a server said to each other.
 */
export type Direction = "client-to-server" | "server-to-client";
export type LogEntry = { direction: Direction; kind: "request" | "notification" | "response" | "error"; method?: string; id?: number };

const METHOD = /^[A-Za-z][A-Za-z0-9_./-]{0,63}$/;

/** Reduce one raw line of stdio traffic to a LogEntry, or undefined when it is not a JSON-RPC message. */
export function entryFromLine(direction: Direction, line: string): LogEntry | undefined {
  const text = line.trim();
  if (!text.startsWith("{")) return undefined;
  let message: unknown;
  try { message = JSON.parse(text); } catch { return undefined; }
  if (typeof message !== "object" || message === null || Array.isArray(message)) return undefined;
  const record = message as Record<string, unknown>;
  const id = typeof record.id === "number" && Number.isSafeInteger(record.id) ? record.id : undefined;
  if (typeof record.method === "string") {
    if (!METHOD.test(record.method)) return undefined;
    return { direction, kind: record.id === undefined ? "notification" : "request", method: record.method, ...(id === undefined ? {} : { id }) };
  }
  if ("result" in record || "error" in record) return { direction, kind: "error" in record ? "error" : "response", ...(id === undefined ? {} : { id }) };
  return undefined;
}

/** Splits a byte stream into lines and turns each into a LogEntry. Keeps no message text beyond the current partial line. */
export class LineLogger {
  private rest = "";
  constructor(private readonly direction: Direction, private readonly write: (entry: LogEntry) => void) {}
  push(chunk: Buffer | string): void {
    this.rest += chunk.toString("utf8");
    // A single unterminated line longer than this is not a message we care about; drop it rather than grow without bound.
    if (this.rest.length > 4_000_000 && !this.rest.includes("\n")) this.rest = "";
    let at: number;
    while ((at = this.rest.indexOf("\n")) >= 0) {
      const entry = entryFromLine(this.direction, this.rest.slice(0, at));
      this.rest = this.rest.slice(at + 1);
      if (entry) this.write(entry);
    }
  }
  end(): void {
    const entry = entryFromLine(this.direction, this.rest);
    this.rest = "";
    if (entry) this.write(entry);
  }
}

export function parseLog(text: string): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as LogEntry;
      if ((value.direction === "client-to-server" || value.direction === "server-to-client") && ["request", "notification", "response", "error"].includes(value.kind)) {
        entries.push({ direction: value.direction, kind: value.kind, ...(typeof value.method === "string" && METHOD.test(value.method) ? { method: value.method } : {}), ...(Number.isSafeInteger(value.id) ? { id: value.id } : {}) });
      }
    } catch { /* a damaged line is skipped */ }
  }
  return entries;
}

export type Handshake = { initialize: boolean; discover: boolean; initialized: boolean; toolsList: boolean; toolsListAnswered: boolean; methods: string[] };

/**
 * What the log proves. A request counts as answered only when the server sent a non-error response with the same id.
 * `discover` is the newer handshake: a client that sends `server/discover` and gets a non-error answer does not send `initialize`
 * (seen from Claude Code 2.1.322 against a server that supports it). A server that answers it with an error is not counted,
 * and the client then falls back to `initialize`.
 */
export function summarize(entries: LogEntry[]): Handshake {
  const requests = (method: string) => entries.filter(entry => entry.direction === "client-to-server" && entry.kind === "request" && entry.method === method);
  const answered = (method: string) => requests(method).some(request => request.id !== undefined && entries.some(entry => entry.direction === "server-to-client" && entry.kind === "response" && entry.id === request.id));
  const methods = [...new Set(entries.filter(entry => entry.method).map(entry => entry.method!))];
  return {
    initialize: answered("initialize"),
    discover: answered("server/discover"),
    initialized: entries.some(entry => entry.direction === "client-to-server" && entry.kind === "notification" && entry.method === "notifications/initialized"),
    toolsList: requests("tools/list").length > 0,
    toolsListAnswered: answered("tools/list"),
    methods,
  };
}
