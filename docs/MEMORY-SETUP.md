# Memory Setup — Persistent Cross-Agent Memory with Engram

AI Code Brother integrates [engram](https://github.com/Gentleman-Programming/engram) to give every AI coding agent on your machine a **shared, persistent memory**. Work saved from Claude Code is recallable from VS Code Copilot, Cursor, Gemini CLI, Codex, or OpenCode — and survives session resets, compactions, and IDE restarts.

The integration is **completely optional** and managed by the `aicb init` command.

## Architecture

```
Claude Code ─┐
VS Code      ├─ MCP (stdio) ──► engram (single Go binary) ──► SQLite + FTS5
Cursor       │                                                 (~/.engram/engram.db)
Gemini CLI   │
Codex        │
OpenCode    ─┘
```

- **One binary, one SQLite file.** No Node.js services, no Python, no Docker required.
- Every agent talks to the same MCP server, so memory written by one agent is readable by all.
- Memory is segmented by **project**; this repo pins its project name in `.engram/config.json`.
- Engram exposes 19 MCP tools — the key ones: `mem_save`, `mem_search`, `mem_context`, `mem_timeline`, plus session lifecycle (`mem_session_start`/`end`/`summary`).

## Quick Start

```bash
# Interactive setup (recommended for first run)
aicb init

# Preview everything without modifying anything
aicb init --dry-run

# Scripted / CI-friendly
aicb init --engram --engram-project my-app --setup-tools claude-code --mcp vscode,cursor
```

## The `init` Command

```
aicb init [path] [options]

  -n, --dry-run              Preview every action without modifying anything
  -y, --yes                  Non-interactive safe defaults (never installs,
                             never touches global tool configs)
  --engram / --no-engram     Force-enable / force-skip without asking
  --engram-project <name>    Project name (skips derivation + confirmation)
  --setup-tools <list>       CLIs to configure: claude-code,opencode,gemini-cli,codex
  --mcp <list>               Workspace MCP configs to write: vscode,cursor
  --git-sync                 Enable git sync (never enabled by default)
  -v, --verbose              Detailed output
```

### Idempotency guarantees

`init` is detection-first and safe to re-run:

- **Never reinstalls** — if `engram` is on PATH, installation is skipped with its version reported.
- **Never overwrites** — MCP configs are JSON-merged; existing entries (engram or otherwise) are left untouched. Invalid JSON files are left alone and reported.
- **Never renames silently** — if `.engram/config.json` already pins a different project name, `init` asks for confirmation (interactive) or refuses (non-interactive).
- **Managed markdown sections** — the Memory Protocol lives between `<!-- engram:start -->` / `<!-- engram:end -->` markers in `CLAUDE.md` / `AGENTS.md`; re-running updates only that section.
- **Global tool configs require explicit approval** — `engram setup <tool>` modifies configs shared with other projects (`~/.gemini/`, `~/.codex/`, `~/.config/opencode/`), so it only runs for tools you select interactively or pass via `--setup-tools`.

### Project naming strategy

The engram project name is derived from your project's manifest, in priority order:

| Priority | File | Field |
|---|---|---|
| 1 | `package.json` | `name` (npm scope stripped) |
| 2 | `pyproject.toml` | `[project].name` |
| 3 | `Cargo.toml` | `[package].name` |
| 4 | `go.mod` | module path (last segment) |
| 5 | `composer.json` | `name` (vendor prefix stripped) |
| 6 | `pom.xml` | `<artifactId>` |
| 7 | `settings.gradle(.kts)` | `rootProject.name` |
| 8 | directory basename | (low confidence — always confirmed interactively) |

Generic names (`app`, `src`, `main`, …) are flagged as low-confidence and confirmed with you. If the derived name collides with an existing project in your global engram instance, `init` warns you and lets you pick another name. Renaming an existing engram project is out of scope — use `engram projects consolidate` manually.

## Per-Agent Setup

`aicb init` handles all of this for you; the snippets below are for reference or manual setup.

### Claude Code (official plugin — recommended)

```bash
claude plugin marketplace add Gentleman-Programming/engram
claude plugin install engram
```

Registers the MCP server, hooks, and Memory Protocol skill automatically.
**Linux EXDEV fix:** if the install fails with a cross-device link error, run with `TMPDIR=~/.cache/claude-tmp` (handled automatically by `init`). On schema errors run `claude update` first.

### VS Code / Copilot — `.vscode/mcp.json` (workspace)

```json
{
  "servers": {
    "engram": { "command": "engram", "args": ["mcp", "--project=<name>", "--tools=agent"] }
  }
}
```

The `--project` pin matters: VS Code does not reliably pass the shell cwd to MCP servers. The generated `.github/copilot-instructions.md` includes the Memory Protocol section when this repo has `.engram/config.json` (covers both VS Code Copilot and Copilot CLI).

### Cursor — `.cursor/mcp.json` (workspace)

```json
{
  "mcpServers": {
    "engram": { "command": "engram", "args": ["mcp"] }
  }
}
```

For the protocol rule, add `.cursor/rules/engram.mdc` (or `~/.cursor/rules/engram.mdc` globally) with `alwaysApply: true` frontmatter.

### Gemini CLI / Codex / OpenCode

```bash
engram setup gemini-cli   # ~/.gemini/settings.json + system.md + GEMINI_SYSTEM_MD=1
engram setup codex        # ~/.codex/config.toml + instructions + compact prompt
engram setup opencode     # plugin + MCP entry + statusline
```

### Windsurf — `~/.windsurf/mcp.json`

```json
{
  "mcpServers": {
    "engram": { "command": "engram", "args": ["mcp"] }
  }
}
```

Add the Memory Protocol to `.windsurfrules`.

## Memory Protocol

The protocol inserted into agent instruction files (managed section):

- **Search first** — before starting work, recall relevant context with `mem_search` or `mem_context`.
- **Save proactively** — after significant work (bugfixes, architecture decisions, lessons learned), call `mem_save` with What/Why/Where/Learned.
- **Survive compaction** — after a context reset, call `mem_context` to recover state.
- **Project scope** — the repo is pinned via `.engram/config.json`. On `ambiguous_project` errors, retry with an explicit `project` — never guess.

> The Copilot SDK analysis session used by `aicb assimilate` is ephemeral and does **not** need memory tools — memory applies to interactive coding agents.

## Practical Workflow

### Example: Fixing a bug with shared context

1. **Session 1 — Claude Code:**
   - `mem_search("authentication flow")` — recall prior context
   - Identify bug, make fix, write test
   - `mem_save({ what: "fixed token refresh race condition", why: "caused 401 on concurrent requests", where: "src/auth/session.ts:124", learned: "need mutex for refresh queue" })`

2. **Session 2 — VS Code (next day, different machine):**
   - Open same repo, modify settings to use engram
   - `mem_search("token refresh")` — finds the prior fix note
   - Discovers related issue: cache invalidation
   - Saves new memory building on the prior context

3. **Session 3 — Cursor or Gemini CLI:**
   - `mem_context()` — loads project's full memory summary
   - Sees both prior findings, implements consolidated fix

## Git Sync & Cloud (not enabled by default)

- **Git sync** (`engram sync`) exports compressed memory chunks into `.engram/` for committing — enabling cross-machine memory through the repo itself. ⚠️ **In a public repository your memory becomes public.** `init` only enables it with `--git-sync` or explicit interactive approval. Import on another machine with `engram sync --import`.
- **Cloud replication** is opt-in and CLI-first (`engram cloud config` / `enroll` / `sync --cloud`). Local SQLite stays authoritative. Not managed by `init`.

## Maintenance

```bash
engram doctor        # diagnose installation and database
engram tui           # browse memories (vim-style navigation)
engram stats         # memory statistics
brew upgrade engram  # upgrade the binary
```

**After upgrading:** re-run the setup for each agent and restart the client — a running stdio MCP subprocess is not replaced by updating the binary on disk.

## Troubleshooting

### engram binary not found after install

- Verify Homebrew install: `brew list gentleman-programming/tap/engram`
- Add to PATH: `export PATH="/usr/local/bin:$PATH"` (or your linuxbrew prefix)
- Restart your terminal/IDE
- Re-run `aicb init` to detect it

### Plugin install fails on Claude Code ("cross-device link" error)

This happens on Linux when `/tmp` and `$HOME` are on different filesystems.
- `aicb init` sets `TMPDIR=~/.cache/claude-tmp` automatically
- If it still fails: run `claude update` first, then retry

### "No such file or directory" when running `engram setup <tool>`

- Verify `engram` is on PATH: `which engram`
- Verify the tool binary exists: e.g., `which gemini` for Gemini CLI
- If tool is installed but not on PATH, add its bin directory to `$PATH`

### Project name collision ("project already exists")

- `init` detects this and warns you in interactive mode
- Either: reuse the existing project (shared memory across clones), or choose a different name
- To list existing projects: `engram projects list`
- To consolidate/rename: use `engram projects consolidate` manually (out of scope for `init`)

### MCP server not loaded after restart

- Verify `.vscode/mcp.json` exists (for VS Code) or `.cursor/mcp.json` (for Cursor)
- Check syntax: `jq . .vscode/mcp.json` (must be valid JSON)
- Restart the IDE completely (not just reload window)
- Run `engram doctor` to diagnose the engram binary itself
- View Copilot logs: VS Code → Output panel → "Copilot" channel

### Memory not visible across agents

- Confirm all agents point to the **same project**: `engram doctor` → "Project" row
- If project names differ: re-run `aicb init --engram-project <shared-name>` on each repo
- Verify SQLite file is readable: `ls -l ~/.engram/` (should exist and be writable)
- Test with `engram tui` to browse the shared database

### Git sync not working ("engram sync" hangs or fails)

- Ensure engram is up to date: `brew upgrade engram && engram version`
- Verify `.engram/config.json` exists and has `project_name`
- Check disk space: `du -sh ~/.engram/`
- Try `engram sync --dry-run` first
- If stuck, force-interrupt and check logs in `.engram/sync.log`

## Dogfooding: Applying to ai-code-brother itself

To use engram for memory while developing this project:

```bash
npm run build
node bin/aicb.js init --dry-run
# review the output, then:
node bin/aicb.js init
# or non-interactive:
node bin/aicb.js init --engram --engram-project ai-code-brother --setup-tools claude-code --mcp vscode,cursor
```

This:
1. Installs engram (if missing)
2. Pins the project name to `ai-code-brother` in `.engram/config.json`
3. Configures the engram plugin for Claude Code
4. Adds engram MCP entry to `.vscode/mcp.json` and `.cursor/mcp.json`
5. Inserts the Memory Protocol section into `CLAUDE.md`

After restarting your IDE, use:
- `mem_search("ADR")` to find prior architecture decisions
- `mem_save` after committing a tricky bugfix or design decision
- `mem_context` to recover state after a context compaction in Claude Code

The shared memory persists across feature branches and machine reboots.

## Future Work

- **Automatic model selection per task type** with the Copilot SDK. The SDK does not currently document an `"auto"` model mode; `aicb` selects the best available model from your subscription via `listModels()` (see `src/analyzer/model.ts`). References to evaluate: [copilot-sdk (Node.js)](https://github.com/github/copilot-sdk/tree/main/nodejs) and the [official cookbook](https://github.com/github/awesome-copilot/tree/main/cookbook/copilot-sdk/nodejs).
- **Engram project rename/cleanup flows** (`engram projects consolidate` / `prune`) integrated into `init`.
- **Conflict surfacing** (engram beta): detects contradictory memories using an LLM judge via your existing Claude Code/OpenCode CLI. Requires Docker for isolated mode.
