#!/usr/bin/env node
/**
 * AI Code Brother CLI
 * "The best thing about being me... there are so many of me."
 *
 * Assimilate any repository into a fully autonomous GitHub Copilot agent.
 */

import { Command } from "commander";
import chalk from "chalk";
import { assimilateCommand } from "./commands/assimilate.js";
import { initCommand } from "./commands/init.js";
import { searchCommand } from "./commands/search.js";
import { validateCommand } from "./commands/validate.js";

const program = new Command();

const banner = `
${chalk.green("╔═══════════════════════════════════════════════════════════════════╗")}
${chalk.green("║")}                       ${chalk.bold.white("AI CODE BROTHER")}                             ${chalk.green("║")}
${chalk.green("║")}              ${chalk.gray('"The best thing about being me...')}                   ${chalk.green("║")}
${chalk.green("║")}                   ${chalk.gray('there are so many of me."')}                        ${chalk.green("║")}
${chalk.green("╚═══════════════════════════════════════════════════════════════════╝")}
`;

program
  .name("ai-code-brother")
  .description("Assimilate any repository into a fully autonomous GitHub Copilot agent")
  .version("0.4.0")
  .addHelpText("beforeAll", banner)
  .addHelpText("after", `
${chalk.bold("Examples:")}
  $ aicb assimilate .                                    # Analyze current directory
  $ aicb assimilate https://github.com/expressjs/express # Analyze remote repo
  $ aicb assimilate . --dry-run --verbose                # Preview with details
  $ aicb search "routing"                                # Search skills registry
  $ aicb validate                                        # Validate generated assets

${chalk.bold("Requirements:")}
  • Node.js 18+
  • GitHub Copilot subscription (for SDK access)
  • Copilot CLI installed and in PATH

${chalk.bold("Documentation:")}
  https://github.com/devalexanderdaza/ai_code_brother
`);

program
  .command("assimilate")
  .description("Analyze a repository and generate agent assets (skills, agents, hooks)")
  .argument("<target>", "Path to local repo or GitHub URL")
  .option("-n, --dry-run", "Preview what would be generated without writing files")
  .option("-v, --verbose", "Show detailed analysis output including file-by-file processing")
  .option("-o, --output <path>", "Output directory for generated assets")
  .option("--no-instructions", "Skip generation of .github/copilot-instructions.md")
  .option("--single-agent", "Generate a single agent.md instead of multi-agent constellation (v0.3 compat)")
  .option("-m, --model <id>", "Copilot model to use for analysis (default: best available in your subscription)")
  .addHelpText("after", `
${chalk.bold("Examples:")}
  $ aicb assimilate .                                      # Local repository (multi-agent)
  $ aicb assimilate ~/projects/myapp                       # Specific path
  $ aicb assimilate https://github.com/expressjs/express   # GitHub URL
  $ aicb assimilate . --dry-run                            # Preview mode
  $ aicb assimilate . -o ./output                          # Custom output
  $ aicb assimilate . --single-agent                       # Single agent (v0.3 compat)

${chalk.bold("Generated assets:")}
  .github/copilot-instructions.md  - Workspace-wide Copilot instructions
  .github/skills/<name>/SKILL.md   - Reusable skill definitions
  .github/agents/<name>.agent.md   - Agent configurations (multi-agent constellation)
  .github/copilot/handoffs.json    - Agent delegation graph
  .github/hooks/*.yaml             - Lifecycle hooks
  skills-registry.jsonl            - Searchable index
`)
  .action(assimilateCommand);

program
  .command("init")
  .description("Configure persistent cross-agent memory (engram) for a project")
  .argument("[path]", "Path to repository (default: current directory)", ".")
  .option("-n, --dry-run", "Preview every action without modifying anything")
  .option("-y, --yes", "Non-interactive: accept safe defaults (never installs or touches global configs)")
  .option("--engram", "Enable engram integration without asking (installs if missing)")
  .option("--no-engram", "Skip engram integration without asking")
  .option("--engram-project <name>", "engram project name (skips derivation and confirmation)")
  .option("--setup-tools <list>", "Comma-separated CLIs to configure via engram setup (claude-code,opencode,gemini-cli,codex)")
  .option("--mcp <list>", "Comma-separated workspace MCP configs to write (vscode,cursor)")
  .option("--git-sync", "Enable engram git sync (memory chunks committed to .engram/)")
  .option("-v, --verbose", "Show detailed output")
  .addHelpText("after", `
${chalk.bold("Examples:")}
  $ aicb init                                          # Interactive setup
  $ aicb init --dry-run                                # Preview all actions
  $ aicb init -y                                       # Safe non-interactive defaults
  $ aicb init --engram --engram-project my-app         # Scripted full setup
  $ aicb init --engram --setup-tools claude-code --mcp vscode,cursor

${chalk.bold("What it does (all idempotent, all opt-in):")}
  • Detects engram, agent CLIs and existing configs before acting
  • Installs engram (Homebrew) only with approval
  • Pins the project name in .engram/config.json (derived from your manifest)
  • Runs engram setup for the agent CLIs you select
  • Writes workspace MCP configs (.vscode/mcp.json, .cursor/mcp.json) on request
  • Inserts the Memory Protocol section in CLAUDE.md / AGENTS.md
`)
  .action(initCommand);

program
  .command("search")
  .description("Search the skills and agents registry by keyword")
  .argument("<query>", "Search query (matches name, description, triggers)")
  .option("-l, --limit <number>", "Maximum results to return", "10")
  .option("-t, --type <type>", "Filter by type: skill, agent, or hook")
  .addHelpText("after", `
${chalk.bold("Examples:")}
  $ aicb search "routing"              # Search all assets
  $ aicb search "test" --type skill    # Only skills
  $ aicb search "api" --limit 5        # Limit results
`)
  .action(searchCommand);

program
  .command("validate")
  .description("Validate generated agent assets for correctness")
  .argument("[path]", "Path to repository (default: current directory)", ".")
  .option("-v, --verbose", "Show detailed validation output with all checks")
  .addHelpText("after", `
${chalk.bold("Checks performed:")}
  • Skills have valid frontmatter (name, description)
  • Agents have required fields and valid skill references
  • Hooks have valid events and non-empty commands
  • Registry entries are valid JSON with required fields

${chalk.bold("Examples:")}
  $ aicb validate                      # Current directory
  $ aicb validate ./my-project         # Specific path
  $ aicb validate --verbose            # Detailed output
`)
  .action(validateCommand);

program.parse();
