# Releasing mcp-proof

Every step that goes outside this computer needs the owner's explicit yes, one step at a time.

## Where things stand (2026-11-03)
- The GitHub repository `voyageurworks/mcp-proof` exists and is **public** (made public on 2026-11-03). It holds one clean first commit plus normal commits on top (author: `mcp-proof contributors <noreply@example.com>`). Only that history was pushed.
- `CI` (Ubuntu and Windows, Node 22 and 24, the stand-in client, the Action run from a packed tarball, Claude Code 2.1.317 installed from its official npm package) is green on `main`; macOS is its own workflow (its required check is `macOS result`: a real macOS failure blocks, no available Mac gives a warning that macOS was not verified; run it by hand on the release commit and name the result in the release notes). The full matrix on the release tag `v0.1.0` (commit `2dd6e91`) passed on Ubuntu, Windows **and macOS** on 2026-11-03.
- `0.1.0` was published to npm by hand on 2026-11-03 (tarball shasum `29e1786cbd2cb7de5230f91c72a411e32dcee1c0`, no provenance because it was hand-published), tagged `v0.1.0` on the commit it was built from (`2dd6e91`) and released on GitHub. The release workflow saw the version was already on npm and published nothing. The Action tag `v0` points at the latest release commit.
- `0.1.1` (2026-11-04) was the first release published by the release workflow, through npm trusted publishing (GitHub Actions, workflow `release.yml`, environment `npm-publish`, direct `npm publish` allowed; the allowed-actions box was ticked on purpose, as the workflow publishes directly). It was approved at the `npm-publish` gate after checking the tag, the version and the tarball against an independent rebuild, and it carries npm provenance (`npm audit signatures` verifies it). npm showed the trusted publisher as Valid after that publish.
- Gates set when it went public: the `npm-publish` environment with a required reviewer, private vulnerability reporting, secret scanning with push protection, branch protection on `main` (no force-push, no deletion, the Ubuntu and Windows checks required; the macOS job is reported but not required, because GitHub's free macOS runners are often unavailable and a required check that cannot run would block every merge), and approval before a first-time outside contributor's workflow runs.
- Already set on the repository: Actions are limited to GitHub-owned actions with full-length commit SHAs required (the workflows use only `actions/*`, pinned), the default token is read-only, and workflows cannot approve pull requests. `npm publish --dry-run --access public` was run and shows 25 files.

## Why the gates could only be set once the repository was public
GitHub's free plan does not offer required-reviewer environments, branch protection or private vulnerability reporting on a **private** repository. They are free on a public one, so the repository was made public first and the gates were set straight away, before anything was published.

## Steps left (owner steps, all optional)
1. Each its own yes: list the Action on the GitHub Marketplace (a checkbox on the release, with GitHub's terms), and list the package in the MCP directories you use.
2. Optional hardening on npmjs.com, in the package's Publishing access settings: choose "Require two-factor authentication and disallow bypass 2fa tokens". Releases go through trusted publishing, so no token is needed.
3. On each later 0.x release, move the `v0` tag to the new release commit (`git tag -f v0 <commit> && git push -f origin v0`).

## macOS and the full matrix
GitHub's free macOS runners are scarce (a free plan gets at most 5 macOS jobs at once, and runs sometimes sit unassigned for 20 to 30 minutes and are then cancelled with "not acquired by Runner of type hosted"). So macOS has its own workflow (`macos.yml`, its own badge), apart from `CI` (Ubuntu and Windows): a runner shortage can never turn `CI` red, and the macOS run list says honestly whether macOS ran. An ordinary push starts `CI` and **one** macOS job; a `v*` tag, or Actions, macOS, Run workflow with `full` = true, also checks Node 24 on macOS. Only the `CI` jobs are required checks on `main`.
- A cancelled macOS job is not a code failure. Re-run only the failed jobs and try again later; do not edit code for it. Never leave several macOS runs queued: the workflow cancels a stale run on the same ref.
- If macOS cannot run when you want to release, release anyway and say so by commit: name the last commit whose macOS jobs passed, its date, and that the release commit was not re-run on macOS. Do not claim more than ran.
- Evidence so far: the macOS jobs passed on commits `748fabd`, `2b106f2`, `e1e74ae` and `8914a09` (2026-11-03); the commits after that were docs, issue forms and workflow changes.

## Every later release
1. `pnpm check && pnpm test && pnpm build` on a clean checkout; the `CI` jobs must be green, and the macOS workflow should be green on the release commit or its state stated by commit as above.
2. Bump `version` in `package.json` (the CLI reads it, a test checks they agree) and update `CHANGELOG.md`.
3. Read `npm pack --dry-run`: the tarball must hold only `dist`, `README.md`, `LICENSE`, `CHANGELOG.md`, `SECURITY.md`, `docs` and `action.yml`.
4. If a recipe changed, run the real-client check on a machine that has the client (`node dist/main.js run --client claude-code --out proof -- <a known-good server>`) and update the README's "Checked" text with the version and system.
5. Tag `vX.Y.Z` and publish the GitHub release; the workflow pauses at the `npm-publish` environment. Before approving, check the tag, the version and the tarball.

## What 0.1.0 does and does not claim
It claims a `compat.json` schema 1 that is meant to stay stable, and honest labels. It supports one real client (Claude Code); the README says so. Under 0.x the command line may still change in a minor release; a 1.0 should wait until more than one real client has been run.
