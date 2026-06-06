/**
 * Engram config writers - every write is idempotent and dry-run aware.
 * Existing files are merged, never overwritten; managed sections in
 * markdown live between markers so re-running init updates in place.
 */

import fs from "fs/promises";
import path from "path";

export type WriteOutcome = "written" | "unchanged" | "dry-run";

export interface WriteResult {
  file: string;
  outcome: WriteOutcome;
  detail?: string;
}

const MEMORY_START = "<!-- engram:start -->";
const MEMORY_END = "<!-- engram:end -->";

export function memoryProtocolSection(projectName: string): string {
  return `${MEMORY_START}
## Memory Protocol (Engram)

This project uses [engram](https://github.com/Gentleman-Programming/engram) for persistent, cross-agent memory.

- **Search first**: before starting work, recall relevant context with \`mem_search\` or \`mem_context\`.
- **Save proactively**: after significant work (bugfixes, decisions, lessons learned), call \`mem_save\` with What/Why/Where/Learned.
- **Survive compaction**: after a context reset or compaction, call \`mem_context\` to recover state.
- **Project scope**: this repo is pinned to the engram project \`${projectName}\` via \`.engram/config.json\`. On \`ambiguous_project\` errors, retry with explicit \`project\` - never guess.
${MEMORY_END}`;
}

async function readFileOrNull(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    return null;
  }
}

async function writeFile(p: string, content: string, dryRun: boolean): Promise<WriteOutcome> {
  if (dryRun) return "dry-run";
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf-8");
  return "written";
}

/**
 * Write .engram/config.json pinning the project name.
 * Refuses to silently replace a different existing name - the caller
 * must resolve the conflict with the user first.
 */
export async function writeProjectConfig(
  rootPath: string,
  projectName: string,
  dryRun: boolean,
  allowReplace = false,
): Promise<WriteResult> {
  const file = path.join(rootPath, ".engram", "config.json");
  const existing = await readFileOrNull(file);

  if (existing !== null) {
    let current: string | undefined;
    try {
      current = (JSON.parse(existing) as { project_name?: string }).project_name;
    } catch {
      current = undefined;
    }
    if (current === projectName) {
      return { file, outcome: "unchanged", detail: `already pinned to "${projectName}"` };
    }
    if (current && !allowReplace) {
      return {
        file,
        outcome: "unchanged",
        detail: `pinned to "${current}" - confirmation required to change it`,
      };
    }
  }

  const outcome = await writeFile(
    file,
    JSON.stringify({ project_name: projectName }, null, 2) + "\n",
    dryRun,
  );
  return { file, outcome };
}

/**
 * Merge an engram server entry into a workspace MCP config
 * (.vscode/mcp.json uses "servers", .cursor/mcp.json uses "mcpServers").
 * Existing entries - engram or otherwise - are never touched.
 */
export async function mergeMcpConfig(
  configPath: string,
  serversKey: "servers" | "mcpServers",
  engramArgs: string[],
  dryRun: boolean,
): Promise<WriteResult> {
  const existing = await readFileOrNull(configPath);
  let config: Record<string, unknown> = {};

  if (existing !== null) {
    try {
      config = JSON.parse(existing) as Record<string, unknown>;
    } catch {
      return {
        file: configPath,
        outcome: "unchanged",
        detail: "existing file is not valid JSON - left untouched",
      };
    }
  }

  const servers = (config[serversKey] ?? {}) as Record<string, unknown>;
  if ("engram" in servers) {
    return { file: configPath, outcome: "unchanged", detail: "engram entry already present" };
  }

  servers["engram"] = { command: "engram", args: engramArgs };
  config[serversKey] = servers;

  const outcome = await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", dryRun);
  return { file: configPath, outcome };
}

/**
 * Insert or refresh the managed Memory Protocol section in a markdown
 * file (CLAUDE.md / AGENTS.md). Content outside the markers is never
 * modified. Returns "unchanged" when the section is already current.
 */
export async function upsertMemoryProtocol(
  filePath: string,
  projectName: string,
  dryRun: boolean,
): Promise<WriteResult> {
  const section = memoryProtocolSection(projectName);
  const existing = await readFileOrNull(filePath);

  if (existing === null) {
    const outcome = await writeFile(filePath, section + "\n", dryRun);
    return { file: filePath, outcome, detail: "created" };
  }

  const startIdx = existing.indexOf(MEMORY_START);
  const endIdx = existing.indexOf(MEMORY_END);

  let next: string;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + MEMORY_END.length);
    next = before + section + after;
  } else {
    next = existing.trimEnd() + "\n\n" + section + "\n";
  }

  if (next === existing) {
    return { file: filePath, outcome: "unchanged", detail: "section already up to date" };
  }

  const outcome = await writeFile(filePath, next, dryRun);
  return { file: filePath, outcome };
}
