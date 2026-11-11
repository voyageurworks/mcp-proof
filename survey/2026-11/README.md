# Do well-known MCP servers start in Claude Code on Windows? A dated survey (2026-11-11)

Twelve MCP servers, each started by the real Claude Code 2.1.322 on Windows 11 in a throwaway home folder, run with mcp-proof 0.1.4. All twelve were `verified`: the client started the server, the handshake was answered and `tools/list` was answered. This page shows exactly what ran, what it does not prove, and one thing the survey turned up about how newer Claude Code opens a conversation.

## What "verified" means here, and what it does not

`verified` is the handshake plus `tools/list`, as recorded by [mcp-proof](../../README.md). It does **not** mean a tool was called, that a tool returns the right thing, or that the server works on macOS or Linux, in another client, or with a login. It is a sample, not a ranking or a review of these projects.

## Results

| Server (npm package and version) | Vendor repository | How the handshake went | Claude Code 2.1.322 | mcp-proof stand-in client |
| --- | --- | --- | --- | --- |
| `@modelcontextprotocol/server-everything` 2.2.1 | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | `server/discover` answered, no `initialize` | verified | verified |
| `@modelcontextprotocol/server-memory` 2.1.0 | modelcontextprotocol/servers | `server/discover` answered, no `initialize` | verified | verified |
| `@modelcontextprotocol/server-sequential-thinking` 2.1.1 | modelcontextprotocol/servers | `server/discover` answered, no `initialize` | verified | verified |
| `@modelcontextprotocol/server-filesystem` 2.2.0 | modelcontextprotocol/servers | `server/discover` answered, no `initialize` | verified | verified |
| `@upstash/context7-mcp` 4.6.0 | [upstash/context7](https://github.com/upstash/context7) | `server/discover` answered, no `initialize` | verified | verified |
| `@playwright/mcp` 0.0.85 | [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | `initialize` used | verified | verified |
| `chrome-devtools-mcp` 1.12.0 | [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | `initialize` used | verified | verified |
| `shadcn` 4.23.0 (`shadcn mcp`) | [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | `initialize` used | verified | verified |
| `mongodb-mcp-server` 3.3.0 | [mongodb-js/mongodb-mcp-server](https://github.com/mongodb-js/mongodb-mcp-server) | `initialize` used | verified | verified |
| `@notionhq/notion-mcp-server` 2.6.1 | [makenotion/notion-mcp-server](https://github.com/makenotion/notion-mcp-server) | `initialize` used | verified | verified |
| `exa-mcp-server` 3.4.3 | [exa-labs/exa-mcp-server](https://github.com/exa-labs/exa-mcp-server) | `initialize` used | verified | verified |
| `firecrawl-mcp` 3.39.0 | [firecrawl/firecrawl-mcp-server](https://github.com/firecrawl/firecrawl-mcp-server) | `initialize` used | verified | verified |

Each row has its own record in this folder (`<name>.compat.json`, schema 1, checked with `mcp-proof validate`). The system was win32 x64, Node 24.20.0, on 2026-11-11. The real-home check said `unchanged` for every Claude Code run (the stand-in client has no real home to check).

## What we noticed: two ways a client can start the conversation

Claude Code 2.1.322 sends `server/discover` first. Two things can happen, and the log shows which:

- **The server answers it.** The client then goes straight to `tools/list` and never sends `initialize`. The reference servers above and Context7 did this.
- **The server does not answer it successfully** (the log shows only that the client moved on). The client then used the classic `initialize`, `notifications/initialized`, `tools/list`. The other seven did this.

So a server author cannot assume every client sends `initialize` any more. Earlier versions of mcp-proof (0.1.3 and before) only looked for `initialize` and labelled the first group `failed`, although the log shows the server answering both requests (for Context7, Claude Code's own log says it connected). Version 0.1.4 counts either handshake. If you saw `failed` from mcp-proof 0.1.3 on a current Claude Code, update and run it again.

## How it was run, exactly

Each server was installed into its own scratch folder with install scripts turned off, then started with `node` on its entry file. This is **not** the same as `npx -y <package>`, and a server that only works after its own install step would not have been caught by this method.

```sh
# in a scratch folder per server
npm install --ignore-scripts <package>@<version>
mcp-proof run --client claude-code --client standin --timeout 150 --out <dir> --cwd . -- node node_modules/<package>/<entry file> [args]
```

- Two servers were started with their documented switch for turning usage statistics off (`--no-usage-statistics` for `chrome-devtools-mcp`, `--telemetry disabled` for `mongodb-mcp-server`). The others were run as shipped.
- No credentials were given to any server. Notion, Exa and Firecrawl started and answered `tools/list` without one; what their tools do without a key was not tested. `firecrawl-mcp` printed that it was running in keyless mode.
- The servers were started one at a time. The throwaway homes were deleted after each run.

## Not run, and why

| Package | Reason it was not run in this round |
| --- | --- |
| `@browsermcp/mcp` | Started a background daemon process when launched, so it was left out; the one daemon a short test had started was stopped by hand. |
| `@azure/mcp`, `@mapbox/mcp-server` | Their npm packages have a `postinstall` script, and this survey installs with scripts off. |
| `@modelcontextprotocol/server-puppeteer`, `@stripe/mcp` | Marked deprecated on npm. |

Everything else is simply not in this sample. If you want a server added, or another client tested, open an issue using the client request form; mcp-proof only lists a client after running the real product.

## Reproduce one

```sh
npm install --ignore-scripts @modelcontextprotocol/server-memory@2.1.0
npx -y @voyageurworks/mcp-proof run --client claude-code --out proof -- node node_modules/@modelcontextprotocol/server-memory/dist/index.js
```

Run exactly like this with the published mcp-proof 0.1.4 on 2026-11-11, it printed `verified`. You need Claude Code installed; mcp-proof never installs a client or touches your real settings. Results change with the client version and the system, which is why every row carries a date.
