/**
 * The proof log: one JSON line per MCP message, holding the direction and the method name ONLY.
 * Parameters, results, ids that are not plain integers, and every other field are dropped on purpose, so the log can be
 * shown to anyone (including an AI assistant) without exposing what a client and a server said to each other.
 */
export type Direction = "client-to-server" | "server-to-client";
export type LogEntry = { direction: Direction; kind: "request" | "notification" | "response" | "error"; method?: string; id?: number };

const METHOD = /^[A-Za-z][A-Za-z0-9_./-]{0,63}$/;

/**
 * Pairs a request with its answer without ever writing the id. A client may use any string or number as an id (Claude Code
 * 2.1.322 opens with `server/discover` under one that is not a plain integer), and an id could carry anything, so the log must
 * not keep it. This map lives in memory only: every request gets the next small integer, an answer takes the integer of the
 * request it answers (same sender of the request, same raw id), and only that integer is logged. An answer nobody asked for, or
 * a null id, gets no id; a request that reuses an id starts a new pairing, so an old answer cannot count for it.
 */
export class IdMap {
  private readonly pending = new Map<string, number>();
  private next = 0;
  private static key(sender: Direction, id: unknown): string | undefined {
    return typeof id === "string" || typeof id === "number" ? `${sender}|${typeof id}|${String(id)}` : undefined;
  }
  /** A request from `sender`: the integer to log for it. */
  request(sender: Direction, id: unknown): number | undefined {
    const key = IdMap.key(sender, id);
    if (key === undefined || (this.pending.size >= 100_000 && !this.pending.has(key))) return undefined;
    const number = this.next++;
    this.pending.set(key, number);
    return number;
  }
  /** An answer sent by `answerer`: the integer of the request it answers, if there is one. */
  response(answerer: Direction, id: unknown): number | undefined {
    const key = IdMap.key(answerer === "client-to-server" ? "server-to-client" : "client-to-server", id);
    if (key === undefined) return undefined;
    const number = this.pending.get(key);
    this.pending.delete(key);
    return number;
  }
}

/** Reduce one raw line of stdio traffic to a LogEntry, or undefined when it is not a JSON-RPC message. */
export function entryFromLine(direction: Direction, line: string, ids?: IdMap): LogEntry | undefined {
  const text = line.trim();
  if (!text.startsWith("{")) return undefined;
  let message: unknown;
  try { message = JSON.parse(text); } catch { return undefined; }
  if (typeof message !== "object" || message === null || Array.isArray(message)) return undefined;
  const record = message as Record<string, unknown>;
  const plainId = typeof record.id === "number" && Number.isSafeInteger(record.id) ? record.id : undefined;
  if (typeof record.method === "string") {
    if (!METHOD.test(record.method)) return undefined;
    const kind = record.id === undefined ? "notification" : "request";
    const id = ids ? (kind === "request" ? ids.request(direction, record.id) : undefined) : plainId;
    return { direction, kind, method: record.method, ...(id === undefined ? {} : { id }) };
  }
  if ("result" in record || "error" in record) {
    const id = ids ? ids.response(direction, record.id) : plainId;
    return { direction, kind: "error" in record ? "error" : "response", ...(id === undefined ? {} : { id }) };
  }
  return undefined;
}

/** Splits a byte stream into lines and turns each into a LogEntry. Keeps no message text beyond the current partial line. */
export class LineLogger {
  private rest = "";
  constructor(private readonly direction: Direction, private readonly write: (entry: LogEntry) => void, private readonly ids?: IdMap) {}
  push(chunk: Buffer | string): void {
    this.rest += chunk.toString("utf8");
    // A single unterminated line longer than this is not a message we care about; drop it rather than grow without bound.
    if (this.rest.length > 4_000_000 && !this.rest.includes("\n")) this.rest = "";
    let at: number;
    while ((at = this.rest.indexOf("\n")) >= 0) {
      const entry = entryFromLine(this.direction, this.rest.slice(0, at), this.ids);
      this.rest = this.rest.slice(at + 1);
      if (entry) this.write(entry);
    }
  }
  end(): void {
    const entry = entryFromLine(this.direction, this.rest, this.ids);
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
