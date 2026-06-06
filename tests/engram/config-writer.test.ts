import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

import fs from "fs/promises";
import {
  writeProjectConfig,
  mergeMcpConfig,
  upsertMemoryProtocol,
  memoryProtocolSection,
} from "../../src/engram/config-writer.js";

const readFile = vi.mocked(fs.readFile);
const writeFile = vi.mocked(fs.writeFile);

function mockRead(content: string | null): void {
  if (content === null) {
    readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
  } else {
    readFile.mockResolvedValue(content);
  }
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("writeProjectConfig", () => {
  it("creates .engram/config.json when missing", async () => {
    mockRead(null);
    const result = await writeProjectConfig("/repo", "my-app", false);
    expect(result.outcome).toBe("written");
    expect(writeFile).toHaveBeenCalledWith(
      "/repo/.engram/config.json",
      JSON.stringify({ project_name: "my-app" }, null, 2) + "\n",
      "utf-8",
    );
  });

  it("is a no-op when the same name is already pinned", async () => {
    mockRead(JSON.stringify({ project_name: "my-app" }));
    const result = await writeProjectConfig("/repo", "my-app", false);
    expect(result.outcome).toBe("unchanged");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("refuses to replace a different pinned name without allowReplace", async () => {
    mockRead(JSON.stringify({ project_name: "other-app" }));
    const result = await writeProjectConfig("/repo", "my-app", false);
    expect(result.outcome).toBe("unchanged");
    expect(result.detail).toContain("other-app");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("replaces a different pinned name when allowReplace is set", async () => {
    mockRead(JSON.stringify({ project_name: "other-app" }));
    const result = await writeProjectConfig("/repo", "my-app", false, true);
    expect(result.outcome).toBe("written");
  });

  it("writes nothing in dry-run mode", async () => {
    mockRead(null);
    const result = await writeProjectConfig("/repo", "my-app", true);
    expect(result.outcome).toBe("dry-run");
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe("mergeMcpConfig", () => {
  it("creates the config when the file is missing", async () => {
    mockRead(null);
    const result = await mergeMcpConfig("/repo/.vscode/mcp.json", "servers", ["mcp"], false);
    expect(result.outcome).toBe("written");
    const written = JSON.parse(writeFile.mock.calls[0][1] as string);
    expect(written.servers.engram).toEqual({ command: "engram", args: ["mcp"] });
  });

  it("merges into an existing config without touching other servers", async () => {
    mockRead(JSON.stringify({ servers: { other: { command: "other" } } }));
    const result = await mergeMcpConfig("/repo/.vscode/mcp.json", "servers", ["mcp"], false);
    expect(result.outcome).toBe("written");
    const written = JSON.parse(writeFile.mock.calls[0][1] as string);
    expect(written.servers.other).toEqual({ command: "other" });
    expect(written.servers.engram.command).toBe("engram");
  });

  it("is a no-op when engram is already registered", async () => {
    mockRead(JSON.stringify({ mcpServers: { engram: { command: "engram" } } }));
    const result = await mergeMcpConfig("/repo/.cursor/mcp.json", "mcpServers", ["mcp"], false);
    expect(result.outcome).toBe("unchanged");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("leaves invalid JSON files untouched", async () => {
    mockRead("{ broken json");
    const result = await mergeMcpConfig("/repo/.vscode/mcp.json", "servers", ["mcp"], false);
    expect(result.outcome).toBe("unchanged");
    expect(result.detail).toContain("not valid JSON");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("writes nothing in dry-run mode", async () => {
    mockRead(null);
    const result = await mergeMcpConfig("/repo/.vscode/mcp.json", "servers", ["mcp"], true);
    expect(result.outcome).toBe("dry-run");
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe("upsertMemoryProtocol", () => {
  it("creates the file with the managed section when missing", async () => {
    mockRead(null);
    const result = await upsertMemoryProtocol("/repo/CLAUDE.md", "my-app", false);
    expect(result.outcome).toBe("written");
    const written = writeFile.mock.calls[0][1] as string;
    expect(written).toContain("<!-- engram:start -->");
    expect(written).toContain("`my-app`");
  });

  it("appends the section to an existing file without markers", async () => {
    mockRead("# Existing instructions\n\nSome rules here.\n");
    const result = await upsertMemoryProtocol("/repo/CLAUDE.md", "my-app", false);
    expect(result.outcome).toBe("written");
    const written = writeFile.mock.calls[0][1] as string;
    expect(written.startsWith("# Existing instructions")).toBe(true);
    expect(written).toContain("<!-- engram:start -->");
  });

  it("replaces only the managed section when markers exist", async () => {
    const old = `# Doc\n\n${memoryProtocolSection("old-name")}\n\n# Footer\n`;
    mockRead(old);
    const result = await upsertMemoryProtocol("/repo/CLAUDE.md", "new-name", false);
    expect(result.outcome).toBe("written");
    const written = writeFile.mock.calls[0][1] as string;
    expect(written).toContain("`new-name`");
    expect(written).not.toContain("`old-name`");
    expect(written).toContain("# Footer");
    expect(written.startsWith("# Doc")).toBe(true);
  });

  it("is a no-op when the section is already up to date", async () => {
    mockRead(`# Doc\n\n${memoryProtocolSection("my-app")}\n`);
    const result = await upsertMemoryProtocol("/repo/CLAUDE.md", "my-app", false);
    expect(result.outcome).toBe("unchanged");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("writes nothing in dry-run mode", async () => {
    mockRead(null);
    const result = await upsertMemoryProtocol("/repo/CLAUDE.md", "my-app", true);
    expect(result.outcome).toBe("dry-run");
    expect(writeFile).not.toHaveBeenCalled();
  });
});
