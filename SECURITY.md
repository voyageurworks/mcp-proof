# Security policy

## Reporting a problem

Please report a vulnerability privately, not in a public issue. Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**.

## What mcp-proof promises

- It writes method names, directions, kinds and small pairing integers (not the ids a client chose) to its log. It also writes whether the server command could be started (a short error code such as ENOENT), its exit code and how long it ran. It does not write parameters, results, tool names, tool output or environment values.
- It builds a client's environment from an allow-list and drops anything that looks like a credential.
- It runs clients only inside a throwaway home folder it creates, and it never installs software.
- It makes no network calls of its own and has no telemetry.
- It has no runtime dependencies.

A report that shows any of these being broken (for example a secret reaching a log, a record or a client's environment) is in scope. So is a way to make mcp-proof write outside its throwaway folders or run something it was not asked to run.

## Out of scope

The server you test and the client you drive are not part of mcp-proof. Problems in them belong with their authors.
