/**
 * Compatibility and versioning tests. These encode the repository's
 * explicit cross-version behaviour (work-order acceptance criterion
 * 4: "Versioning and compatibility behavior are explicit"):
 *
 * - same-MAJOR newer-MINOR payloads are readable by older readers
 *   (ignore unknown fields; tolerate unknown enum values);
 * - writer-side schema validation stays strict (typos and breaking
 *   changes are caught);
 * - version negotiation uses CONTRACT_VERSION_UNSUPPORTED with the
 *   supported version list;
 * - retry decisions come from error data, not error code strings.
 */
import { describe, expect, it } from "vitest";
import type { CaptureIntent, Project, SyncError, UploadResult } from "./types.js";
import {
  isCompatibleReader,
  isContractVersionFormat,
  isSupportedContractVersion,
  majorOf,
} from "./versions.js";
import {
  readContractVersion,
  stripUnknownFields,
  syncRetryDecision,
  tolerateEnumValue,
  UNKNOWN_ENUM,
} from "./compat.js";
import { validateProject, validateSyncError, validateUploadResult } from "./validate.js";
import { loadFixtureJson } from "./io.js";

describe("version utilities", () => {
  it("1.0 is the implemented contract version", () => {
    expect(isSupportedContractVersion("1.0")).toBe(true);
    expect(isSupportedContractVersion("1.1")).toBe(false);
    expect(isSupportedContractVersion("2.0")).toBe(false);
  });

  it("version format is MAJOR.MINOR", () => {
    expect(isContractVersionFormat("1.0")).toBe(true);
    expect(isContractVersionFormat("12.34")).toBe(true);
    expect(isContractVersionFormat("1")).toBe(false);
    expect(isContractVersionFormat("v1.0")).toBe(false);
    expect(isContractVersionFormat("1.0.0")).toBe(false);
  });

  it("majorOf extracts the MAJOR component", () => {
    expect(majorOf("1.0")).toBe(1);
    expect(majorOf("2.13")).toBe(2);
  });

  it("readers accept same-MAJOR payloads and reject cross-MAJOR payloads", () => {
    expect(isCompatibleReader("1.0", "1.1")).toBe(true);
    expect(isCompatibleReader("1.0", "1.0")).toBe(true);
    expect(isCompatibleReader("1.0", "2.0")).toBe(false);
    expect(isCompatibleReader("2.1", "2.4")).toBe(true);
  });
});

describe("tolerant reading of newer-MINOR payloads (same MAJOR)", () => {
  const project = loadFixtureJson("project.full.json") as Record<string, unknown>;

  it("strict validation rejects unknown fields (writer discipline)", () => {
    // Schemas are writer-strict: a v1.0 writer may not emit fields
    // that v1.0 does not define, so typos and smuggling are caught.
    const newer = { ...project, siteCode: "WHB" };
    const outcome = validateProject(newer);
    expect(outcome.ok).toBe(false);
  });

  it("an older reader can read a newer-MINOR payload after dropping unknown fields", () => {
    // Simulate a v1.1 payload (adds optional field `siteCode`) being
    // consumed by a v1.0 reader: strip unknown fields, then strict
    // validation of the v1.0 subset succeeds.
    const newerMinor = { ...project, siteCode: "WHB", contractVersion: "1.1" };
    const v10Fields = [
      "contractVersion",
      "projectId",
      "name",
      "description",
      "createdAt",
      "updatedAt",
    ];
    const knownSubset = stripUnknownFields(newerMinor, v10Fields) as unknown as Project;
    const outcome = validateProject({ ...knownSubset, contractVersion: "1.0" });
    expect(outcome.errors).toEqual([]);
    expect(outcome.ok).toBe(true);
    expect(knownSubset.projectId).toBe(project["projectId"]);
  });

  it("readContractVersion supports dispatch before deep parsing", () => {
    expect(readContractVersion({ contractVersion: "1.1" })).toBe("1.1");
    expect(readContractVersion({})).toBeNull();
    expect(readContractVersion("not-an-object")).toBeNull();
    expect(readContractVersion({ contractVersion: 42 })).toBeNull();
  });

  it("unknown enum values map to the unknown sentinel, never to a member", () => {
    const intents: readonly CaptureIntent[] = ["AS_BUILT", "MAINTENANCE", "INSPECTION"];
    expect(tolerateEnumValue("AS_BUILT", intents)).toBe("AS_BUILT");
    // A future v1.1 "SPOT_CHECK" intent is readable by a v1.0 reader:
    expect(tolerateEnumValue("SPOT_CHECK", intents)).toBe(UNKNOWN_ENUM);
    expect(tolerateEnumValue("", intents)).toBe(UNKNOWN_ENUM);
  });
});

describe("breaking-change detection (why MAJOR exists)", () => {
  const project = loadFixtureJson("project.full.json") as Record<string, unknown>;

  it("a removed required field fails validation", () => {
    const removed = { ...project };
    delete removed["projectId"];
    expect(validateProject(removed).ok).toBe(false);
  });

  it("a changed field type fails validation", () => {
    expect(validateProject({ ...project, name: 42 }).ok).toBe(false);
  });

  it("a cross-MAJOR payload fails validation against v1.0 schemas", () => {
    expect(validateProject({ ...project, contractVersion: "2.0" }).ok).toBe(false);
  });
});

describe("version negotiation and error-data semantics", () => {
  it("CONTRACT_VERSION_UNSUPPORTED reports the supported versions", () => {
    const error = loadFixtureJson("sync-error.version-unsupported.json") as SyncError;
    expect(error.code).toBe("CONTRACT_VERSION_UNSUPPORTED");
    expect(error.retryable).toBe(false);
    expect(Array.isArray(error.details?.["supportedVersions"])).toBe(true);
    const supported = error.details?.["supportedVersions"] as string[];
    expect(supported).toContain("1.0");
  });

  it("retry decisions come from data fields, not from code strings", () => {
    const retryable = loadFixtureJson("sync-error.retryable.json") as SyncError;
    const fatal = loadFixtureJson("sync-error.fatal.json") as SyncError;
    expect(syncRetryDecision(retryable)).toBe("retry_after");
    expect(syncRetryDecision(fatal)).toBe("halt");
    // A hypothetical unknown code carrying retryable=true still
    // retries: behaviour is data-driven.
    const futureCode: Pick<SyncError, "retryable" | "retryAfterMs"> = {
      retryable: true,
      retryAfterMs: undefined,
    };
    expect(syncRetryDecision(futureCode)).toBe("retry_now");
  });

  it("idempotency conflict is a halt, not a retry", () => {
    const error = loadFixtureJson("sync-error.fatal.json") as SyncError;
    expect(error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(error.retryable).toBe(false);
  });

  it("a duplicate upload outcome is a success result, not an error", () => {
    // AC-012: interrupted synchronization resumes without
    // duplicating logical capture assets. A retried upload that the
    // server already received is acknowledged with a DUPLICATE
    // UploadResult — a valid success envelope that identifies the
    // original logical asset — and it is NOT a SyncError.
    const duplicate = loadFixtureJson("upload-result.duplicate.json") as UploadResult;
    const outcome = validateUploadResult(duplicate);
    expect(outcome.errors).toEqual([]);
    expect(outcome.ok).toBe(true);
    expect(duplicate).toMatchObject({
      outcome: "DUPLICATE",
      duplicateOf: expect.any(String),
    });
    // The success and error envelopes are disjoint contracts
    // (writer-strict, additionalProperties: false): a duplicate
    // acknowledgement must never validate as an error envelope.
    expect(validateSyncError(duplicate).ok).toBe(false);
  });
});
