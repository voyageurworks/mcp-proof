import { runProcess } from "../proc.js";
import type { Recipe, RunContext, RunResult } from "../types.js";

const NAME = "proofsrv";

/**
 * The environment Claude Code runs in. MCP_TIMEOUT is Claude Code's own setting for how long it waits for an MCP server to
 * start (milliseconds). Its default is about 30 seconds, which a server that must first be downloaded (a cold `npx` cache)
 * can exceed, so the run would show `failed` for a server that is only slow. It is set from mcp-proof's own --timeout,
 * leaving 10 seconds for the rest of the run, and never below 10 seconds.
 */
export function claudeEnv(context: Pick<RunContext, "home" | "timeoutMs">): Record<string, string> {
  return { ...context.home.env, CLAUDE_CONFIG_DIR: `${context.home.root}/.claude`, MCP_TIMEOUT: String(Math.max(10_000, context.timeoutMs - 10_000)) };
}

/**
 * The arguments of `claude mcp add`. The server name must come BEFORE -e: the option takes several values, so a name placed
 * after it is read as one more variable and the command fails ("Invalid environment variable format").
 */
export function addArguments(context: Pick<RunContext, "serverEnv" | "wrapped">): string[] {
  const envArgs = Object.keys(context.serverEnv).flatMap(name => ["-e", `${name}=${context.serverEnv[name]}`]);
  return ["mcp", "add", NAME, ...envArgs, "--", context.wrapped.command, ...context.wrapped.args];
}

/**
 * Claude Code, driven by its own commands in a throwaway home: `claude mcp add` writes the server entry into the throwaway
 * config, then `claude mcp list` runs Claude Code's health check, which starts the server through mcp-proof's wrapper.
 * Checked 2026-11-03 with Claude Code 2.1.317 on Windows 11: the health check sent initialize, notifications/initialized and
 * tools/list. Claude Code 2.1.322 (2026-11-11) first sends server/discover; a server that answers it gets tools/list straight after and no
 * initialize, while one that answers with an error gets initialize next (labelFor counts both). No login is needed. Other versions and
 * systems are labelled by what the log shows, not assumed.
 */
export const claudeCode: Recipe = {
  id: "claude-code",
  name: "Claude Code",
  realHomePaths: [".claude", ".claude.json"],
  installHint: "Install Claude Code from https://code.claude.com (the vendor's official instructions), then run mcp-proof again.",
  async detect(env) {
    const result = await runProcess({ command: "claude", args: ["--version"] }, { env, cwd: process.cwd(), timeoutMs: 30_000 });
    if (!result.started || result.code !== 0) return { installed: false };
    return { installed: true, version: /\d+\.\d+\.\d+/.exec(result.stdout)?.[0] };
  },
  async run(context: RunContext): Promise<RunResult> {
    const env = claudeEnv(context);
    const notes: string[] = [];
    const add = await runProcess({ command: "claude", args: addArguments(context) }, { env, cwd: context.workDir, timeoutMs: 60_000 });
    if (!add.started || add.code !== 0) {
      // Claude Code's own first error line helps; it never contains the server's variable values, which are not in its message.
      const reason = `${add.stderr}${add.stdout}`.split("\n").map(line => line.trim()).find(line => line.length > 0);
      notes.push(`\`claude mcp add\` did not succeed in the throwaway home${reason ? `: ${reason.slice(0, 160)}` : "."}`);
    }
    let listCode: number | null = null;
    let timedOut = false;
    if (add.code === 0) {
      const list = await runProcess({ command: "claude", args: ["mcp", "list"] }, { env, cwd: context.workDir, timeoutMs: context.timeoutMs });
      listCode = list.code;
      timedOut = list.timedOut;
      if (timedOut) notes.push("`claude mcp list` timed out.");
      if (/Pending approval|needs approval|trust/i.test(list.stdout)) notes.push("Claude Code reported the server as awaiting approval or folder trust.");
    }
    return { commands: [`claude mcp add ${NAME} -- <wrapped server>`, "claude mcp list"], exitCode: listCode, timedOut, notes };
  },
};
