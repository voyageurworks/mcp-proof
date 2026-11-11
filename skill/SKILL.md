---
name: mcp-proof
description: Use when asked whether an MCP server really starts in Claude Code, why an MCP server shows failed or Disabled, or to produce dated evidence or a badge for a README. Runs mcp-proof, which starts the server in each real client installed here, in a throwaway home, and reports verified, started, failed or not-installed with the reason.
---

# mcp-proof

Proves that an MCP server really starts in real clients, with dated, labelled evidence. It never installs a client, never reads or changes the user's real client settings, and its log holds method names only (no parameters, results or tool output). Needs Node 22 or newer.

## Run it

1. Ask the user for the command that starts their MCP server, for example `npx -y my-mcp-server` or `node dist/index.js`. If this folder has a `package.json`, offer `npx -y <its name>` as the default.
2. If the server is started with `npx` (or another downloader), run that command once first so the download is cached; a cold download can take longer than a client waits and shows as `failed`.
3. Run, from the folder you are in:

```
npx -y @voyageurworks/mcp-proof run --out proof --server "<the command>"
```

4. **If this folder is the project of the very package being started** (its `package.json` name is the package in the command), add `--cwd ..`: inside that folder `npx -y <that package>` runs the local, usually unbuilt copy instead of the published package and shows `'name' is not recognized`. mcp-proof says so when it happens.
5. Read the summary on stdout (one line per client) and, if a result is not `verified`, the **Why it did not verify** block on stderr.

## Labels

- `verified`: the client started the server, the handshake was answered and `tools/list` was answered.
- `started`: the client started it and the handshake was answered, but `tools/list` was not.
- `failed`: the server never completed the handshake, or the client could not be driven. The reason is printed.
- `not-installed`: that client is not on this computer, so nothing ran; this is not a failure.

`verified` does not mean a tool was called or returns the right thing.

## Rules

- Never install a client for the user. If none is installed, say so and tell them to install one themselves.
- Never put a secret on the command line. If the server needs a variable, use `--env NAME` (the bare name copies it from the user's shell and only the name is recorded); never write `--env NAME=value` with a real value, and never print an environment value.
- Do not edit the user's client configuration to make a result pass. Report what ran.
- `--keep` keeps the throwaway home, which then holds any `--env` values; do not use it unless the user asks, and tell them to delete the folder afterwards.

## After a run

`proof/table.md` is a README-ready table (with a Handshake column), `proof/badges/` holds badges and `proof/compat.json` is the record; keep the date with them, since a result only says what was true that day. Check a saved record with `npx -y @voyageurworks/mcp-proof validate proof/compat.json`.
