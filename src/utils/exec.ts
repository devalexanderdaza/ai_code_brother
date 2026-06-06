/**
 * Shell helpers - safe checks for external binaries.
 */

import { execSync } from "child_process";

const SAFE_NAME = /^[a-zA-Z0-9._-]+$/;

/**
 * Check whether a binary is available on PATH.
 * Names are validated to prevent shell injection.
 */
export function binaryExists(name: string): boolean {
  if (!SAFE_NAME.test(name)) return false;
  try {
    execSync(`command -v ${name}`, { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a command and return trimmed stdout, or null on failure.
 */
export function tryExec(command: string): string | null {
  try {
    return execSync(command, { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}
