/**
 * `bun run gen:schemas` (AISE-003) — CLI entry for JSON Schema generation.
 *
 * Writes the deterministic schema set (see `scripts/lib/generate.ts`) into
 * `packages/shared-contracts/schemas/`. Regeneration on a clean tree must
 * produce a zero-byte diff; the byte-stability is additionally enforced by
 * a bun test. Committed schemas are consumed by the Android client without
 * any TypeScript dependency.
 *
 * Uses `process.stdout.write` (not console.*) per the repo lint policy for
 * `packages/` code.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { generateSchemaFiles } from "./lib/generate";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

function main(): number {
  const files = generateSchemaFiles();
  for (const file of files) {
    const target = join(PACKAGE_ROOT, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, "utf8");
  }
  process.stdout.write(`wrote ${files.length} schema files under schemas/ (${files.length - 1} objects + manifest)\n`);
  return 0;
}

process.exit(main());
