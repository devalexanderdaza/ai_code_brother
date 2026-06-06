/**
 * Init Command
 * Configure a project for persistent cross-agent memory (engram).
 * Idempotent by design: detect first, act only on what is missing,
 * and never touch global tool configs without explicit approval.
 */

import path from "path";
import chalk from "chalk";
import { confirm, input, checkbox } from "@inquirer/prompts";
import {
  detectEngram,
  detectAgents,
  listEngramProjects,
  deriveProjectName,
  installEngram,
  writeProjectConfig,
  mergeMcpConfig,
  upsertMemoryProtocol,
  runEngramSetup,
  enableGitSync,
} from "../engram/index.js";
import type { AgentTool, WriteResult } from "../engram/index.js";

export interface InitOptions {
  dryRun?: boolean;
  yes?: boolean;
  verbose?: boolean;
  engram?: boolean;
  engramProject?: string;
  setupTools?: string;
  mcp?: string;
  gitSync?: boolean;
}

function icon(result: WriteResult): string {
  switch (result.outcome) {
    case "written":
      return chalk.green("+");
    case "dry-run":
      return chalk.yellow("○");
    default:
      return chalk.green("✓");
  }
}

function report(result: WriteResult): void {
  const note = result.detail ? chalk.gray(` (${result.detail})`) : "";
  console.log(`  ${icon(result)} ${result.file}${note}`);
}

/** Non-interactive when --yes or any explicit engram flag is provided. */
function isInteractive(options: InitOptions): boolean {
  return !options.yes && options.engram === undefined;
}

export async function initCommand(target: string, options: InitOptions): Promise<void> {
  const rootPath = path.resolve(target);
  const dryRun = options.dryRun ?? false;
  const interactive = isInteractive(options);

  if (dryRun) {
    console.log(chalk.yellow("\n[DRY RUN]"), "No files or tool configs will be modified.");
  }

  // 1. Detection - the source of truth for every later step
  console.log(chalk.green("\n[DETECT]"), "Inspecting environment...");
  const engram = await detectEngram(rootPath);
  const agents = await detectAgents(rootPath);

  console.log(
    `  ${engram.installed ? chalk.green("✓") : chalk.gray("✗")} engram binary` +
      (engram.version ? chalk.gray(` (${engram.version})`) : ""),
  );
  if (engram.projectPinned) {
    console.log(`  ${chalk.green("✓")} project pinned: ${chalk.bold(engram.projectName)}`);
  }
  for (const agent of agents) {
    const mark = agent.detected ? chalk.green("✓") : chalk.gray("✗");
    const conf = agent.configured ? chalk.gray(" [engram MCP configured]") : "";
    console.log(`  ${mark} ${agent.label}${conf}`);
  }

  // 2. Opt-in gate
  let enable: boolean;
  if (options.engram !== undefined) {
    enable = options.engram;
  } else if (options.yes) {
    // Safe default for non-interactive runs: only proceed when engram
    // is already installed; never install software implicitly.
    enable = engram.installed;
  } else {
    enable = await confirm({
      message: "Enable persistent cross-agent memory with engram for this project?",
      default: true,
    });
  }

  if (!enable) {
    console.log(chalk.gray("\nSkipping engram integration. Run `aicb init` again anytime."));
    return;
  }

  // 3. Install engram if missing (explicit approval only)
  if (!engram.installed) {
    let install = options.engram === true;
    if (interactive) {
      install = await confirm({
        message: "engram is not installed. Install it now via Homebrew?",
        default: true,
      });
    }
    if (!install) {
      console.log(
        chalk.yellow("\nengram is required for memory integration. Install it and re-run:"),
      );
      console.log(chalk.gray("  brew install gentleman-programming/tap/engram"));
      return;
    }
    console.log(chalk.green("\n[INSTALL]"), "Installing engram...");
    const result = installEngram(dryRun);
    console.log(`  ${result.installed || dryRun ? chalk.green("✓") : chalk.red("✗")} ${result.message}`);
    if (!result.installed && !dryRun) {
      process.exitCode = 1;
      return;
    }
  }

  // 4. Project name: flag > derived (+confirmation in interactive mode)
  let projectName = options.engramProject;
  if (!projectName) {
    const derived = await deriveProjectName(rootPath);
    projectName = derived.name;
    if (options.verbose || !derived.confident) {
      console.log(
        chalk.green("\n[PROJECT]"),
        `Derived name "${derived.name}" from ${derived.source}` +
          (derived.confident ? "" : chalk.yellow(" (low confidence)")),
      );
    }
    if (interactive) {
      projectName = await input({
        message: "engram project name for this repository:",
        default: derived.name,
        validate: (v) => v.trim().length > 0 || "Project name cannot be empty",
      });
      projectName = projectName.trim();
    }
  }

  // Collision check against the global engram instance
  if (engram.installed && !engram.projectPinned) {
    const existing = listEngramProjects();
    if (existing.includes(projectName)) {
      console.log(
        chalk.yellow(`\n  ⚠ Project "${projectName}" already exists in your global engram.`),
      );
      console.log(
        chalk.gray("    Its memories will be shared with this repo. Use a different name to isolate them."),
      );
      if (interactive) {
        const proceed = await confirm({
          message: `Use the existing project "${projectName}" anyway?`,
          default: true,
        });
        if (!proceed) {
          projectName = await input({
            message: "New engram project name:",
            validate: (v) =>
              (v.trim().length > 0 && !existing.includes(v.trim())) ||
              "Name must be non-empty and not already in use",
          });
          projectName = projectName.trim();
        }
      }
    }
  }

  // 5. Pin the project
  console.log(chalk.green("\n[CONFIG]"), "Pinning engram project...");
  let pinResult = await writeProjectConfig(rootPath, projectName, dryRun);
  if (pinResult.outcome === "unchanged" && pinResult.detail?.includes("confirmation required")) {
    if (interactive) {
      const replace = await confirm({
        message: `${pinResult.detail}. Replace it with "${projectName}"?`,
        default: false,
      });
      if (replace) {
        pinResult = await writeProjectConfig(rootPath, projectName, dryRun, true);
      }
    } else {
      console.log(chalk.yellow(`  ⚠ ${pinResult.detail} - re-run interactively to change it`));
    }
  }
  report(pinResult);

  // 6. Agent setup: engram-supported CLIs + workspace MCP opt-ins
  await configureAgents(rootPath, projectName, agents, options, dryRun, interactive);

  // 7. Git sync (never by default)
  let gitSync = options.gitSync === true;
  if (interactive && !gitSync) {
    gitSync = await confirm({
      message:
        "Enable git sync? Memory chunks would be committed into .engram/ " +
        "(NOT recommended for public repos)",
      default: false,
    });
  }
  if (gitSync) {
    console.log(chalk.green("\n[SYNC]"), "Enabling git sync...");
    const result = enableGitSync(dryRun);
    console.log(`  ${result.ok ? chalk.green("✓") : chalk.red("✗")} ${result.message}`);
  }

  // 8. Memory Protocol in agent instruction files
  console.log(chalk.green("\n[PROTOCOL]"), "Updating agent instruction files...");
  const instructionFiles = await selectInstructionFiles(rootPath);
  for (const file of instructionFiles) {
    report(await upsertMemoryProtocol(file, projectName, dryRun));
  }

  // 9. Summary
  if (dryRun) {
    console.log(chalk.yellow("\nDry run - nothing was modified."));
  } else {
    console.log(chalk.green("\n[COMPLETE]"), "Memory integration configured.");
    console.log(chalk.gray("  Next steps:"));
    console.log(chalk.gray("  • Restart your IDEs/agents so they pick up the MCP server"));
    console.log(chalk.gray("  • Verify with: engram doctor"));
    console.log(chalk.gray("  • Inspect memories anytime with: engram tui"));
  }
}

/** CLAUDE.md and/or AGENTS.md when present; CLAUDE.md when neither exists. */
async function selectInstructionFiles(rootPath: string): Promise<string[]> {
  const fs = await import("fs/promises");
  const candidates = ["CLAUDE.md", "AGENTS.md"];
  const existing: string[] = [];
  for (const name of candidates) {
    try {
      await fs.default.access(path.join(rootPath, name));
      existing.push(path.join(rootPath, name));
    } catch {
      // not present
    }
  }
  return existing.length > 0 ? existing : [path.join(rootPath, "CLAUDE.md")];
}

async function configureAgents(
  rootPath: string,
  projectName: string,
  agents: AgentTool[],
  options: InitOptions,
  dryRun: boolean,
  interactive: boolean,
): Promise<void> {
  // 6a. engram setup <tool> for detected, supported CLIs
  const supported = agents.filter((a) => a.setupId && a.detected);
  const unsupported = agents.filter((a) => a.setupId && !a.detected);

  let chosenSetup: AgentTool[] = [];
  if (options.setupTools !== undefined) {
    const wanted = new Set(options.setupTools.split(",").map((s) => s.trim()).filter(Boolean));
    chosenSetup = supported.filter((a) => a.setupId && wanted.has(a.setupId));
  } else if (interactive && supported.length > 0) {
    const picked = await checkbox({
      message: "Configure these detected agents with engram? (global tool configs)",
      choices: supported.map((a) => ({
        name: `${a.label} (engram setup ${a.setupId})`,
        value: a.setupId as string,
        checked: true,
      })),
    });
    const pickedSet = new Set(picked);
    chosenSetup = supported.filter((a) => a.setupId && pickedSet.has(a.setupId));
  }
  // --yes without --setup-tools: never touch global configs implicitly

  if (chosenSetup.length > 0) {
    console.log(chalk.green("\n[SETUP]"), "Configuring agent CLIs...");
    for (const tool of chosenSetup) {
      const result = runEngramSetup(tool, dryRun);
      console.log(`  ${result.ok ? chalk.green("✓") : chalk.red("✗")} ${result.message}`);
    }
  }
  if (unsupported.length > 0 && options.verbose) {
    console.log(
      chalk.gray(
        `  Also supported by engram setup (not detected): ${unsupported.map((a) => a.label).join(", ")}`,
      ),
    );
  }

  // 6b. Workspace MCP opt-ins (project-local files only)
  const mcpTargets: { id: string; label: string; write: () => Promise<WriteResult> }[] = [
    {
      id: "vscode",
      label: "VS Code (.vscode/mcp.json)",
      write: () =>
        mergeMcpConfig(
          path.join(rootPath, ".vscode", "mcp.json"),
          "servers",
          // VS Code does not reliably pass the shell cwd - pin the project
          ["mcp", `--project=${projectName}`, "--tools=agent"],
          dryRun,
        ),
    },
    {
      id: "cursor",
      label: "Cursor (.cursor/mcp.json)",
      write: () =>
        mergeMcpConfig(path.join(rootPath, ".cursor", "mcp.json"), "mcpServers", ["mcp"], dryRun),
    },
  ];

  let chosenMcp: typeof mcpTargets = [];
  if (options.mcp !== undefined) {
    const wanted = new Set(options.mcp.split(",").map((s) => s.trim()).filter(Boolean));
    chosenMcp = mcpTargets.filter((t) => wanted.has(t.id));
  } else if (interactive) {
    const picked = await checkbox({
      message: "Add workspace MCP configs? (project-local files, safe to commit)",
      choices: mcpTargets.map((t) => ({ name: t.label, value: t.id, checked: true })),
    });
    const pickedSet = new Set(picked);
    chosenMcp = mcpTargets.filter((t) => pickedSet.has(t.id));
  }

  if (chosenMcp.length > 0) {
    console.log(chalk.green("\n[MCP]"), "Writing workspace MCP configs...");
    for (const target of chosenMcp) {
      report(await target.write());
    }
  }
}
