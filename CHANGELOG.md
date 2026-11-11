# Changelog

## 0.1.6 (2026-11-11)

A failure now says which kind it was, the table shows which handshake each client used (a first outside contribution), and there is a Claude Code plugin. Labels, `compat.json` (schema 1), exit codes and `--json` are unchanged.

- **A Claude Code plugin and skill** (`.claude-plugin/`, `skill/`), installed from GitHub with `/plugin marketplace add voyageurworks/mcp-proof` and `/plugin install mcp-proof@voyageurworks-mcp-proof`. It is not part of the npm package (it installs from git). A test (`src/plugin.test.ts`) keeps the plugin and marketplace versions equal to `package.json`, so a release must bump them too. Validated with `claude plugin validate`, installed from a clean copy in a throwaway home with Claude Code 2.1.322 on Windows 11; the skill listed once. An assistant following the skill in a session was not run.

- **A failure now says which kind it was.** Three situations look the same to a client ("Failed to connect") but need different fixes, and mcp-proof used to give one generic reason for all three. The wrapper now also records what the server process did (whether it could be started, as a short error code such as ENOENT; its exit code; how long it ran: no output, text or path), and the reason says which: the command could not be started (not found, check the spelling and PATH); it started and exited by itself, with its exit code (and a spelling hint for the codes a shell gives a missing program: 1, 127, 9009; and a reminder that an MCP server may write only protocol messages to standard output); or it was still running but never answered the handshake. Checked with Claude Code 2.1.322 on Windows 11: a server that exits at once, one that stays silent and a mistyped program name now each get their own reason. The privacy statements in the README, SECURITY.md and docs were updated to match. `compat.json` is unchanged. Tests: `src/why.test.ts`, and the wrapper test for a server that cannot start now expects its one start-error line.


- **A Handshake column in the table.** `table.md` (and `mcp-proof table`) now shows which handshake the client used, derived from the `methods` already in `compat.json`: `server/discover`, `initialize`, or both (the client tried `server/discover` first and fell back to `initialize`); `-` when neither was seen. `compat.json` is unchanged. Contributed by yonash24 (#27, closes #24). The README example is now a real run on 2026-11-11 (Claude Code 2.1.322 shows both).

## 0.1.5 (2026-11-11)

Two first-run fixes found by running mcp-proof on handoff-desk's own repository. The labels, `compat.json` (schema 1), exit codes and `--json` are unchanged.

- **The reason is now on the screen.** After a result that ran but did not verify, the terminal prints "Why it did not verify" with each note, on the error stream (stdout is still exactly the summary; `--json` is unchanged). Until now the notes were only in `table.md` and `compat.json` (so only with `--out`), although the hint said "the note under its line says why". The hint now points at the new block.
- **Running inside the package's own folder.** In a package's own folder, `npx -y <that package>` does not fetch the published package: npm sees that the project has that name and runs the copy in the folder, which is usually not installed or built, so the client shows `'name' is not recognized` and the result is `failed`. `setup` suggests exactly that command from the `package.json` beside you. Now `setup` adds `--cwd ..` to the run step and says why, and a `run` that did not verify in such a folder adds a note saying the same and how to fix it (`--cwd ..`, which starts the server from the parent folder). Checked with Claude Code 2.1.322 on Windows 11 in the handoff-desk repository: `failed` before, with the note now; `--cwd ..` gives `verified`. Detection reads only the name in the nearest `package.json`, and stays quiet for `npx -p`, a different package or any other command.
- Tests: `src/ownPackage.test.ts` (which package a command starts, folder and subfolder detection, `setup` output) and two terminal-output tests in `src/render.test.ts` and `src/cli.test.ts`.

## 0.1.4 (2026-11-11)

Fixes a wrong `failed`: a server that works could be labelled `failed` by a newer client. The labels' names, `compat.json` (schema 1), the exit codes and `--json` are unchanged.

- **The newer handshake counts.** Claude Code 2.1.322 starts with `server/discover`. A server that supports it answers, and the client then goes straight to `tools/list` and never sends `initialize`, so mcp-proof 0.1.3 labelled it `failed` ("initialize was never answered") although the log showed the server answering both requests. `verified` now means: the handshake was answered without error (`initialize` with `notifications/initialized` sent, **or** `server/discover`) and `tools/list` was answered without error. `started` means the handshake was answered but `tools/list` was not. A server that answers `server/discover` with an error is not counted, and the client then falls back to `initialize`, as before. The notes, `setup` text and docs use the same words.
- **Answers are matched even when the client's id is not a plain integer.** Claude Code 2.1.322 sends its first `server/discover` under an id that is a string, which the log used to drop, so the answer could never be matched to the request and a working server (`@upstash/context7-mcp` 4.6.0) was still `failed`. The wrapper now pairs each request with its answer in memory (same sender, same id, a reused id starts a new pairing, an answer nobody asked for or a null id is ignored) and writes only a small integer for the pair. The id the client chose is still never written; a test checks that a string id does not reach the log. The log's integer ids are now those pairing integers, not the client's own.
- Checked on 2026-11-11 with Claude Code 2.1.322 on Windows 11, run from this build: `@modelcontextprotocol/server-everything` 2.2.1 and `@upstash/context7-mcp` 4.6.0 (both answer `server/discover`) went from `failed` with 0.1.3 to `verified`; `@voyageurworks/handoff-desk` 1.2.4 (answers it with an error, then `initialize`) is still `verified`. macOS was not run for this change by hand; the CI workflow runs it.
- Tests: `src/evidence.test.ts` covers both handshakes, an errored `server/discover`, `tools/list` unanswered, an empty log, string and null ids, an id reused by a later request and a server request that shares a client request's id.

## 0.1.3 (2026-11-09)

First-run polish; the labels, `compat.json`, exit codes and `--json` output are unchanged.

- **Guided first run.** `mcp-proof setup` asks which server to prove (default: `npx -y <name>` from the `package.json` beside you), which folder gets the evidence and whether you want a GitHub Actions job (`--server`, `--out`, `--ci`), then prints every step with your server filled in: a warm-up for a server that has to be downloaded, `clients`, the `run` command, what each label means, and how to paste the table and badges into a README. It writes nothing and runs nothing itself. `setup --prompt` prints a block to paste into an AI assistant that can run commands ([docs/setup-prompt.md](docs/setup-prompt.md)).
- **Next steps after every `run`** (not with `--json`), on the error stream so the summary on stdout stays exactly the summary: what to do with a verified result, what a `failed` or `started` usually means, and that `not-installed` is not a failure.
- **The cold-start trap is explained.** A server started with `npx` (or another downloader) that is not yet cached can take longer than a client waits, and the client then shows `failed`. `setup` and the hints say to run the server once first, then run again (`--timeout 180` gives more time, `--keep` keeps the throwaway home).
- The error for a `run` without a server now shows an example and points at `setup`.
- Tested from the packed tarball in a throwaway home, several runs, including a real Claude Code.

Also in this release (tests only, no change to the program):

- Tests only: `src/signal.test.ts` no longer counts a killed-but-not-yet-collected (zombie) server as still running, and prints the process table if the server really is still running after an interrupt. The test failed once on macOS in CI and passed on re-run; 84 stress runs on Apple silicon and Intel found no failure.
- Tests only: `src/freeRunners.test.ts` fails if a workflow uses a runner label that is not on the free list (larger, GPU, self-hosted or unknown runners could be billed), so the CI stays within GitHub's free tier.
- CI only: a `CodeQL` workflow scans the TypeScript/JavaScript code on pushes to `main`, pull requests and weekly (results under Security > Code scanning; not a required check).
- CI only: the `macOS monthly report` workflow also writes its facts (fixed words and numbers) to `status.json` on the `macos-report` branch, so an automatic reviewer can read them without the GitHub API.

## 0.1.2 (2026-11-04)

No change to the program. This release brings the packaged README and docs up to date with the repository (macOS testing notes), and the CI changes below.

- CI only: a new `macOS monthly report` workflow runs on the 1st of each month and posts the facts (macOS jobs passed, failed or without a runner, and any run where macOS was not verified) as a comment on the macOS tracking issue, with a status and a recommendation. A recommendation to close the issue needs runs spanning 60 days.

- CI only: the macOS workflow now runs on every pull request (not on pushes to `main`), on explicit runner labels (`macos-15-intel`, `macos-15`) instead of `macos-latest`, on Intel and Apple silicon, and has one required check, `macOS result`: a macOS job that ran and failed blocks the merge; if GitHub assigns no Mac, the check passes with a visible warning that macOS was not verified. Every macOS job still runs the stand-in client, the Action from the tarball and the real Claude Code client.

## 0.1.1 (2026-11-04)
- First release published by the release workflow (npm trusted publishing, with provenance).
- Claude Code is started with `MCP_TIMEOUT` set from mcp-proof's `--timeout`, so a server that first has to be downloaded (a cold `npx` cache) no longer shows `failed` because Claude Code's default start-up wait of about 30 seconds ran out. Measured with a server that takes 40 seconds to become ready: `failed` after 32 s before, `verified` after 42 s now.
- The macOS checks run in their own workflow, so a missing GitHub macOS runner cannot turn `CI` red.

## 0.1.0 (2026-11-03)
First release. While the version is 0.x, the command line may still change in a minor release; `compat.json` schema 1 is meant to stay stable.

- `mcp-proof run` starts each client in a fresh throwaway home, has it run your server through a method-name-only wrapper, and labels the result `verified`, `started`, `failed` or `not-installed`.
- Clients: Claude Code (driven with `claude mcp add` and `claude mcp list`; checked on version 2.1.317 by hand on Windows 11 and in CI on Ubuntu, macOS and Windows) and a built-in stand-in client.
- Outputs: a terminal summary, `compat.json` (schema 1), a README-ready Markdown table and static SVG badges with Shields endpoint JSON.
- `mcp-proof table`, `badge` and `validate` work from a saved `compat.json`.
- A reusable GitHub Action (`action.yml`), run for real in CI from a packed tarball on Linux, macOS and Windows.
- A timeout or Ctrl-C stops the server and the client and removes the run's throwaway folders (Linux and macOS tested in CI).
- On Windows, server and client command lines run through `cmd.exe` are quoted word by word and passed verbatim, so an argument containing `&`, `|`, `<`, `>`, `^`, `(`, `)` or a space reaches the program intact and cannot start a second command. `table` shows text from a `compat.json` as plain text (no raw HTML, no forged rows).
- Environment allow-list for clients, credential-looking arguments redacted in the record, no runtime dependencies, no network calls of its own.
