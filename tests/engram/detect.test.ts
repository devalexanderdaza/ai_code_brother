import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/utils/exec.js", () => ({
  binaryExists: vi.fn(),
  tryExec: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: {
    access: vi.fn(),
    readFile: vi.fn(),
  },
}));

import fs from "fs/promises";
import { binaryExists, tryExec } from "../../src/utils/exec.js";
import { detectEngram, detectAgents, listEngramProjects } from "../../src/engram/detect.js";

const mockBinaryExists = vi.mocked(binaryExists);
const mockTryExec = vi.mocked(tryExec);
const mockAccess = vi.mocked(fs.access);
const mockReadFile = vi.mocked(fs.readFile);

beforeEach(() => {
  vi.resetAllMocks();
  mockAccess.mockRejectedValue(new Error("ENOENT"));
  mockReadFile.mockRejectedValue(new Error("ENOENT"));
});

describe("detectEngram", () => {
  it("reports a full installation with a pinned project", async () => {
    mockBinaryExists.mockReturnValue(true);
    mockTryExec.mockReturnValue("engram version 1.16.1");
    mockAccess.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(JSON.stringify({ project_name: "my-app" }));

    const status = await detectEngram("/repo");
    expect(status).toEqual({
      installed: true,
      version: "engram version 1.16.1",
      dataDirExists: true,
      projectPinned: true,
      projectName: "my-app",
    });
  });

  it("reports a clean machine when nothing is installed", async () => {
    mockBinaryExists.mockReturnValue(false);

    const status = await detectEngram("/repo");
    expect(status).toEqual({
      installed: false,
      version: null,
      dataDirExists: false,
      projectPinned: false,
      projectName: null,
    });
    expect(mockTryExec).not.toHaveBeenCalled();
  });

  it("treats malformed .engram/config.json as not pinned", async () => {
    mockBinaryExists.mockReturnValue(true);
    mockTryExec.mockReturnValue("v1");
    mockReadFile.mockResolvedValue("{ broken");

    const status = await detectEngram("/repo");
    expect(status.projectPinned).toBe(false);
    expect(status.projectName).toBeNull();
  });
});

describe("detectAgents", () => {
  it("flags detected binaries and existing workspace MCP entries", async () => {
    mockBinaryExists.mockImplementation((name) => name === "claude" || name === "code");
    mockReadFile.mockImplementation(async (p) => {
      if (String(p).endsWith(".vscode/mcp.json")) {
        return JSON.stringify({ servers: { engram: { command: "engram" } } });
      }
      throw new Error("ENOENT");
    });

    const agents = await detectAgents("/repo");
    const byLabel = Object.fromEntries(agents.map((a) => [a.label, a]));

    expect(byLabel["Claude Code"].detected).toBe(true);
    expect(byLabel["VS Code (Copilot)"].detected).toBe(true);
    expect(byLabel["VS Code (Copilot)"].configured).toBe(true);
    expect(byLabel["Cursor"].detected).toBe(false);
    expect(byLabel["Cursor"].configured).toBe(false);
    expect(byLabel["Gemini CLI"].detected).toBe(false);
  });
});

describe("listEngramProjects", () => {
  it("parses project names from engram output", () => {
    mockTryExec.mockReturnValue("alpha\nbeta\n");
    expect(listEngramProjects()).toEqual(["alpha", "beta"]);
  });

  it("returns an empty list when engram fails", () => {
    mockTryExec.mockReturnValue(null);
    expect(listEngramProjects()).toEqual([]);
  });
});
