# Why your MCP server does not start in a client (and how to prove it does)

"It works on my machine" is the usual state of an MCP server's compatibility claim. These are the failures that are specific to the client or the operating system, and the check that tells you which one you have. Everything here comes from what mcp-proof itself runs into; see [how it works](how-it-works.md).

## Common causes

- **`npx` on Windows, in some clients.** `npx`, `npm`, `pnpm` and `yarn` are `.cmd` shims on Windows, and a client that starts a server without a shell cannot run them. Such a client needs `"command": "cmd"` with `"args": ["/c", "npx", "-y", "your-mcp-server"]`. Not every client does: Claude Code 2.1.322 on Windows 11 connected to both `npx -y <server>` and `cmd /c npx -y <server>` (checked 2026-11-11), so do not assume this is your problem when Claude Code shows `failed`. mcp-proof does the same thing for you when it runs a command on Windows.
- **A different config shape per client.** The file name, the top-level key and the field names differ between clients, so a block that works in one is silently ignored in another. Copy the shape from that client's own documentation.
- **A trust or approval prompt.** Some clients mark a server "Disabled" or untrusted until a person approves it. That is not a crash: nothing started, and a log will show no `initialize` and no answered `server/discover`.
- **A cold `npx` cache.** The first run has to download your package, which can take longer than the client waits. A second run goes faster once the download is cached. mcp-proof waits up to 90 seconds by default (`--timeout`) so a first download is fine up to that.
- **Running it inside your own package's folder.** In a package's own folder, `npx -y your-package` runs the copy in that folder (usually not installed or built), not the published package, and the client shows `'your-package' is not recognized`. mcp-proof says so when it happens; run it with `--cwd ..` so the server starts from the parent folder.
- **The server exits early.** If the process dies, the client sees a disconnect. mcp-proof's wrapper makes this visible as `failed` instead of a hang.

## What the message in `claude mcp list` means

Each of these was reproduced with the real Claude Code 2.1.322 on Windows 11 on 2026-11-11, in a throwaway home, using `claude mcp add` and `claude mcp list`:

| What the command did | What Claude Code printed |
| --- | --- |
| The command does not exist (for example a typo in the program name) | `Failed to connect — CONNECTION_CLOSED: Connection closed` |
| The command started and exited at once | `Failed to connect — CONNECTION_CLOSED: Connection closed` |
| The command started and kept running but never spoke MCP | `Failed to connect — MCP server "<name>" connection timed out after 30000ms` |
| The command printed a plain line of text to standard output, then kept running | `Failed to connect — MCP server "<name>" connection timed out after 30000ms` |

So `CONNECTION_CLOSED` means the process was not there to talk to (it never started, or it ended), and "timed out" means a process was running but did not answer the handshake in time. The last row matters for authors: on standard output an MCP server may write only protocol messages; send logs to standard error. Two different causes share each message, so the message alone does not say which one you have; run the command by itself in a terminal first, and use mcp-proof to run it in the real client and record what happened.

## Find out which one you have

```sh
npx -y @voyageurworks/mcp-proof run -- npx -y your-mcp-server
```

It starts each client it finds in a throwaway home, makes the client run your server, and labels the result:

| Label | Meaning |
| --- | --- |
| `verified` | The log shows the handshake answered (`initialize` with `notifications/initialized` sent, or the newer `server/discover`) and `tools/list` answered. |
| `started` | The handshake was answered but `tools/list` was not. |
| `failed` | The server never completed the handshake, or the client could not be driven. |
| `not-installed` | The client is not on this machine, so nothing was run. |

The log keeps method names (and the process facts: could it start, its exit code, how long it ran), never parameters or tool output, so you can paste it into an issue or show it to an AI assistant. mcp-proof never installs a client and never touches your real client settings.

## Then show the result

Put the table in your README so a reader can see what ran, on which version and system: [Put a verified table and badge in your README](badge.md).
