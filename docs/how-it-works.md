# How mcp-proof works

## One run, step by step

1. **Find the client.** Each client recipe checks whether the client is on this machine (`claude --version` for Claude Code) and records the version. A missing client is reported as `not-installed` with a line saying where to install it by hand. mcp-proof never installs anything.
2. **Make a throwaway home.** A fresh folder is created and `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` and `XDG_STATE_HOME` (and the Windows drive and path variables) are pointed at it. The client's environment is built from an allow-list, not from your shell, so a token you happen to have exported never reaches the client.
3. **Wrap your server.** The client is told to run `node mcp-proof wrap --log <file> -- <your server command>`. The wrapper passes every byte through unchanged in both directions and writes one JSON line per message to the log. That line holds the direction, the kind, the method name and a small integer that pairs a request with its answer, and nothing else. The id the client itself chose is never written: it is held in memory only to match an answer to its request, and may be any string or number.
4. **Drive the client.** For Claude Code, `claude mcp add` writes the entry into the throwaway config and `claude mcp list` runs its health check, which starts the server. The built-in stand-in client speaks the protocol itself.
5. **Read the log, label the result.** `verified` needs the handshake answered without error (`initialize` with `notifications/initialized` sent, or the newer `server/discover`, which newer Claude Code tries first and which makes it skip `initialize` when the server answers it) and `tools/list` answered. A server that answers `server/discover` with an error makes the client fall back to `initialize`. See the README for the other labels.
6. **Clean up.** The throwaway home is deleted (use `--keep` to look at it). The record keeps only: client name and version, label, the commands that ran with private paths replaced by placeholders, the method names seen, the system, and whether the real home changed.

## The wrapper and Windows

On Windows, npm-style commands (`npx`, `npm`, `pnpm`, `yarn`) and any bare command name are `.cmd` shims that Node cannot start directly, so mcp-proof runs them through `cmd /c`. Some clients have to do the same; Claude Code 2.1.322 on Windows 11 started both a bare `npx` and `cmd /c npx` (checked 2026-11-11). If the wrapped server exits, the wrapper exits too, so the client sees a disconnect and not a hang.

## compat.json (schema 1)

```json
{
  "schema": 1,
  "tool": "mcp-proof",
  "version": "0.1.0",
  "generatedAt": "2026-11-03T10:00:00.000Z",
  "system": { "os": "win32", "arch": "x64", "release": "10.0.26300", "node": "v24.20.0" },
  "server": { "command": "npx", "args": ["-y", "your-server"], "envNames": ["API_KEY_NAME"] },
  "results": [
    {
      "client": "claude-code", "clientName": "Claude Code", "standin": false, "clientVersion": "2.1.317",
      "label": "verified", "commands": ["claude mcp add proofsrv -- <wrapped server>", "claude mcp list"],
      "startedAt": "2026-11-03T10:00:01.000Z", "durationMs": 3000,
      "methods": ["server/discover", "initialize", "notifications/initialized", "tools/list"],
      "realHome": "unchanged", "notes": []
    }
  ]
}
```

`mcp-proof validate compat.json` checks the shape. The file never holds server output, variable values or paths from your machine.

## Adding a client

A recipe implements `detect` and `run` (see `src/recipes/claudeCode.ts`). Rules: run only inside the given throwaway home, record the exact commands, never install, and add it to the README table only after you have run the real product and recorded the version and system.
