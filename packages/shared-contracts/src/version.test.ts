/**
 * Version-map consistency and semver compatibility tests (AISE-003).
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTRACT_FAMILIES,
  CONTRACT_VERSION,
  FAMILY_VERSIONS,
  familyVersion,
  parseMajorVersion,
  sameMajorVersion,
} from "./contracts.version";

describe("version map", () => {
  test("package version equals CONTRACT_VERSION (package version IS contract version)", () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
    ) as { version: string };
    expect(pkg.version).toBe(CONTRACT_VERSION);
  });

  test("FAMILY_VERSIONS covers exactly the contract families", () => {
    expect([...Object.keys(FAMILY_VERSIONS)].sort()).toEqual([...CONTRACT_FAMILIES].sort());
  });

  test("every family ships the program-wide contract version", () => {
    for (const family of CONTRACT_FAMILIES) {
      expect(FAMILY_VERSIONS[family]).toBe(CONTRACT_VERSION);
      expect(familyVersion(family)).toBe(CONTRACT_VERSION);
    }
  });

  test("CONTRACT_VERSION is strict semver", () => {
    expect(parseMajorVersion(CONTRACT_VERSION)).toBe(1);
    expect(CONTRACT_VERSION).toBe("1.0.0");
  });
});

describe("parseMajorVersion", () => {
  test("parses valid strict semver majors", () => {
    expect(parseMajorVersion("1.0.0")).toBe(1);
    expect(parseMajorVersion("0.9.0")).toBe(0);
    expect(parseMajorVersion("2.0.0")).toBe(2);
    expect(parseMajorVersion("10.20.30")).toBe(10);
    expect(parseMajorVersion("1.2.3-rc.1")).toBe(1);
    expect(parseMajorVersion("1.2.3+build.5")).toBe(1);
    expect(parseMajorVersion("1.2.3-rc.1+build.5")).toBe(1);
  });

  test("rejects malformed versions", () => {
    expect(parseMajorVersion("1.2")).toBeNull();
    expect(parseMajorVersion("1")).toBeNull();
    expect(parseMajorVersion("")).toBeNull();
    expect(parseMajorVersion("v1.2.3")).toBeNull();
    expect(parseMajorVersion("01.2.3")).toBeNull();
    expect(parseMajorVersion("1.x.3")).toBeNull();
    expect(parseMajorVersion("not-a-version")).toBeNull();
  });
});

describe("sameMajorVersion", () => {
  test("same major is compatible, regardless of minor/patch/prerelease", () => {
    expect(sameMajorVersion("1.0.0", "1.0.0")).toBe(true);
    expect(sameMajorVersion("1.4.2", "1.0.0")).toBe(true);
    expect(sameMajorVersion("1.0.0", "1.1.0")).toBe(true);
    expect(sameMajorVersion("1.9.9-rc.1", "1.0.0")).toBe(true);
  });

  test("different majors are incompatible", () => {
    expect(sameMajorVersion("0.9.0", "1.0.0")).toBe(false);
    expect(sameMajorVersion("2.0.0", "1.0.0")).toBe(false);
    expect(sameMajorVersion("1.0.0", "2.0.0")).toBe(false);
    expect(sameMajorVersion("1.0.0", "0.9.0")).toBe(false);
  });

  test("malformed versions are never compatible", () => {
    expect(sameMajorVersion("garbage", "1.0.0")).toBe(false);
    expect(sameMajorVersion("1.0.0", "")).toBe(false);
    expect(sameMajorVersion("1.2", "1.2")).toBe(false);
  });
});
