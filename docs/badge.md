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

## What the labels mean

`verified` is the handshake plus `tools/list`; `started`, `failed` and `not-installed` are described in the [README](../README.md#what-the-labels-mean). `verified` does not call a tool or test what it returns, so word your claim that way.
