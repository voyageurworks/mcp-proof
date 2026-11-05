# Changelog

## Unreleased

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
