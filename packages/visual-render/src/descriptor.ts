/**
 * HFX-303 — the visual-provider DESCRIPTOR.
 *
 * The bounded visual-solution provider lane's declaration of ONE
 * visual-generation provider: who it is (providerId + technologyVersion),
 * how it presents (the presentation-style declaration), what it renders
 * (the capability declaration over the closed visual-class vocabulary),
 * what it CANNOT do (declared limitations), and the lane's governing
 * tolerance-free rule — VISUALS CARRY NO NUMERIC CLAIMS (the numeric-claim
 * policy is sealed into the descriptor; a provider that emits numeric text
 * declares it illustrative-only, never an engineering claim).
 *
 * The shape MIRRORS `@aise/provider-registry`'s `ProviderProfile`
 * discipline (HFX-000 — imported, never modified): a typed seal
 * (`kind` + `schemaVersion`), closed vocabularies, presentation-only
 * fields EXCLUDED from the content digest, failure modes drawn from the
 * control plane's CLOSED failure vocabulary, and a pure validator that
 * collects typed failures instead of throwing. The full control-plane
 * registration profile of each lane provider lives in `profiles.ts`
 * (the fifteen mandatory fields); the descriptor is the LANE's own view.
 *
 * PURE DETERMINISTIC DECLARED DATA: no network, no clock, no randomness.
 * Identical declarations digest identically (`descriptorDigestOf`).
 */

import { isFailureKind, type FailureKind } from "@aise/provider-registry";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { createHash } from "node:crypto";

export const VISUAL_PROVIDER_DESCRIPTOR_KIND = "visual-provider-descriptor" as const;
export const VISUAL_DESCRIPTOR_SCHEMA_VERSION = "visual-provider-descriptor/1" as const;

/* ------------------------------------------------------------------ */
/* Closed vocabularies                                                 */
/* ------------------------------------------------------------------ */

/**
 * The closed visual-class vocabulary — what a bounded visual provider may
 * render. The work order's classes (elevation hypothesis, material study,
 * context sketch) as machine-checkable reference data.
 */
export const VISUAL_CLASSES = Object.freeze([
  "elevation-hypothesis",
  "material-study",
  "context-sketch",
] as const);
export type VisualClass = (typeof VISUAL_CLASSES)[number];

/**
 * The closed numeric-claim policy. The lane is TOLERANCE-FREE: a visual
 * carries NO numeric engineering claims; any numeric text a provider emits
 * is declared illustrative-only. There is exactly one lawful value — the
 * vocabulary exists so the policy is sealed, machine-checkable data.
 */
export const NUMERIC_CLAIM_POLICIES = Object.freeze([
  "illustrative-only" as const,
] as const);
export type NumericClaimPolicy = (typeof NUMERIC_CLAIM_POLICIES)[number];

/** Type guard: is this unknown value one of the closed visual classes? */
export function isVisualClass(value: unknown): value is VisualClass {
  return (
    typeof value === "string" &&
    (VISUAL_CLASSES as readonly string[]).includes(value)
  );
}

/** 64 lowercase hex characters — the shape of every digest in this lane. */
export const VISUAL_DIGEST_PATTERN = /^[0-9a-f]{64}$/;

/** Type guard: is this string a 64-lowercase-hex digest? */
export function isVisualDigest(value: unknown): value is string {
  return typeof value === "string" && VISUAL_DIGEST_PATTERN.test(value);
}

/* ------------------------------------------------------------------ */
/* The descriptor                                                       */
/* ------------------------------------------------------------------ */

/** The declared presentation style of one visual provider. */
export interface PresentationStyleDeclaration {
  /** A short stable style name (e.g. "light hypothesis study"). */
  readonly name: string;
  /** How the style presents — the human statement (presentation only). */
  readonly statement: string;
}

/** One declared failure mode — the kind MUST come from the closed vocabulary. */
export interface VisualFailureModeDeclaration {
  readonly kind: FailureKind;
  readonly condition: string;
  readonly behavior: string;
}

/**
 * The visual-provider descriptor. `displayName` and `description` are
 * PRESENTATION-ONLY and EXCLUDED from the content digest (renaming a
 * provider is not a semantic change — the house identity discipline).
 */
export interface VisualProviderDescriptor {
  readonly kind: typeof VISUAL_PROVIDER_DESCRIPTOR_KIND;
  readonly schemaVersion: typeof VISUAL_DESCRIPTOR_SCHEMA_VERSION;
  readonly providerId: string;
  readonly technologyVersion: string;
  /** Presentation only — excluded from the descriptor digest. */
  readonly displayName: string;
  /** Presentation only — excluded from the descriptor digest. */
  readonly description: string;
  readonly presentationStyle: PresentationStyleDeclaration;
  /** Which visual classes this provider renders (non-empty, closed vocabulary). */
  readonly capabilities: readonly VisualClass[];
  /** What the provider cannot do — at least one declared limitation is required. */
  readonly declaredLimitations: readonly string[];
  /** Tolerance-free rule, sealed: visuals carry no numeric engineering claims. */
  readonly numericClaimPolicy: NumericClaimPolicy;
  /** Failure modes from the control plane's CLOSED vocabulary only. */
  readonly failureModes: readonly VisualFailureModeDeclaration[];
  /** The lane statement this descriptor subscribes to (verbatim constant). */
  readonly laneStatement: string;
}

/** The lane's binding statement — carried verbatim by every descriptor. */
export const VISUAL_LANE_STATEMENT =
  "presentation-only hypothesis rendering — a generated visual is never engineering geometry authority and can never change quantities, validation or canonical Solution Graph state" as const;

/* ------------------------------------------------------------------ */
/* Typed validation failures                                           */
/* ------------------------------------------------------------------ */

export const DESCRIPTOR_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "type-mismatch",
  "value-out-of-range",
  "empty-list",
  "vocabulary-violation",
] as const;
export type DescriptorValidationFailureKind =
  (typeof DESCRIPTOR_VALIDATION_FAILURE_KINDS)[number];

export interface DescriptorValidationFailure {
  readonly kind: DescriptorValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type VisualDescriptorValidation =
  | { readonly ok: true; readonly descriptor: VisualProviderDescriptor; readonly descriptorDigest: string }
  | { readonly ok: false; readonly failures: readonly DescriptorValidationFailure[] };

/* ------------------------------------------------------------------ */
/* The pure validator                                                  */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates an unknown payload as a `VisualProviderDescriptor`. PURE:
 * collects every typed failure (never throws, never early-exits except
 * for a non-object payload) and on success returns the typed descriptor
 * plus its deterministic content digest.
 */
export function validateVisualProviderDescriptor(
  input: unknown,
): VisualDescriptorValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        {
          kind: "not-an-object",
          path: "",
          detail: "a visual-provider descriptor must be a JSON object",
        },
      ],
    };
  }

  const failures: DescriptorValidationFailure[] = [];
  const fail = (
    kind: DescriptorValidationFailureKind,
    path: string,
    detail: string,
  ): void => {
    failures.push({ kind, path, detail });
  };

  if (input["kind"] !== VISUAL_PROVIDER_DESCRIPTOR_KIND) {
    fail("type-mismatch", "kind", `expected the typed seal '${VISUAL_PROVIDER_DESCRIPTOR_KIND}'`);
  }
  if (input["schemaVersion"] !== VISUAL_DESCRIPTOR_SCHEMA_VERSION) {
    fail(
      "type-mismatch",
      "schemaVersion",
      `expected the schema version '${VISUAL_DESCRIPTOR_SCHEMA_VERSION}'`,
    );
  }
  for (const field of ["providerId", "technologyVersion", "displayName", "description"] as const) {
    if (!isNonEmptyString(input[field])) {
      fail("type-mismatch", field, "expected a non-empty string");
    } else if ((input[field] as string).length > 4096) {
      fail("value-out-of-range", field, "string longer than 4096 characters");
    }
  }

  const style = input["presentationStyle"];
  if (isRecord(style)) {
    for (const field of ["name", "statement"] as const) {
      if (!isNonEmptyString(style[field])) {
        fail("type-mismatch", `presentationStyle.${field}`, "expected a non-empty string");
      }
    }
  } else {
    fail("type-mismatch", "presentationStyle", "expected the presentation style declaration object");
  }

  const capabilities = input["capabilities"];
  if (Array.isArray(capabilities)) {
    if (capabilities.length === 0) {
      fail("empty-list", "capabilities", "a visual provider must declare at least one visual class");
    }
    for (const [index, entry] of (capabilities as unknown[]).entries()) {
      if (!isVisualClass(entry)) {
        fail(
          "vocabulary-violation",
          `capabilities[${index}]`,
          `'${String(entry)}' is not in the CLOSED visual-class vocabulary — a visual provider cannot invent visual classes`,
        );
      }
    }
  } else {
    fail("type-mismatch", "capabilities", "expected an array of visual classes");
  }

  const limitations = input["declaredLimitations"];
  if (Array.isArray(limitations)) {
    if (limitations.length === 0) {
      fail(
        "empty-list",
        "declaredLimitations",
        "at least one declared limitation is required — a visual provider must state what it cannot do",
      );
    }
    for (const [index, entry] of (limitations as unknown[]).entries()) {
      if (!isNonEmptyString(entry) || entry.length > 2048) {
        fail(
          "type-mismatch",
          `declaredLimitations[${index}]`,
          "expected a non-empty limitation string (max 2048)",
        );
      }
    }
  } else {
    fail("type-mismatch", "declaredLimitations", "expected an array of declared limitations");
  }

  if (input["numericClaimPolicy"] !== "illustrative-only") {
    fail(
      "vocabulary-violation",
      "numericClaimPolicy",
      `expected 'illustrative-only' — the lane is tolerance-free: visuals carry NO numeric engineering claims`,
    );
  }

  const failureModes = input["failureModes"];
  if (Array.isArray(failureModes)) {
    if (failureModes.length === 0) {
      fail("empty-list", "failureModes", "at least one declared failure mode is required");
    }
    for (const [index, entry] of (failureModes as unknown[]).entries()) {
      const modePath = `failureModes[${index}]`;
      if (isRecord(entry)) {
        if (!isFailureKind(entry["kind"])) {
          fail(
            "vocabulary-violation",
            `${modePath}.kind`,
            `'${String(entry["kind"])}' is not in the CLOSED provider failure vocabulary — descriptors cannot invent failure kinds`,
          );
        }
        if (!isNonEmptyString(entry["condition"])) {
          fail("type-mismatch", `${modePath}.condition`, "expected a non-empty condition string");
        }
        if (!isNonEmptyString(entry["behavior"])) {
          fail("type-mismatch", `${modePath}.behavior`, "expected a non-empty behavior string");
        }
      } else {
        fail("type-mismatch", modePath, "expected a failure mode declaration object");
      }
    }
  } else {
    fail("type-mismatch", "failureModes", "expected an array of failure mode declarations");
  }

  if (input["laneStatement"] !== VISUAL_LANE_STATEMENT) {
    fail(
      "vocabulary-violation",
      "laneStatement",
      "the descriptor must carry the lane's binding statement VERBATIM (a visual provider cannot weaken the lane law)",
    );
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  const descriptor = input as unknown as VisualProviderDescriptor;
  return { ok: true, descriptor, descriptorDigest: descriptorDigestOf(descriptor) };
}

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

/**
 * The semantic projection hashed into a descriptor's digest: every
 * evaluation-relevant field. EXCLUDED: `displayName`/`description`
 * (presentation — renaming is not a semantic change) and the
 * `schemaVersion` seal (a same-schema bump must not re-address history).
 */
export function descriptorDigestOf(descriptor: VisualProviderDescriptor): string {
  return createHash("sha256")
    .update(
      canonicalJsonStringify({
        kind: VISUAL_PROVIDER_DESCRIPTOR_KIND,
        providerId: descriptor.providerId,
        technologyVersion: descriptor.technologyVersion,
        presentationStyle: descriptor.presentationStyle,
        capabilities: [...descriptor.capabilities],
        declaredLimitations: [...descriptor.declaredLimitations],
        numericClaimPolicy: descriptor.numericClaimPolicy,
        failureModes: descriptor.failureModes,
        laneStatement: descriptor.laneStatement,
      }),
      "utf8",
    )
    .digest("hex");
}

/** Structural seal check (fast path guard; full checking is the validator). */
export function isVisualProviderDescriptor(input: unknown): input is VisualProviderDescriptor {
  return (
    isRecord(input) &&
    input["kind"] === VISUAL_PROVIDER_DESCRIPTOR_KIND &&
    input["schemaVersion"] === VISUAL_DESCRIPTOR_SCHEMA_VERSION &&
    isNonEmptyString(input["providerId"]) &&
    isNonEmptyString(input["technologyVersion"])
  );
}
