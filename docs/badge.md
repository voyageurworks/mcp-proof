# Put a "verified" table and badge in your README

mcp-proof can write a README-ready table and static badges from a real run. Nothing is hosted and nothing is fetched when the badge is shown: the files live in your repository.

## 1. Run it and write the files

```sh
npx -y @voyageurworks/mcp-proof run --out ./proof -- npx -y your-mcp-server
```

`--out ./proof` writes `compat.json`, `table.md` and a `badges/` folder with one `.svg` and one Shields endpoint `.json` per client (for example `badges/claude-code.svg`, `badges/standin.svg`). Example of the generated table (the handshake column is derived from the recorded methods):

```text
Checked with mcp-proof 0.1.2 on 2026-11-09.

| Client | Version | System | Handshake | Result | Date |
| --- | --- | --- | --- | --- | --- |
| mcp-proof stand-in client (stand-in, not a real product) | built-in | win32 x64, Node 24.20.0 | initialize | verified | 2026-11-09 |
```

## 2. Paste it

Copy `proof/table.md` into your README, and show a badge by linking the file you committed:

```markdown
![Claude Code: verified](proof/badges/claude-code.svg)
```

Keep the date and client version that mcp-proof wrote. They are the point: a reader can see what ran, on which system, when. If a client shows `not-installed`, say so; do not delete the row and claim support.

## 3. Refresh it in CI

```yaml
- uses: voyageurworks/mcp-proof@v0
  with:
    server: npx -y your-mcp-server
    out: proof
```

The Action never installs a client, so install the clients you want checked in an earlier step. It also adds the table to the job summary. The inputs are `server`, `clients`, `env`, `out`, `timeout`, `version` and `package` (see `action.yml`).

## On Windows PowerShell

Step 1 was run in Windows PowerShell 5.1 on Windows 11 (2026-11-22, mcp-proof 0.1.6, Claude Code 2.1.330, against `npx -y @modelcontextprotocol/server-everything`) with the command as above; nothing needed different quoting, and `--out ./proof` wrote `compat.json`, `table.md` and `badges/` (`claude-code.svg`, `standin.svg` and their `.json` files) as described. Step 2 is copying a file, so it has no shell difference. The one difference: mcp-proof prints its progress lines on standard error, and Windows PowerShell 5.1 turns anything on standard error into a red `NativeCommandError` block when you add `2>&1` to the command. The run still succeeded (the exit code in `$LASTEXITCODE` was `0` and the files were written), so leave `2>&1` off, or ignore the red text. Step 3 (the GitHub Action) runs on a Linux runner and is not affected. Windows PowerShell 7 and `cmd` were not tried.

## What the labels mean

`verified` is the handshake plus `tools/list`; `started`, `failed` and `not-installed` are described in the [README](../README.md#what-the-labels-mean). `verified` does not call a tool or test what it returns, so word your claim that way.
