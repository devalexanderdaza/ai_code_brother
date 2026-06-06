/**
 * Scanner - The Eye of AI Code Brother
 * Enumerates repository structure, detects language/framework, finds config files.
 */

import fs from "fs/promises";
import path from "path";
import { glob } from "glob";

export interface ScanResult {
  rootPath: string;
  files: FileInfo[];
  language: string;
  framework: string | null;
  configFiles: string[];
  testFiles: string[];
  sourceDirectories: string[];
}

export interface FileInfo {
  path: string;
  relativePath: string;
  extension: string;
  size: number;
  isTest: boolean;
  isConfig: boolean;
}

// Files/dirs to always ignore
const IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/.venv/**",
  "**/venv/**",
  "**/.env",
  "**/*.lock",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
];

// Config file patterns
const CONFIG_PATTERNS = [
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "setup.py",
  "go.mod",
  "Cargo.toml",
  ".eslintrc*",
  ".prettierrc*",
  "docker-compose*.yml",
  "Dockerfile",
  ".github/workflows/*.yml",
];

// Test file patterns
const TEST_PATTERNS = [
  "**/*.test.ts",
  "**/*.test.js",
  "**/*.spec.ts",
  "**/*.spec.js",
  "**/test_*.py",
  "**/*_test.py",
  "**/*_test.go",
];

export class Scanner {
  private rootPath: string;
  private verbose: boolean;

  constructor(rootPath: string, verbose = false) {
    this.rootPath = rootPath;
    this.verbose = verbose;
  }

  async scan(): Promise<ScanResult> {
    // Find all files
    const allFiles = await glob("**/*", {
      cwd: this.rootPath,
      nodir: true,
      ignore: IGNORE_PATTERNS,
      absolute: false,
    });

    // Build file info
    const files: FileInfo[] = [];
    for (const relativePath of allFiles) {
      const fullPath = path.join(this.rootPath, relativePath);
      try {
        const stat = await fs.stat(fullPath);
        files.push({
          path: fullPath,
          relativePath,
          extension: path.extname(relativePath),
          size: stat.size,
          isTest: this.isTestFile(relativePath),
          isConfig: this.isConfigFile(relativePath),
        });
      } catch {
        // Skip files we can't stat
      }
    }

    // Detect language
    const language = this.detectLanguage(files);

    // Detect framework
    const framework = await this.detectFramework(files);

    // Find config files
    const configFiles = files.filter((f) => f.isConfig).map((f) => f.relativePath);

    // Find test files
    const testFiles = files.filter((f) => f.isTest).map((f) => f.relativePath);

    // Find source directories
    const sourceDirectories = this.detectSourceDirectories(files);

    return {
      rootPath: this.rootPath,
      files,
      language,
      framework,
      configFiles,
      testFiles,
      sourceDirectories,
    };
  }

  private detectLanguage(files: FileInfo[]): string {
    const extCounts: Record<string, number> = {};

    for (const file of files) {
      if (file.extension) {
        extCounts[file.extension] = (extCounts[file.extension] || 0) + 1;
      }
    }

    // Priority mapping
    const languageMap: Record<string, string> = {
      ".ts": "TypeScript",
      ".tsx": "TypeScript",
      ".js": "JavaScript",
      ".jsx": "JavaScript",
      ".py": "Python",
      ".go": "Go",
      ".rs": "Rust",
      ".java": "Java",
      ".cs": "C#",
      ".rb": "Ruby",
      ".php": "PHP",
    };

    // Find most common language
    let maxCount = 0;
    let detectedLang = "Unknown";

    for (const [ext, lang] of Object.entries(languageMap)) {
      if (extCounts[ext] && extCounts[ext] > maxCount) {
        maxCount = extCounts[ext];
        detectedLang = lang;
      }
    }

    // Check for TypeScript config to override JS detection
    if (detectedLang === "JavaScript" && files.some((f) => f.relativePath.includes("tsconfig"))) {
      detectedLang = "TypeScript";
    }

    return detectedLang;
  }

  private async detectFramework(files: FileInfo[]): Promise<string | null> {
    const fileSet = new Set(files.map((f) => f.relativePath));
    const hasFile = (name: string) => fileSet.has(name);

    // Check package.json for dependencies
    if (hasFile("package.json")) {
      try {
        const content = await fs.readFile(path.join(this.rootPath, "package.json"), "utf-8");
        const pkg = JSON.parse(content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps["next"]) return "Next.js";
        if (deps["react"]) return "React";
        if (deps["vue"]) return "Vue";
        if (deps["@angular/core"]) return "Angular";
        if (deps["express"]) return "Express.js";
        if (deps["fastify"]) return "Fastify";
        if (deps["nestjs"]) return "NestJS";
      } catch {
        // Ignore parse errors
      }
    }

    // Python frameworks
    if (hasFile("pyproject.toml") || hasFile("requirements.txt")) {
      const reqPath = hasFile("requirements.txt")
        ? path.join(this.rootPath, "requirements.txt")
        : null;
      if (reqPath) {
        try {
          const content = await fs.readFile(reqPath, "utf-8");
          if (content.includes("django")) return "Django";
          if (content.includes("flask")) return "Flask";
          if (content.includes("fastapi")) return "FastAPI";
        } catch {
          // Ignore
        }
      }
    }

    // Go frameworks
    if (hasFile("go.mod")) {
      try {
        const content = await fs.readFile(path.join(this.rootPath, "go.mod"), "utf-8");
        if (content.includes("gin-gonic")) return "Gin";
        if (content.includes("echo")) return "Echo";
        if (content.includes("fiber")) return "Fiber";
      } catch {
        // Ignore
      }
    }

    return null;
  }

  private isTestFile(relativePath: string): boolean {
    const lower = relativePath.toLowerCase();
    // Normalize path separators for cross-platform compatibility  
    const normalized = lower.replace(/\\/g, "/");
    return (
      normalized.includes(".test.") ||
      normalized.includes(".spec.") ||
      normalized.includes("_test.") ||
      normalized.includes("test_") ||
      normalized.startsWith("tests/") ||
      normalized.startsWith("test/") ||
      normalized.startsWith("__tests__/")
    );
  }

  private isConfigFile(relativePath: string): boolean {
    const basename = path.basename(relativePath);
    return CONFIG_PATTERNS.some((pattern) => {
      if (pattern.includes("*")) {
        const regex = new RegExp(pattern.replace("*", ".*"));
        return regex.test(basename);
      }
      return basename === pattern || relativePath.includes(pattern.replace("*", ""));
    });
  }

  private detectSourceDirectories(files: FileInfo[]): string[] {
    const dirs = new Set<string>();
    const commonSrcDirs = ["src", "lib", "app", "pkg", "internal", "cmd"];

    for (const file of files) {
      if (file.isTest || file.isConfig) continue;

      const parts = file.relativePath.split(path.sep);
      if (parts.length > 1) {
        const firstDir = parts[0];
        if (commonSrcDirs.includes(firstDir)) {
          dirs.add(firstDir);
        }
      }
    }

    // If no common src dirs, find directories with most code files
    if (dirs.size === 0) {
      const dirCounts: Record<string, number> = {};
      for (const file of files) {
        const parts = file.relativePath.split(path.sep);
        if (parts.length > 1 && !file.isTest && !file.isConfig) {
          dirCounts[parts[0]] = (dirCounts[parts[0]] || 0) + 1;
        }
      }

      const sorted = Object.entries(dirCounts).sort((a, b) => b[1] - a[1]);
      for (const [dir] of sorted.slice(0, 3)) {
        dirs.add(dir);
      }
    }

    return Array.from(dirs);
  }
}
