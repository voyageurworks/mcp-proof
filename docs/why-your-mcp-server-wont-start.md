# Why your MCP server does not start in a client (and how to prove it does)

"It works on my machine" is the usual state of an MCP server's compatibility claim. These are the failures that are specific to the client or the operating system, and the check that tells you which one you have. Everything here comes from what mcp-proof itself runs into; see [how it works](how-it-works.md).

## Common causes

- **`npx` on Windows.** `npx`, `npm`, `pnpm` and `yarn` are `.cmd` shims on Windows, and a program that starts a server directly cannot run them. Clients need `"command": "cmd"` with `"args": ["/c", "npx", "-y", "your-mcp-server"]`. mcp-proof does the same thing for you when it runs a command on Windows.
- **A different config shape per client.** The file name, the top-level key and the field names differ between clients, so a block that works in one is silently ignored in another. Copy the shape from that client's own documentation.
- **A trust or approval prompt.** Some clients mark a server "Disabled" or untrusted until a person approves it. That is not a crash: nothing started, and a log will show no `initialize` and no answered `server/discover`.
- **A cold `npx` cache.** The first run has to download your package, which can take longer than the client waits. A second run goes faster once the download is cached. mcp-proof waits up to 90 seconds by default (`--timeout`) so a first download is fine up to that.
- **Running it inside your own package's folder.** In a package's own folder, `npx -y your-package` runs the copy in that folder (usually not installed or built), not the published package, and the client shows `'your-package' is not recognized`. mcp-proof says so when it happens; run it with `--cwd ..` so the server starts from the parent folder.
- **The server exits early.** If the process dies, the client sees a disconnect. mcp-proof's wrapper makes this visible as `failed` instead of a hang.

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

The log keeps method names only, never parameters or tool output, so you can paste it into an issue or show it to an AI assistant. mcp-proof never installs a client and never touches your real client settings.

## Then show the result

Put the table in your README so a reader can see what ran, on which version and system: [Put a verified table and badge in your README](badge.md).
