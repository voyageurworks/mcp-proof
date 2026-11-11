# mcp-proof

[![CI](https://github.com/voyageurworks/mcp-proof/actions/workflows/ci.yml/badge.svg)](https://github.com/voyageurworks/mcp-proof/actions/workflows/ci.yml)
[![macOS](https://github.com/voyageurworks/mcp-proof/actions/workflows/macos.yml/badge.svg)](https://github.com/voyageurworks/mcp-proof/actions/workflows/macos.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Prove that your MCP server really starts in real clients, with dated, labelled evidence you can paste into your README.**

```sh
npx -y @voyageurworks/mcp-proof run -- npx -y your-mcp-server
```

You need Node 22 or newer. mcp-proof starts each client it finds in a fresh throwaway home folder, tells the client to run your server, watches the conversation, and records what actually happened. It never installs a client and never touches your real client settings.

## What it looks like

A real run on Windows 11 against the published `@voyageurworks/handoff-desk` server (mcp-proof 0.1.0, 2026-11-03):

```text
Claude Code                verified 2.1.317
mcp-proof stand-in client  verified built-in
```

`--out ./proof` also writes a README-ready table, a machine-readable `compat.json` and static badges:

| Client | Version | System | Handshake | Result | Date |
| --- | --- | --- | --- | --- | --- |
| Claude Code | 2.1.317 | win32 x64, Node 24.20.0 | initialize | verified | 2026-11-03 |
| mcp-proof stand-in client (stand-in, not a real product) | built-in | win32 x64, Node 24.20.0 | initialize | verified | 2026-11-03 |

## Why

"Works with Claude Code, Cursor, Codex" usually means "I tried it once on my machine" or "the documentation says so". The failures people hit are client specific: `npx` needs `cmd /c` on Windows, config keys differ between clients, a trust prompt leaves a server "Disabled". mcp-proof gives a claim a date, a client version, an operating system and the exact commands behind it, so a reader can tell what ran.

## What the labels mean

| Label | Meaning |
| --- | --- |
| `verified` | The client started the server. The log shows the handshake answered (`initialize` with `notifications/initialized` sent, or the newer `server/discover`) and `tools/list` answered. |
| `started` | The client started the server and the handshake was answered, but `tools/list` was not. |
| `failed` | The client ran, but the server never completed the handshake (`initialize` or `server/discover`), or the client could not be driven. |
| `not-installed` | The client is not on this machine, so nothing was run. mcp-proof prints where to install it by hand. |

`read` and `documented` exist in the file format for claims that did not start a server; mcp-proof itself never produces them.

## Clients in this version

| Client | How it is driven | Checked |
| --- | --- | --- |
| Claude Code | `claude mcp add` then `claude mcp list` in a throwaway home (`CLAUDE_CONFIG_DIR` and all home variables redirected). Claude Code's health check starts the server and sends `initialize`, `notifications/initialized` and `tools/list`; Claude Code 2.1.322 first tries `server/discover` and skips `initialize` when the server answers it. No login is needed. | Claude Code 2.1.322, by hand on Windows 11 on 2026-11-11 (a server that answers `server/discover` and one that does not); Claude Code 2.1.317, by hand on Windows 11 and in GitHub Actions on Ubuntu and Windows runners (installed from its official npm package), and on macOS in the same way on the release commit `2dd6e91` (the `v0.1.0` tag) and on `33f90fa`, 2026-11-03. |
| Built-in stand-in | A minimal client inside mcp-proof: `initialize`, `notifications/initialized`, `tools/list`. It is **not a real client product** and is labelled that way everywhere. | GitHub Actions on Ubuntu and Windows with Node 22 and 24 (the `CI` badge), on macOS in a separate workflow (the `macOS` badge; passed on the release commit `2dd6e91` and on `33f90fa`), and by hand on Windows 11 and on Ubuntu under WSL. A timeout or Ctrl-C stops the server and removes the throwaway folders (tested on Linux and macOS in CI). |

More clients are added as recipes, each tested against the real client before it is listed. mcp-proof does not claim support for a client it has not run.

## Guided first run

New here? `npx -y @voyageurworks/mcp-proof setup` asks which server you want to prove (it suggests `npx -y <name>` from a `package.json` beside you), prints every step with your server filled in and tells you how to paste the result into your README. It writes nothing and runs nothing itself. Or paste [a ready-made prompt](docs/setup-prompt.md) into an AI assistant that can run commands.

After every `run` it also says, on the error stream, what to do next. The most common surprise is a cold start: a server started with `npx` that is not cached yet can take longer than a client waits, and the client shows `failed`. Run the server once first, then run mcp-proof again.

## Use

```sh
mcp-proof run [options] -- <server command> [args...]
mcp-proof clients                    # which clients are installed here
mcp-proof table compat.json          # Markdown table
mcp-proof badge compat.json --out badges
mcp-proof validate compat.json
```

Options for `run`: `--client <id>` (repeatable; default every client), `--env NAME[=VALUE]` (give the server a variable; `NAME` alone copies it from your shell), `--out <dir>`, `--json`, `--timeout <seconds>`, `--cwd <dir>` (the server's working folder; default the current folder), `--scratch <dir>`, `--keep`.

Exit codes: `0` every client that ran was verified (and at least one ran), `1` a client ran but did not verify or a client you named is missing, `2` a usage problem.

### In GitHub Actions

```yaml
- uses: voyageurworks/mcp-proof@v0
  with:
    server: npx -y your-mcp-server
    out: proof
```

Guides: [why your MCP server does not start in a client](docs/why-your-mcp-server-wont-start.md) and [putting a verified table and badge in your README](docs/badge.md). A dated example of what it finds: [twelve well-known MCP servers in Claude Code on Windows](survey/2026-11/README.md).

The Action runs on the runner you choose, so it only finds clients you installed in an earlier step. It never installs clients. See [docs/how-it-works.md](docs/how-it-works.md).

## What it records, and what it never does

- **The log holds method names only.** For every message it stores the direction, the kind (request, notification, response, error), the method name and a small integer that pairs a request with its answer (the id the client chose, which may be any string or number, is never written). Parameters, results, tool names, tool output and every other field are dropped before anything is written, so a log or `compat.json` can be shown to anyone, including an AI assistant.
- **Credentials do not reach the client.** The client's environment is built from an allow-list (path, temp folder, proxy settings, locale). Anything that looks like a login (`*KEY*`, `*TOKEN*`, `*SECRET*`, `ANTHROPIC_*` and so on) is not passed on. A variable your server needs is given with `--env`; only its name is recorded, and its value is also scrubbed from notes. The value does have to reach the client, so it is written into the client's config inside the throwaway home; that home is deleted when the run ends, but a home you keep with `--keep` (or one left by a run that was killed) holds those values until you delete it.
- **Your command line is scrubbed.** Arguments that follow a flag like `--api-key`, `NAME=value` pairs with a sensitive name, long random-looking words and passwords inside URLs are replaced with `<redacted>` in the record.
- **No private paths.** Throwaway paths are shown as `<home>`; nothing from your real home appears.
- **No installs, no network of its own.** mcp-proof never downloads or installs a client. It makes no network calls itself (your server and the client may).
- **Real-home check.** For clients with a known settings folder it compares that folder before and after the run and records `unchanged` or `changed`. If a copy of that client was already running, `changed` can be a false alarm; mcp-proof says so in the notes.

## Next to similar tools

Claims below come from each project's own README or description, read on 2026-11-03, and may be out of date.

| | mcp-proof | [MCP Inspector](https://github.com/modelcontextprotocol/inspector) CLI | Conformance Actions (for example [mcp-use/mcp-conformance-action](https://github.com/mcp-use/mcp-conformance-action)) | [canimcp](https://github.com/blues/canimcp) |
| --- | --- | --- | --- | --- |
| Runs your server through real client products | Yes (Claude Code in this version) | No: it is its own client | No: protocol checks against a server | No: a static compatibility table |
| Dated evidence per client version and OS | Yes | No | No | A table, not generated from your server |
| Debug a server interactively | No | Yes | No | No |
| Protocol conformance | No | Partly | Yes | No |

They solve different problems and work well together: use Inspector to debug and a conformance suite to check the protocol, then mcp-proof to show which real clients start your server.

## Limits

- One real client in this version. A claim for any other client needs that client's recipe, tested on the real product.
- `verified` is the handshake plus `tools/list`. It does not call a tool or test what a tool returns.
- A client that needs a login or an interactive approval before it will start a server cannot be driven and will show `failed` or `started`, with a note.
- macOS has its own workflow and badge because GitHub's free macOS runners are often not assigned at all. It runs on every pull request, on release tags, weekly and by hand (not on pushes to `main`), on Intel and Apple silicon, and each job starts the real Claude Code client. Its one required check, `macOS result`, blocks a merge when a macOS job ran and failed, and passes with a visible "macOS was NOT verified" warning when GitHub assigned no Mac. A `cancelled` macOS run that never started a step means no runner, not a failing test; it says nothing about the code either way. The commits whose macOS jobs passed are named above.
- Claude Code waits for a server to start for a limited time. mcp-proof sets that wait from `--timeout` (90 seconds by default, minus a small margin), so a server that first has to be downloaded is fine up to that; beyond it the result is `failed`, and a second run goes faster once the download is cached. (0.1.0 used Claude Code's own default of about 30 seconds, which a cold download could exceed; 0.1.1 sets the wait.)
- Client command lines change between versions. Every result records the client version and the exact commands.

## More from Voyageur Works

Separate tools from the same studio; each works without the others.

- [handoff-desk](https://github.com/voyageurworks/handoff-desk): hand tasks from Claude Code, Cursor or Codex to a personal agent that reads a folder of markdown notes.
- [launch-guard-pack](https://github.com/voyageurworks/launch-guard-pack): check a private git repository, or the npm package you are about to publish, before it goes public, without printing what it finds.

## Development

```sh
pnpm install
pnpm test      # builds first, then runs the tests
pnpm check
```

MIT licence. By [Voyageur Works](https://github.com/voyageurworks).
