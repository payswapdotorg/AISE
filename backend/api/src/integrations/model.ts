/**
 * AISE-037 — Universal incumbent integration/adapter layer: the MODEL.
 *
 * AUTHORITY DISCIPLINE (spec/architecture-lock.md "Authority" #8/#9 and
 * "Incumbent integration and adoption"; spec/requirements.md R14/R15):
 *
 *  - This module is the CONTRACT layer for connector-based integration with
 *    incumbent tools. It is a PURE LIBRARY: no router, no server wiring, no
 *    network I/O of any kind (connectors are injected ports — real adapters
 *    own their own I/O). HTTP wiring belongs to later work items, exactly as
 *    AISE-033 deliberately deferred wiring.
 *  - NO SILENT AUTHORITY TRANSFER (R14 acceptance: "export is derived; no
 *    exporter becomes canonical"): an IMPORT produces an EVIDENCE payload
 *    (with verbatim source-of-record identity) that downstream review may
 *    register through the evidence service; an EXPORT is a DERIVED projection
 *    stamped with the canonical snapshot version it derives from. There is NO
 *    code path from this module into the Reality Graph, BOQ Graph or case
 *    stores — the module does not even import them (tripwire-tested).
 *  - External construction systems of record remain authoritative for their
 *    own domains; AISE stores explicit references, mappings and synchronization
 *    provenance (architecture-lock #9). Source-of-record identity is preserved
 *    VERBATIM on every imported artifact: incumbent record ids are never
 *    re-keyed, merged or normalized here.
 *  - TENANT BOUNDARIES ARE SERVER-AUTHORITATIVE (R15 acceptance): tenant and
 *    project ids are OPAQUE string arguments. This module journals them
 *    verbatim and never authenticates, parses or interprets them.
 *  - EXPLICIT FAILURE STATES everywhere: the typed taxonomy below splits
 *    TRANSIENT (bounded, retryable) from PERMANENT (fail-fast) families; the
 *    taxonomy drives the sync engine's retry policy. Nothing is retried
 *    forever; nothing fails silently (every sync — including refusals — is
 *    journaled in the append-only ledger).
 *  - DETERMINISM: no wall clock and no randomness live here. Clocks are
 *    injected; sync ids are content-derived (sha-256 over canonical JSON);
 *    identical adapter behavior + identical clock + fresh ledger ⇒
 *    byte-identical journals.
 *
 * Frozen vocabularies (adding a value is a governed, versioned change):
 *
 *   SYSTEM_CLASSES         six incumbent system classes from the work order
 *   ADAPTER_CAPABILITIES   honest capability declaration (the 012 pattern)
 *   TRANSIENT_FAILURE_CODES / PERMANENT_FAILURE_CODES
 *                          the integration failure taxonomy (a partition)
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";

/* ------------------------------------------------------------------ */
/* System classes and capabilities (frozen vocabularies)                */
/* ------------------------------------------------------------------ */

/** The incumbent system classes AISE-037 must integrate (work order list). */
export const SYSTEM_CLASSES = [
  "bim-ifc",
  "cad-dxf",
  "boq-document",
  "project-management",
  "erp-procurement",
  "storage-document",
] as const;
Object.freeze(SYSTEM_CLASSES);

export type SystemClass = (typeof SYSTEM_CLASSES)[number];

/**
 * What an adapter honestly declares it can do. Descriptors declare a SUBSET;
 * the registry and the sync engine check the declaration before use (an
 * adapter that does not declare an operation's capability is refused —
 * CONTRACT_VIOLATION — before it runs).
 */
export const ADAPTER_CAPABILITIES = [
  "import-entities",
  "import-documents",
  "export-derived",
  "query-status",
] as const;
Object.freeze(ADAPTER_CAPABILITIES);

export type AdapterCapability = (typeof ADAPTER_CAPABILITIES)[number];

/**
 * One registered incumbent adapter's honest self-description (the AISE-012
 * provider-descriptor pattern: required fields participate in selection;
 * nothing here is interpreted beyond capability/class honesty).
 */
export interface AdapterDescriptor {
  /** Stable, unique adapter id (registry key). */
  readonly adapterId: string;
  readonly systemClass: SystemClass;
  readonly displayName: string;
  readonly capabilities: readonly AdapterCapability[];
  /** Adapter (contract) version — semver-shaped string, carried verbatim. */
  readonly version: string;
}

/* ------------------------------------------------------------------ */
/* Descriptor validation (total, deterministic)                         */
/* ------------------------------------------------------------------ */

export type AdapterDescriptorValidation =
  | { readonly ok: true; readonly descriptor: AdapterDescriptor }
  | { readonly ok: false; readonly issues: string[] };

const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * Structural + vocabulary validation of an adapter descriptor: non-empty ids,
 * known system class, class-appropriate capabilities (see
 * `CLASS_CAPABILITIES`), no duplicate capabilities, semver-shaped version.
 * Issues are deterministic (sorted where order is free).
 */
export function validateAdapterDescriptor(value: unknown): AdapterDescriptorValidation {
  const issues: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, issues: ["descriptor must be an object"] };
  }
  const record = value as Record<string, unknown>;

  const adapterId = record.adapterId;
  if (typeof adapterId !== "string" || adapterId.length === 0) {
    issues.push("adapterId must be a non-empty string");
  }

  const systemClass = record.systemClass;
  if (
    typeof systemClass !== "string" ||
    !(SYSTEM_CLASSES as readonly string[]).includes(systemClass)
  ) {
    issues.push(`systemClass must be one of: ${SYSTEM_CLASSES.join(", ")}`);
  }

  const displayName = record.displayName;
  if (typeof displayName !== "string" || displayName.length === 0) {
    issues.push("displayName must be a non-empty string");
  }

  const version = record.version;
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    issues.push("version must be a semver-shaped string (e.g. 1.0.0)");
  }

  const capabilities = record.capabilities;
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    issues.push("capabilities must be a non-empty array");
  } else {
    const seen = new Set<string>();
    for (const capability of capabilities) {
      if (
        typeof capability !== "string" ||
        !(ADAPTER_CAPABILITIES as readonly string[]).includes(capability)
      ) {
        issues.push(`unknown capability '${String(capability)}'`);
        break;
      }
      if (seen.has(capability)) {
        issues.push(`duplicate capability '${capability}'`);
        break;
      }
      seen.add(capability);
    }
    if (
      typeof systemClass === "string" &&
      (SYSTEM_CLASSES as readonly string[]).includes(systemClass) &&
      issues.length === 0
    ) {
      const allowed = CLASS_CAPABILITIES[systemClass as SystemClass];
      for (const capability of capabilities as string[]) {
        if (!(allowed as readonly string[]).includes(capability)) {
          issues.push(
            `capability '${capability}' is not applicable to system class '${systemClass}'`,
          );
        }
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    descriptor: {
      adapterId: adapterId as string,
      systemClass: systemClass as SystemClass,
      displayName: displayName as string,
      capabilities: [...(capabilities as AdapterCapability[])],
      version: version as string,
    },
  };
}

/**
 * The class-appropriate capability ceiling: an adapter registered under a
 * system class may only declare capabilities from its class's list (an honest
 * declaration of what that class of incumbent system can exchange). A class's
 * import capability pairs 1:1 with its import scope (`CLASS_IMPORT_SCOPE` in
 * permissions.ts — the pairing is tested).
 */
export const CLASS_CAPABILITIES: Readonly<Record<SystemClass, readonly AdapterCapability[]>> =
  Object.freeze({
    "bim-ifc": ["import-entities", "export-derived", "query-status"],
    "cad-dxf": ["import-entities", "export-derived", "query-status"],
    "boq-document": ["import-documents", "export-derived", "query-status"],
    "project-management": ["import-entities", "import-documents", "export-derived", "query-status"],
    "erp-procurement": ["import-entities", "export-derived", "query-status"],
    "storage-document": ["import-documents", "export-derived", "query-status"],
  });

/* ------------------------------------------------------------------ */
/* Integration failure taxonomy (frozen, TRANSIENT vs PERMANENT)        */
/* ------------------------------------------------------------------ */

/**
 * TRANSIENT failures: bounded retries are legitimate (the incumbent system or
 * the network path may recover). The sync engine retries these up to the
 * policy bound and journals EVERY attempt with its exact outcome.
 */
export const TRANSIENT_FAILURE_CODES = ["RETRYABLE_TIMEOUT", "RATE_LIMITED"] as const;
Object.freeze(TRANSIENT_FAILURE_CODES);

/**
 * PERMANENT failures: retrying cannot change the outcome. The sync engine
 * fails fast — ZERO retries — and journals the single refused attempt.
 */
export const PERMANENT_FAILURE_CODES = [
  "AUTH_REVOKED",
  "SCOPE_DENIED",
  "SOURCE_NOT_FOUND",
  "FORMAT_UNSUPPORTED",
  "CONTRACT_VIOLATION",
] as const;
Object.freeze(PERMANENT_FAILURE_CODES);

/** The full taxonomy: exactly the transient family union the permanent family. */
export const INTEGRATION_FAILURE_CODES: readonly (TransientFailureCode | PermanentFailureCode)[] =
  Object.freeze([...TRANSIENT_FAILURE_CODES, ...PERMANENT_FAILURE_CODES]);

export type TransientFailureCode = (typeof TRANSIENT_FAILURE_CODES)[number];
export type PermanentFailureCode = (typeof PERMANENT_FAILURE_CODES)[number];
export type IntegrationFailureCode = TransientFailureCode | PermanentFailureCode;

export type FailureFamily = "transient" | "permanent";

/** The family of a failure code — the taxonomy's single classification path. */
export function failureFamily(code: IntegrationFailureCode): FailureFamily {
  return (TRANSIENT_FAILURE_CODES as readonly string[]).includes(code) ? "transient" : "permanent";
}

/** Only TRANSIENT failures are retryable — by construction, never a flag. */
export function isRetryableFailure(code: IntegrationFailureCode): boolean {
  return failureFamily(code) === "transient";
}

/** A typed integration failure. `detail` is deterministic and id-safe. */
export interface IntegrationFailure {
  readonly code: IntegrationFailureCode;
  readonly detail: string;
}

/**
 * Construct a typed failure (validates the code against the frozen taxonomy —
 * an unknown code is itself a CONTRACT_VIOLATION of this module's contract).
 */
export function integrationFailure(code: string, detail: string): IntegrationFailure {
  if (!(INTEGRATION_FAILURE_CODES as readonly string[]).includes(code)) {
    return {
      code: "CONTRACT_VIOLATION",
      detail: `unknown integration failure code '${code}' (original detail: ${detail})`,
    };
  }
  return { code: code as IntegrationFailureCode, detail };
}

/* ------------------------------------------------------------------ */
/* Source-of-record identity (preserved VERBATIM)                       */
/* ------------------------------------------------------------------ */

/**
 * Identifies the incumbent system INSTANCE a record came from: the system
 * class plus the deployment's instance id (e.g. "sap-prod-01"), both opaque.
 */
export interface SourceSystemRef {
  readonly systemClass: SystemClass;
  readonly systemInstanceId: string;
}

/**
 * The identity every imported artifact carries. This is the R14/R15
 * source-of-record contract:
 *
 *  - `sourceRecordId` is the VERBATIM incumbent record id — never re-keyed,
 *    never merged, never normalized (an AISE content id is ADDED alongside,
 *    never substituted).
 *  - `contentId` is the 64-hex content address of the fetched bytes
 *    (sha-256; the capture-gateway discipline — same bytes, same id).
 *  - `fetchedAt` comes from the injected clock; `syncId` is the sync lineage
 *    entry that produced this fetch (see sync.ts).
 */
export interface SourceOfRecordIdentity {
  readonly sourceSystem: SourceSystemRef;
  readonly sourceRecordId: string;
  readonly fetchedAt: string;
  readonly contentId: string;
  readonly syncId: string;
}

/* ------------------------------------------------------------------ */
/* Import outcomes (imports are EVIDENCE, never canonical writes)       */
/* ------------------------------------------------------------------ */

/**
 * A structured record ready for the EVIDENCE service. The payload carries
 * everything a caller needs to (1) pin the bytes as content through the
 * capture gateway (contentId is the content address of `bytes`) and (2)
 * register an evidence record with provenance. The mapping to an `Evidence`
 * contract record (acquisition-method vocabulary, metadata key mapping) is
 * downstream wiring policy (AISE-036/038) and is deliberately NOT decided
 * here — this module never writes evidence itself.
 */
export interface ImportedEvidencePayload {
  /** Content address of `bytes` (=== the record's sourceOfRecord.contentId). */
  readonly contentId: string;
  readonly byteSize: number;
  readonly mediaType: string;
  /** The fetched artifact bytes, exactly as served by the incumbent system. */
  readonly bytes: Uint8Array;
  /**
   * Verbatim incumbent metadata (open string map, never interpreted here;
   * unknown keys are data and must be preserved).
   */
  readonly sourceMetadata: Readonly<Record<string, string>>;
}

/**
 * ADVISORY derivation hint for downstream review: what a human or a later
 * work item may derive from the imported evidence. `kind` is an OPEN
 * lower_snake_case vocabulary (consumers ignore kinds they do not
 * understand). Hints are never authority — acting on them is a governed
 * downstream decision.
 */
export interface DerivationHint {
  readonly kind: string;
  readonly note: string;
}

/** One imported record: source identity + evidence payload + advisory hints. */
export interface ImportedRecord {
  readonly status: "imported";
  readonly sourceOfRecord: SourceOfRecordIdentity;
  readonly evidencePayload: ImportedEvidencePayload;
  readonly derivationHints: readonly DerivationHint[];
}

/**
 * The same incumbent content fetched again (content-addressed duplicate).
 * The identity of THIS fetch is preserved; `duplicateOf` names the original.
 */
export interface SkippedDuplicateRecord {
  readonly status: "skipped-duplicate";
  readonly sourceOfRecord: SourceOfRecordIdentity;
  readonly duplicateOf: {
    readonly contentId: string;
    readonly firstSyncId: string | null;
  };
}

/** One record-level failure (typed; the sync continues with other records). */
export interface FailedRecord {
  readonly status: "failed";
  readonly sourceRecordId: string;
  readonly failure: IntegrationFailure;
}

export type ImportRecordOutcome = ImportedRecord | SkippedDuplicateRecord | FailedRecord;

export type ImportOutcome =
  | { readonly kind: "success"; readonly records: readonly ImportRecordOutcome[] }
  | { readonly kind: "failure"; readonly failure: IntegrationFailure };

/* ------------------------------------------------------------------ */
/* Export outcomes (derived projections, stamped with their source)     */
/* ------------------------------------------------------------------ */

/**
 * Reference to the CANONICAL snapshot an export derives from. Opaque to this
 * module beyond identity: `sourceVersionId` names the canonical version
 * (e.g. a Reality GraphVersion id) and `snapshotContentId` addresses the
 * canonical snapshot bytes. Adapters read snapshot bytes through their OWN
 * injected reader (adapters own I/O); this framework never reads snapshots.
 */
export interface CanonicalSnapshotRef {
  readonly tenantId: string;
  readonly projectId: string;
  readonly sourceVersionId: string;
  readonly snapshotContentId: string;
}

/**
 * The R14 acceptance note carried by EVERY export: the projection is DERIVED
 * from the named canonical snapshot; an exporter is never canonical.
 */
export interface ExportProvenance {
  readonly exportedAt: string;
  readonly sourceVersionId: string;
  readonly snapshotContentId: string;
  readonly adapterId: string;
  readonly derivationNote: string;
}

/** A derived export: bytes + media type + content address + provenance. */
export interface DerivedProjection {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  /** Content address of `bytes` (sha-256 over the derived bytes). */
  readonly contentId: string;
  readonly provenance: ExportProvenance;
}

export type ExportOutcome =
  | { readonly kind: "success"; readonly projection: DerivedProjection }
  | { readonly kind: "failure"; readonly failure: IntegrationFailure };

/**
 * Result of a connector status probe (`queryStatus`): a cheap, non-sync
 * availability check. NOT journaled (it performs no import/export); the
 * failure field carries the typed refusal reason when unavailable, so even a
 * probe never fails silently.
 */
export interface ConnectorStatus {
  readonly available: boolean;
  readonly detail: string;
  readonly failure: IntegrationFailure | null;
}

/* ------------------------------------------------------------------ */
/* Sync lineage (append-only journal entries — R15 auditability)        */
/* ------------------------------------------------------------------ */

export type SyncDirection = "import" | "export";

export type SyncOverallStatus = "completed" | "partial" | "failed";

/** One journaled attempt: exact outcome, timestamps from the injected clock. */
export interface SyncAttempt {
  /** 1-based attempt number within the sync. */
  readonly attemptNumber: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly outcome: "success" | "failure-transient" | "failure-permanent";
  readonly failureCode: IntegrationFailureCode | null;
  readonly failureDetail: string | null;
}

/**
 * The journaled per-record projection (JSON-safe by design: no bytes, no
 * payloads — the full outcomes are returned to the caller; the LEDGER keeps
 * the audit projection).
 */
export type SyncRecordOutcome =
  | { readonly status: "imported"; readonly sourceRecordId: string; readonly contentId: string }
  | {
      readonly status: "skipped-duplicate";
      readonly sourceRecordId: string;
      readonly contentId: string;
    }
  | {
      readonly status: "failed";
      readonly sourceRecordId: string;
      readonly failureCode: IntegrationFailureCode;
      readonly failureDetail: string;
    }
  | {
      readonly status: "exported";
      readonly sourceVersionId: string;
      readonly contentId: string;
    };

/**
 * One append-only sync lineage entry (per tenant/project journal). Scope
 * grants, every attempt and every per-record outcome are recorded; entries
 * are never rewritten (history is an immutable prefix).
 */
export interface SyncRecord {
  readonly syncId: string;
  /** Opaque, journaled verbatim — never interpreted (server-authoritative). */
  readonly tenantId: string;
  /** Opaque, journaled verbatim. */
  readonly projectId: string;
  readonly adapterId: string;
  readonly systemClass: SystemClass;
  readonly direction: SyncDirection;
  readonly startedAt: string;
  readonly finishedAt: string;
  /** EVERY attempt in order (scope/capability refusals journal zero). */
  readonly attempts: readonly SyncAttempt[];
  /** The scope grants this sync ran under (recorded, deny-by-default). */
  readonly grantedScopes: readonly string[];
  readonly perRecordOutcomes: readonly SyncRecordOutcome[];
  readonly overall: SyncOverallStatus;
  /** Top-level failure (overall refusal or exhausted retries), null on success. */
  readonly failure: IntegrationFailure | null;
}

/**
 * Deterministic sync id: sha-256 over the canonical JSON of the sync's
 * identity fields + its sequence position in the tenant/project journal.
 * Identical adapter behavior + identical clock + fresh ledger ⇒ identical ids.
 */
export function deriveSyncId(input: {
  readonly tenantId: string;
  readonly projectId: string;
  readonly adapterId: string;
  readonly systemClass: SystemClass;
  readonly direction: SyncDirection;
  readonly startedAt: string;
  readonly sequence: number;
}): string {
  return sha256Hex(canonicalJsonStringify(input));
}

/** sha-256 (64 lowercase hex) over the canonical JSON text of a value. */
export function sha256OfCanonical(value: unknown): string {
  return sha256Hex(canonicalJsonStringify(value));
}
