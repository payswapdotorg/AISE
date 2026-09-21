/**
 * PROD-025 — source-vs-generated BOQ distinction + the no-write-path
 * sabotage suite (PACKAGE level).
 *
 * Proves:
 *  - the typed seal: a generated BOQ carries the literal
 *    `artifactKind: "solution-generated-boq"`; the type guard accepts it
 *    and rejects source-BOQ-shaped records and arbitrary objects;
 *  - `SourceBoqReference` is IDENTITY-ONLY: kind + importId + mediaType +
 *    byteSize — no writable handle, no document payload, no store
 *    reference (Object.freeze discipline);
 *  - NO WRITE PATH EXISTS: a lexical scan of the package's CORE sources
 *    proves there is no filesystem-write primitive, no network primitive,
 *    no clock read and no randomness anywhere in the derivation (the
 *    engine's zero-network-source guarantee discipline); the only
 *    fs-touching file is the test-only testkit (read-only fixture loads);
 *  - a generated BOQ referencing a source BOQ embeds ONLY its identity —
 *    the source document's content is structurally absent from the
 *    generated BOQ's canonical bytes (the backend-level non-overwrite
 *    sabotage lives in backend/api/src/solution-boq/).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  deriveSolutionBoq,
  isSolutionGeneratedBoq,
} from "./index";
import type { SourceBoqReference } from "./index";
import { wallUpgradeWorld } from "./testkit";

describe("the typed source-vs-generated seal", () => {
  const world = wallUpgradeWorld();
  const boq = deriveSolutionBoq({ version: world.version, snapshot: world.snapshot });

  test("a generated BOQ passes the type guard", () => {
    expect(isSolutionGeneratedBoq(boq)).toBe(true);
    expect(boq.artifactKind).toBe("solution-generated-boq");
    expect(boq.epistemicClass).toBe("PROPOSED");
  });

  test("a source-BOQ-shaped record is NEVER a solution-generated BOQ", () => {
    // the BOQ Lens source record shape (backend/api/src/boq/model.ts):
    const sourceRecord = {
      importId: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      source: {
        contentId: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 4096,
      },
      format: "xlsx",
      parse: { status: "parsed" },
    };
    expect(isSolutionGeneratedBoq(sourceRecord)).toBe(false);
    expect(isSolutionGeneratedBoq(null)).toBe(false);
    expect(isSolutionGeneratedBoq({ artifactKind: "source-boq" })).toBe(false);
    expect(isSolutionGeneratedBoq({ artifactKind: "solution-generated-boq" })).toBe(false);
  });

  test("SourceBoqReference is identity-only (no writable handle, no payload)", () => {
    const reference: SourceBoqReference = {
      kind: "source-boq-reference",
      importId: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      mediaType: "application/vnd.ms-excel",
      byteSize: 2048,
    };
    expect(Object.keys(reference).sort()).toEqual(["byteSize", "importId", "kind", "mediaType"]);
    // the field inventory contains no document payload and no store handle
    const text = JSON.stringify(reference);
    expect(text.includes("sheets")).toBe(false);
    expect(text.includes("rows")).toBe(false);
    expect(text.includes("store")).toBe(false);
    expect(text.includes("write")).toBe(false);
  });

  test("a generated BOQ references the source by identity ONLY — the document content is absent", () => {
    const withSource = deriveSolutionBoq({
      version: world.version,
      snapshot: world.snapshot,
      sourceBoqRef: {
        kind: "source-boq-reference",
        importId: "aaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccdddd",
        mediaType: "application/vnd.ms-excel",
        byteSize: 1234,
      },
    });
    expect(withSource.sourceBoqRef?.importId).toBe(
      "aaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccdddd",
    );
    const text = canonicalJsonStringify(withSource);
    expect(text.includes("aaaabbbb")).toBe(true); // the identity IS referenced
    // the source DOCUMENT model never appears: no sheets, rows, cells, parse
    expect(text.includes('"sheets"')).toBe(false);
    expect(text.includes('"rows"')).toBe(false);
    expect(text.includes('"cells"')).toBe(false);
    expect(text.includes('"parse"')).toBe(false);
  });

  test("generating with vs without a source reference changes the boqId (the reference is identity-relevant)", () => {
    const withoutSource = deriveSolutionBoq({
      version: world.version,
      snapshot: world.snapshot,
    });
    const withSource = deriveSolutionBoq({
      version: world.version,
      snapshot: world.snapshot,
      sourceBoqRef: {
        kind: "source-boq-reference",
        importId: "aaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccdddd",
        mediaType: "application/vnd.ms-excel",
        byteSize: 1234,
      },
    });
    expect(withSource.boqId).not.toBe(withoutSource.boqId);
  });
});

describe("no write path: the core sources carry no I/O, network, clock or randomness", () => {
  const SRC = join(import.meta.dir);
  const CORE_FILES = [
    "boq-version.ts",
    "errors.ts",
    "sections.ts",
    "elements.ts",
    "identity.ts",
    "model.ts",
    "assumptions.ts",
    "derive.ts",
    "navigate.ts",
    "delta.ts",
    "verify.ts",
    "index.ts",
  ];
  const FORBIDDEN_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
    { pattern: /writeFile|appendFile|rmSync|unlinkSync|mkdirSync|rmdirSync|cpSync/, label: "filesystem write primitive" },
    { pattern: /\bfetch\s*\(|https?:\/\/|\bsocket\b|XMLHttpRequest|"node:http"|"node:https"|"node:net"|"node:dgram"/, label: "network primitive" },
    { pattern: /Date\.now|new Date\(/, label: "clock read" },
    { pattern: /Math\.random|crypto\.random/, label: "randomness" },
    { pattern: /process\.env/, label: "environment read" },
  ];

  test("every core module is free of forbidden primitives", () => {
    for (const file of CORE_FILES) {
      const source = readFileSync(join(SRC, file), "utf8");
      for (const { pattern } of FORBIDDEN_PATTERNS) {
        expect(pattern.test(source)).toBe(false);
      }
    }
  });

  test("the only fs-touching source file is the TEST-ONLY testkit (reads, never writes)", () => {
    const files = readdirSync(SRC).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
    const fsTouching = files.filter(
      (name) => name !== "testkit.ts" && /from "node:fs"/.test(readFileSync(join(SRC, name), "utf8")),
    );
    expect(fsTouching).toEqual([]);
    const testkit = readFileSync(join(SRC, "testkit.ts"), "utf8");
    expect(testkit.includes('from "node:fs"')).toBe(true); // readFileSync only
    expect(/writeFile|appendFile|rmSync|unlinkSync/.test(testkit)).toBe(false);
  });
});
