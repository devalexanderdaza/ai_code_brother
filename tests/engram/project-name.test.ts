import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn(),
  },
}));

import fs from "fs/promises";
import { deriveProjectName } from "../../src/engram/project-name.js";

const readFile = vi.mocked(fs.readFile);

/** Make readFile resolve only for the given files (by basename). */
function mockFiles(files: Record<string, string>): void {
  readFile.mockImplementation(async (p) => {
    const basename = String(p).split("/").pop() ?? "";
    if (basename in files) return files[basename];
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  });
}

describe("deriveProjectName", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("prefers package.json name for Node projects", async () => {
    mockFiles({ "package.json": JSON.stringify({ name: "my-app" }) });
    const result = await deriveProjectName("/repo");
    expect(result).toEqual({ name: "my-app", source: "package.json", confident: true });
  });

  it("strips npm scopes", async () => {
    mockFiles({ "package.json": JSON.stringify({ name: "@org/my-pkg" }) });
    const result = await deriveProjectName("/repo");
    expect(result.name).toBe("my-pkg");
    expect(result.confident).toBe(true);
  });

  it("reads pyproject.toml for Python projects", async () => {
    mockFiles({ "pyproject.toml": '[project]\nname = "py-tool"\nversion = "1.0"' });
    const result = await deriveProjectName("/repo");
    expect(result).toEqual({ name: "py-tool", source: "pyproject.toml", confident: true });
  });

  it("reads Cargo.toml for Rust projects", async () => {
    mockFiles({ "Cargo.toml": '[package]\nname = "rusty"\nversion = "0.1.0"' });
    const result = await deriveProjectName("/repo");
    expect(result).toEqual({ name: "rusty", source: "Cargo.toml", confident: true });
  });

  it("uses the last segment of the go.mod module path", async () => {
    mockFiles({ "go.mod": "module github.com/acme/widget\n\ngo 1.22" });
    const result = await deriveProjectName("/repo");
    expect(result).toEqual({ name: "widget", source: "go.mod", confident: true });
  });

  it("uses the package part of composer.json names", async () => {
    mockFiles({ "composer.json": JSON.stringify({ name: "vendor/lib-x" }) });
    const result = await deriveProjectName("/repo");
    expect(result.name).toBe("lib-x");
  });

  it("reads artifactId from pom.xml", async () => {
    mockFiles({ "pom.xml": "<project><artifactId>java-svc</artifactId></project>" });
    const result = await deriveProjectName("/repo");
    expect(result).toEqual({ name: "java-svc", source: "pom.xml", confident: true });
  });

  it("falls back to the directory basename with low confidence", async () => {
    mockFiles({});
    const result = await deriveProjectName("/home/user/cool-repo");
    expect(result).toEqual({ name: "cool-repo", source: "directory name", confident: false });
  });

  it("flags generic manifest names as not confident", async () => {
    mockFiles({ "package.json": JSON.stringify({ name: "app" }) });
    const result = await deriveProjectName("/repo");
    expect(result.name).toBe("app");
    expect(result.confident).toBe(false);
  });

  it("skips malformed package.json and tries the next manifest", async () => {
    mockFiles({
      "package.json": "{ not json",
      "pyproject.toml": '[project]\nname = "fallback-py"',
    });
    const result = await deriveProjectName("/repo");
    expect(result).toEqual({ name: "fallback-py", source: "pyproject.toml", confident: true });
  });
});
