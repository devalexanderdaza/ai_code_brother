/**
 * Engram detection - inspect the environment before touching anything.
 * Detection-first is what makes `init` idempotent and safe for tools
 * shared globally with other projects.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import { binaryExists, tryExec } from "../utils/exec.js";

export interface EngramStatus {
  /** engram binary found on PATH */
  installed: boolean;
  /** Output of `engram version`, when installed */
  version: string | null;
  /** ~/.engram data directory exists (memories from any project) */
  dataDirExists: boolean;
  /** .engram/config.json exists in the target repo */
  projectPinned: boolean;
  /** project_name from .engram/config.json, when pinned */
  projectName: string | null;
}

export interface AgentTool {
  /** Identifier used by `engram setup <id>` (null when engram has no setup for it) */
  setupId: string | null;
  /** Binary checked on PATH */
  binary: string;
  /** Human-readable name */
  label: string;
  /** Binary found on PATH */
  detected: boolean;
  /** Workspace MCP config already contains an engram entry */
  configured: boolean;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Detect engram installation and project pinning state. */
export async function detectEngram(rootPath: string): Promise<EngramStatus> {
  const installed = binaryExists("engram");
  const version = installed ? tryExec("engram version") : null;
  const dataDirExists = await fileExists(path.join(os.homedir(), ".engram"));

  const config = await readJson(path.join(rootPath, ".engram", "config.json"));
  const projectName = typeof config?.project_name === "string" ? config.project_name : null;

  return {
    installed,
    version,
    dataDirExists,
    projectPinned: projectName !== null,
    projectName,
  };
}

/** Check whether a workspace MCP config file already registers engram. */
async function hasEngramMcpEntry(configPath: string, serversKey: string): Promise<boolean> {
  const config = await readJson(configPath);
  const servers = config?.[serversKey] as Record<string, unknown> | undefined;
  return servers !== undefined && "engram" in servers;
}

/**
 * Detect AI agent tools on this machine and whether they already have
 * an engram MCP entry at workspace level.
 */
export async function detectAgents(rootPath: string): Promise<AgentTool[]> {
  return [
    {
      setupId: "claude-code",
      binary: "claude",
      label: "Claude Code",
      detected: binaryExists("claude"),
      configured: false, // plugin state is managed by `claude plugin`, not a workspace file
    },
    {
      setupId: null,
      binary: "code",
      label: "VS Code (Copilot)",
      detected: binaryExists("code"),
      configured: await hasEngramMcpEntry(path.join(rootPath, ".vscode", "mcp.json"), "servers"),
    },
    {
      setupId: null,
      binary: "cursor",
      label: "Cursor",
      detected: binaryExists("cursor"),
      configured: await hasEngramMcpEntry(
        path.join(rootPath, ".cursor", "mcp.json"),
        "mcpServers",
      ),
    },
    {
      setupId: "gemini-cli",
      binary: "gemini",
      label: "Gemini CLI",
      detected: binaryExists("gemini"),
      configured: false,
    },
    {
      setupId: "codex",
      binary: "codex",
      label: "Codex",
      detected: binaryExists("codex"),
      configured: false,
    },
    {
      setupId: "opencode",
      binary: "opencode",
      label: "OpenCode",
      detected: binaryExists("opencode"),
      configured: false,
    },
  ];
}

/** List project names already known to the global engram instance. */
export function listEngramProjects(): string[] {
  const output = tryExec("engram projects list");
  if (!output) return [];
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("No "));
}
