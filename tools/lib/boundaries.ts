/**
 * Workspace boundary rules for the AISE monorepo (AISE-001).
 *
 * The gate enforces a deterministic import-zone matrix so that backend, web,
 * packages and tooling cannot silently grow into each other:
 *
 *   source zone   allowed relative-import target zones
 *   -----------   -------------------------------------
 *   apps          apps, packages
 *   backend       backend, packages
 *   packages      packages
 *   tools         tools
 *   root          (none — root config files must not import workspace source)
 *
 * Bare specifiers (npm packages, node: builtins, bun:test) are unrestricted.
 * Relative imports that escape the repository root are violations.
 *
 * Limitations (intentional): the scanner uses lexical import extraction, not a
 * full parser, and does not follow tsconfig path aliases. It is a tripwire, not
 * a compiler — typecheck and review remain authoritative.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";

export type Zone = "apps" | "backend" | "packages" | "tools" | "root";

export interface SourceFile {
  /** Repo-relative POSIX path. */
  path: string;
  /** Extracted import specifiers (sorted, deduplicated). */
  imports: string[];
}

export interface BoundaryViolation {
  file: string;
  specifier: string;
  sourceZone: Zone;
  targetZone: Zone | "outside";
  reason: string;
}

const ZONES: readonly Zone[] = ["apps", "backend", "packages", "tools"];

const ALLOWED_TARGETS: Record<Zone, readonly Zone[]> = {
  apps: ["apps", "packages"],
  backend: ["backend", "packages"],
  packages: ["packages"],
  tools: ["tools"],
  root: [],
};

const SCANNED_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"];

const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", ".cache"]);

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export function zoneOf(repoRelativePath: string): Zone {
  const first = repoRelativePath.split("/")[0] ?? "";
  return (ZONES as readonly string[]).includes(first) ? (first as Zone) : "root";
}

/** Lexically extract import specifiers from TypeScript/JavaScript source. */
export function parseImports(code: string): string[] {
  const found = new Set<string>();
  const patterns: RegExp[] = [
    /(?:^|[;{}\s)])import\s+[^;()'"]*?from\s*["']([^"']+)["']/g,
    /(?:^|[;{}\s)])export\s+[^;()'"]*?from\s*["']([^"']+)["']/g,
    /(?:^|[;{}\s)])import\s*["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) {
      const specifier = match[1];
      if (specifier !== undefined) {
        found.add(specifier);
      }
    }
  }
  return [...found].sort();
}

/** Evaluate the zone matrix over parsed source files (pure, deterministic). */
export function evaluateBoundaries(files: readonly SourceFile[]): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of ordered) {
    const sourceZone = zoneOf(file.path);
    for (const specifier of file.imports) {
      if (!specifier.startsWith(".")) {
        continue; // bare specifier: npm package, node: builtin or bun:test
      }
      const target = toPosix(normalize(join(dirname(file.path), specifier)));
      if (target.startsWith("../") || target === "..") {
        violations.push({
          file: file.path,
          specifier,
          sourceZone,
          targetZone: "outside",
          reason: "relative import escapes the repository root",
        });
        continue;
      }
      const targetZone = zoneOf(target);
      if (!ALLOWED_TARGETS[sourceZone].includes(targetZone)) {
        violations.push({
          file: file.path,
          specifier,
          sourceZone,
          targetZone,
          reason: `${sourceZone} -> ${targetZone} imports are not allowed by the workspace boundary rules`,
        });
      }
    }
  }
  return violations;
}

/** Scan the repository tree for TypeScript/JavaScript files and their imports. */
export function scanTree(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          walk(full);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        continue;
      }
      const path = toPosix(relative(root, full));
      files.push({ path, imports: parseImports(readFileSync(full, "utf8")) });
    }
  };
  walk(root);
  return files;
}
