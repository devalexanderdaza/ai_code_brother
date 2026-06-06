/**
 * Engram setup runner - wires agent CLIs to engram, only ever with
 * explicit approval, because these commands modify global tool configs
 * shared with other projects.
 */

import { execSync } from "child_process";
import chalk from "chalk";
import type { AgentTool } from "./detect.js";

export interface SetupResult {
  tool: string;
  ok: boolean;
  skipped: boolean;
  message: string;
}

/** Tools `engram setup` knows how to configure. */
export const ENGRAM_SETUP_TOOLS = ["claude-code", "opencode", "gemini-cli", "codex"] as const;

function run(command: string, dryRun: boolean, env?: NodeJS.ProcessEnv): boolean {
  if (dryRun) {
    console.log(chalk.yellow(`  ○ would run: ${command}`));
    return true;
  }
  console.log(chalk.gray(`  Running: ${command}`));
  try {
    execSync(command, { encoding: "utf-8", stdio: "inherit", env: env ?? process.env });
    return true;
  } catch {
    return false;
  }
}

/**
 * Claude Code is configured through its official plugin (registers MCP,
 * hooks and the Memory Protocol skill). Other CLIs use `engram setup`.
 */
export function runEngramSetup(tool: AgentTool, dryRun: boolean): SetupResult {
  if (!tool.setupId) {
    return {
      tool: tool.label,
      ok: false,
      skipped: true,
      message: `${tool.label} has no engram setup command (configure via workspace MCP)`,
    };
  }

  if (tool.setupId === "claude-code") {
    // Linux EXDEV fix: plugin install can fail when /tmp and /home are on
    // different filesystems; route Node's tmpdir into the home filesystem.
    const env = {
      ...process.env,
      TMPDIR: `${process.env.HOME}/.cache/claude-tmp`,
    };
    const ok =
      run("claude plugin marketplace add Gentleman-Programming/engram", dryRun, env) &&
      run("claude plugin install engram", dryRun, env);
    return {
      tool: tool.label,
      ok,
      skipped: false,
      message: ok
        ? dryRun
          ? "would install the engram plugin for Claude Code"
          : "engram plugin installed for Claude Code"
        : "plugin install failed - try `claude update` and re-run",
    };
  }

  const ok = run(`engram setup ${tool.setupId}`, dryRun);
  return {
    tool: tool.label,
    ok,
    skipped: false,
    message: ok
      ? dryRun
        ? `would run engram setup ${tool.setupId}`
        : `engram setup ${tool.setupId} completed`
      : `engram setup ${tool.setupId} failed`,
  };
}

/** Enable git sync for the current repo - explicit approval only. */
export function enableGitSync(dryRun: boolean): SetupResult {
  const ok = run("engram sync", dryRun);
  return {
    tool: "git-sync",
    ok,
    skipped: false,
    message: ok
      ? dryRun
        ? "would run engram sync (exports memory chunks into .engram/)"
        : "engram sync completed - memory chunks exported to .engram/"
      : "engram sync failed",
  };
}
