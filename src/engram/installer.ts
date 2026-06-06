/**
 * Engram installer - installs the engram binary only with explicit
 * approval, never reinstalls, and honors --dry-run.
 */

import { execSync } from "child_process";
import chalk from "chalk";
import { binaryExists, tryExec } from "../utils/exec.js";

export interface InstallResult {
  installed: boolean;
  /** True when engram was already present and nothing was done */
  skipped: boolean;
  message: string;
}

/**
 * Install engram via Homebrew/Linuxbrew. When brew is unavailable we do
 * not pipe remote scripts into a shell — we point the user at the
 * official releases instead.
 */
export function installEngram(dryRun: boolean): InstallResult {
  if (binaryExists("engram")) {
    const version = tryExec("engram version") ?? "unknown version";
    return {
      installed: true,
      skipped: true,
      message: `engram already installed (${version}) - skipping`,
    };
  }

  if (!binaryExists("brew")) {
    return {
      installed: false,
      skipped: false,
      message:
        "Homebrew not found. Install engram manually from " +
        "https://github.com/Gentleman-Programming/engram/releases " +
        "or install Homebrew first.",
    };
  }

  if (dryRun) {
    return {
      installed: false,
      skipped: false,
      message: "would run: brew install gentleman-programming/tap/engram",
    };
  }

  console.log(chalk.gray("  Running: brew install gentleman-programming/tap/engram"));
  try {
    execSync("brew install gentleman-programming/tap/engram", {
      encoding: "utf-8",
      stdio: "inherit",
    });
  } catch {
    return {
      installed: false,
      skipped: false,
      message: "brew install failed - see output above",
    };
  }

  const version = tryExec("engram version") ?? "unknown version";
  return {
    installed: true,
    skipped: false,
    message: `engram installed (${version})`,
  };
}
