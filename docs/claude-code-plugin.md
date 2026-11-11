# Use mcp-proof from Claude Code

mcp-proof ships a small Claude Code plugin, so your assistant can run it when you ask "does my MCP server really start?" or "why does my MCP server show failed?". It was tested with Claude Code 2.1.322 (older versions were not tried) and needs Node.js 22 or newer.

```text
/plugin marketplace add voyageurworks/mcp-proof
/plugin install mcp-proof@voyageurworks-mcp-proof
```

The same two steps from a terminal:

```sh
claude plugin marketplace add voyageurworks/mcp-proof
claude plugin install mcp-proof@voyageurworks-mcp-proof
```

Then ask, for example: "Prove that my MCP server starts in Claude Code. Start it with `npx -y my-mcp-server`." The skill runs mcp-proof, reads the summary and the "Why it did not verify" lines, and tells you what each client did. It does not install a client, does not touch your real client settings, and never puts a secret on a command line (a variable your server needs is passed by name with `--env NAME`).

## What the skill tells the assistant

- Run the server once first when it is started with `npx` (a cold download can take longer than a client waits).
- Inside the project folder of the very package being started, add `--cwd ..`; otherwise `npx` runs the local, usually unbuilt copy and the result is `failed` ([why](why-your-mcp-server-wont-start.md)).
- Read the labels as they are defined in the [README](../README.md#what-the-labels-mean); `verified` is the handshake plus `tools/list`, not a tool call.

## What was run

On 2026-11-11 the manifests passed `claude plugin validate`, and the marketplace and plugin were added and installed from a clean copy of the repository (no `node_modules`) in a throwaway home with Claude Code 2.1.322 on Windows 11; `claude plugin details mcp-proof` listed one skill, no hooks, no agents and no MCP servers, and about 88 tokens always on. After this page was merged, the same two commands were run against the GitHub name `voyageurworks/mcp-proof` in a fresh throwaway home (Claude Code 2.1.322, Windows 11, 2026-11-11) and installed the plugin with its one skill. Not run: an assistant actually following the skill in a session (that needs a signed-in Claude Code).

Installing from a folder that holds `node_modules` (for example a working clone built with pnpm) can fail on Windows with `EPERM ... symlink`, because the installer copies the whole folder; use the GitHub name above, or a fresh clone.

## Other assistants

No plugin is needed to run the command itself:

```sh
npx -y @voyageurworks/mcp-proof run --out proof -- npx -y your-mcp-server
```

Other tools that read `SKILL.md` folders can use the [`skill/`](../skill/SKILL.md) folder in this repository.
