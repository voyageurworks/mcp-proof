/**
 * Why a client did not verify a server, in words a newcomer can act on. The wrapper writes what the server PROCESS did (a start
 * error code, an exit code and timing) next to the method names in the proof log; none of it is message content. Three situations look
 * the same to a client ("Failed to connect") but need different fixes: the command could not be started, it started and exited, or it
 * kept running but never answered the handshake.
 */
export type ExitRecord = { code: number; afterMs: number; clientClosed: boolean };
export type ProcessSeen = { spawnError?: string; exit?: ExitRecord };

/** The start error and exit the wrapper saw, from the proof log text. Only a short errno-like word, whole numbers and a flag are kept. */
export function parseProcess(text: string): ProcessSeen {
  const seen: ProcessSeen = {};
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    let value: Record<string, unknown>;
    try { value = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    if (value.process === "spawn-error" && typeof value.code === "string" && /^[A-Z][A-Z0-9_]{1,20}$/.test(value.code)) {
      seen.spawnError = value.code;
    } else if (value.process === "exit" && Number.isInteger(value.code) && Number.isFinite(value.afterMs) && typeof value.clientClosed === "boolean") {
      seen.exit = { code: value.code as number, afterMs: value.afterMs as number, clientClosed: value.clientClosed };
    }
  }
  return seen;
}

/** The note for a result that did not complete the handshake. */
export function explainFailure(input: { methods: string[]; process: ProcessSeen }): string {
  const seen = input.process;
  if (seen.spawnError === "ENOENT") {
    return "The server command could not be started: it was not found. Check the spelling of the program name and that it is installed and on your PATH.";
  }
  if (seen.spawnError) {
    return `The server command could not be started (${seen.spawnError}). Check that the program exists and that it may be run.`;
  }
  if (seen.exit && !seen.exit.clientClosed) {
    // 1, 127 and 9009 are what a shell reports for a program it cannot find, so a mistyped program name looks like this too.
    const missing = [1, 127, 9009].includes(seen.exit.code) ? " A program name that does not exist ends with this code too, so check the spelling." : "";
    return `The server started and then exited by itself (exit code ${seen.exit.code}) before the handshake was answered. Run the command on its own to see why.${missing} An MCP server may write only protocol messages to standard output; send logs to standard error.`;
  }
  if (input.methods.length === 0) {
    return "The client never reached the server: nothing was exchanged. Check that the server command works on its own, and whether the client asked for approval.";
  }
  return "The server was still running when the client gave up, but it never answered the handshake (initialize or server/discover). It may be waiting for input, or printing text to standard output, where only protocol messages belong. Run the command on its own to see.";
}
