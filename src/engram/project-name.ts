/**
 * Engram project name derivation.
 * Prefers the project's own manifest (per language/framework) over the
 * directory basename, and flags low-confidence results so interactive
 * mode can ask the user to confirm or correct the name.
 */

import fs from "fs/promises";
import path from "path";

export interface DerivedProjectName {
  name: string;
  /** Where the name came from (e.g. "package.json", "directory name") */
  source: string;
  /** False when the caller should confirm the name with the user */
  confident: boolean;
}

/** Names too generic to identify a project. */
const GENERIC_NAMES = new Set(["app", "src", "main", "project", "repo", "code", "test", "demo"]);

async function readFileOrNull(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    return null;
  }
}

function sanitize(name: string): string {
  // Strip npm scope ("@org/pkg" -> "pkg") and normalize separators
  const unscoped = name.startsWith("@") ? name.split("/").pop() ?? name : name;
  return unscoped.trim();
}

type Extractor = { file: string; extract: (content: string) => string | null };

const EXTRACTORS: Extractor[] = [
  {
    file: "package.json",
    extract: (content) => {
      try {
        const pkg = JSON.parse(content) as { name?: string };
        return pkg.name ?? null;
      } catch {
        return null;
      }
    },
  },
  {
    file: "pyproject.toml",
    extract: (content) =>
      content.match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1] ?? null,
  },
  {
    file: "Cargo.toml",
    extract: (content) =>
      content.match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1] ?? null,
  },
  {
    file: "go.mod",
    extract: (content) => {
      const module = content.match(/^module\s+(\S+)/m)?.[1];
      return module ? module.split("/").pop() ?? null : null;
    },
  },
  {
    file: "composer.json",
    extract: (content) => {
      try {
        const pkg = JSON.parse(content) as { name?: string };
        // composer names are "vendor/package"
        return pkg.name?.split("/").pop() ?? null;
      } catch {
        return null;
      }
    },
  },
  {
    file: "pom.xml",
    extract: (content) => content.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1] ?? null,
  },
  {
    file: "settings.gradle",
    extract: (content) =>
      content.match(/rootProject\.name\s*=\s*["']([^"']+)["']/)?.[1] ?? null,
  },
  {
    file: "settings.gradle.kts",
    extract: (content) =>
      content.match(/rootProject\.name\s*=\s*["']([^"']+)["']/)?.[1] ?? null,
  },
];

/**
 * Derive the engram project name from the repository's manifest files,
 * falling back to the directory basename when nothing better exists.
 */
export async function deriveProjectName(rootPath: string): Promise<DerivedProjectName> {
  for (const { file, extract } of EXTRACTORS) {
    const content = await readFileOrNull(path.join(rootPath, file));
    if (!content) continue;
    const raw = extract(content);
    if (!raw) continue;
    const name = sanitize(raw);
    if (!name) continue;
    return {
      name,
      source: file,
      confident: !GENERIC_NAMES.has(name.toLowerCase()),
    };
  }

  const basename = path.basename(path.resolve(rootPath));
  return {
    name: basename,
    source: "directory name",
    confident: false,
  };
}
