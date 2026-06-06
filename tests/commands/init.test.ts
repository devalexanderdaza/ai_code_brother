import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/engram/index.js", () => ({
  detectEngram: vi.fn(),
  detectAgents: vi.fn(),
  listEngramProjects: vi.fn(() => []),
  deriveProjectName: vi.fn(),
  installEngram: vi.fn(),
  writeProjectConfig: vi.fn(),
  mergeMcpConfig: vi.fn(),
  upsertMemoryProtocol: vi.fn(),
  runEngramSetup: vi.fn(),
  enableGitSync: vi.fn(),
}));

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
  input: vi.fn(),
  checkbox: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: {
    access: vi.fn(() => Promise.reject(new Error("ENOENT"))),
  },
}));

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
} from "../../src/engram/index.js";
import { initCommand } from "../../src/commands/init.js";

const mocks = {
  detectEngram: vi.mocked(detectEngram),
  detectAgents: vi.mocked(detectAgents),
  listEngramProjects: vi.mocked(listEngramProjects),
  deriveProjectName: vi.mocked(deriveProjectName),
  installEngram: vi.mocked(installEngram),
  writeProjectConfig: vi.mocked(writeProjectConfig),
  mergeMcpConfig: vi.mocked(mergeMcpConfig),
  upsertMemoryProtocol: vi.mocked(upsertMemoryProtocol),
  runEngramSetup: vi.mocked(runEngramSetup),
  enableGitSync: vi.mocked(enableGitSync),
};

function setupDefaults(overrides: { installed?: boolean; pinned?: string | null } = {}): void {
  mocks.detectEngram.mockResolvedValue({
    installed: overrides.installed ?? true,
    version: "1.16.1",
    dataDirExists: true,
    projectPinned: overrides.pinned != null,
    projectName: overrides.pinned ?? null,
  });
  mocks.detectAgents.mockResolvedValue([
    {
      setupId: "claude-code",
      binary: "claude",
      label: "Claude Code",
      detected: true,
      configured: false,
    },
    { setupId: null, binary: "code", label: "VS Code (Copilot)", detected: true, configured: false },
  ]);
  mocks.listEngramProjects.mockReturnValue([]);
  mocks.deriveProjectName.mockResolvedValue({
    name: "derived-app",
    source: "package.json",
    confident: true,
  });
  mocks.writeProjectConfig.mockResolvedValue({
    file: "/repo/.engram/config.json",
    outcome: "written",
  });
  mocks.mergeMcpConfig.mockResolvedValue({ file: "mcp.json", outcome: "written" });
  mocks.upsertMemoryProtocol.mockResolvedValue({ file: "CLAUDE.md", outcome: "written" });
  mocks.runEngramSetup.mockReturnValue({
    tool: "Claude Code",
    ok: true,
    skipped: false,
    message: "ok",
  });
  mocks.enableGitSync.mockReturnValue({
    tool: "git-sync",
    ok: true,
    skipped: false,
    message: "ok",
  });
  mocks.installEngram.mockReturnValue({ installed: true, skipped: false, message: "installed" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  setupDefaults();
});

describe("initCommand (non-interactive)", () => {
  it("--no-engram exits cleanly without touching anything", async () => {
    await initCommand(".", { engram: false });
    expect(mocks.writeProjectConfig).not.toHaveBeenCalled();
    expect(mocks.installEngram).not.toHaveBeenCalled();
    expect(mocks.runEngramSetup).not.toHaveBeenCalled();
  });

  it("--yes proceeds only when engram is already installed", async () => {
    setupDefaults({ installed: false });
    await initCommand(".", { yes: true });
    expect(mocks.installEngram).not.toHaveBeenCalled();
    expect(mocks.writeProjectConfig).not.toHaveBeenCalled();
  });

  it("--yes with engram installed pins the derived project name", async () => {
    await initCommand(".", { yes: true });
    expect(mocks.writeProjectConfig).toHaveBeenCalledWith(
      expect.any(String),
      "derived-app",
      false,
    );
    // Global tool configs are never touched implicitly
    expect(mocks.runEngramSetup).not.toHaveBeenCalled();
    expect(mocks.mergeMcpConfig).not.toHaveBeenCalled();
  });

  it("--engram-project overrides derivation", async () => {
    await initCommand(".", { yes: true, engramProject: "custom-name" });
    expect(mocks.deriveProjectName).not.toHaveBeenCalled();
    expect(mocks.writeProjectConfig).toHaveBeenCalledWith(
      expect.any(String),
      "custom-name",
      false,
    );
  });

  it("--setup-tools runs engram setup only for the listed CLIs", async () => {
    await initCommand(".", { engram: true, setupTools: "claude-code" });
    expect(mocks.runEngramSetup).toHaveBeenCalledTimes(1);
    expect(mocks.runEngramSetup.mock.calls[0][0].setupId).toBe("claude-code");
  });

  it("--mcp writes only the requested workspace configs", async () => {
    await initCommand(".", { engram: true, mcp: "vscode" });
    expect(mocks.mergeMcpConfig).toHaveBeenCalledTimes(1);
    expect(mocks.mergeMcpConfig.mock.calls[0][0]).toContain(".vscode");
  });

  it("git sync is never enabled without the flag", async () => {
    await initCommand(".", { engram: true });
    expect(mocks.enableGitSync).not.toHaveBeenCalled();
  });

  it("--git-sync enables sync explicitly", async () => {
    await initCommand(".", { engram: true, gitSync: true });
    expect(mocks.enableGitSync).toHaveBeenCalledWith(false);
  });

  it("--engram installs engram when missing", async () => {
    setupDefaults({ installed: false });
    await initCommand(".", { engram: true });
    expect(mocks.installEngram).toHaveBeenCalledWith(false);
    expect(mocks.writeProjectConfig).toHaveBeenCalled();
  });

  it("updates the Memory Protocol instruction files", async () => {
    await initCommand(".", { yes: true });
    expect(mocks.upsertMemoryProtocol).toHaveBeenCalledWith(
      expect.stringContaining("CLAUDE.md"),
      "derived-app",
      false,
    );
  });
});

describe("initCommand (--dry-run)", () => {
  it("propagates dryRun to every writer", async () => {
    await initCommand(".", { engram: true, dryRun: true, mcp: "vscode,cursor", gitSync: true });
    expect(mocks.writeProjectConfig).toHaveBeenCalledWith(expect.any(String), "derived-app", true);
    for (const call of mocks.mergeMcpConfig.mock.calls) {
      expect(call[3]).toBe(true);
    }
    expect(mocks.upsertMemoryProtocol).toHaveBeenCalledWith(expect.any(String), "derived-app", true);
    expect(mocks.enableGitSync).toHaveBeenCalledWith(true);
  });

  it("propagates dryRun to the installer", async () => {
    setupDefaults({ installed: false });
    mocks.installEngram.mockReturnValue({ installed: false, skipped: false, message: "would run" });
    await initCommand(".", { engram: true, dryRun: true });
    expect(mocks.installEngram).toHaveBeenCalledWith(true);
  });
});

describe("initCommand (idempotency)", () => {
  it("a second run reports unchanged and rewrites nothing", async () => {
    setupDefaults({ pinned: "derived-app" });
    mocks.writeProjectConfig.mockResolvedValue({
      file: "/repo/.engram/config.json",
      outcome: "unchanged",
      detail: 'already pinned to "derived-app"',
    });
    mocks.upsertMemoryProtocol.mockResolvedValue({
      file: "CLAUDE.md",
      outcome: "unchanged",
      detail: "section already up to date",
    });

    await initCommand(".", { yes: true });
    // Collision check is skipped for already-pinned projects
    expect(mocks.listEngramProjects).not.toHaveBeenCalled();
    expect(mocks.installEngram).not.toHaveBeenCalled();
  });

  it("does not silently replace a different pinned name in non-interactive mode", async () => {
    setupDefaults({ pinned: "old-name" });
    mocks.writeProjectConfig.mockResolvedValue({
      file: "/repo/.engram/config.json",
      outcome: "unchanged",
      detail: 'pinned to "old-name" - confirmation required to change it',
    });

    await initCommand(".", { yes: true, engramProject: "new-name" });
    // Only the initial (non-replacing) call; never called with allowReplace=true
    expect(mocks.writeProjectConfig).toHaveBeenCalledTimes(1);
    expect(mocks.writeProjectConfig).toHaveBeenCalledWith(expect.any(String), "new-name", false);
  });
});
