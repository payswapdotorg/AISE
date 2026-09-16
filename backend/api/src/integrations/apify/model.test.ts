/**
 * PROD-008 — Apify connector MODEL tests: default-disabled configuration,
 * construction refusals, structural token isolation of the redacted summary,
 * and the frozen mapping from the Apify-specific failure family into the
 * AISE-037 integration failure taxonomy (totality + family + detail honesty).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  APIFY_CONNECTOR_ID,
  APIFY_CONNECTOR_VERSION,
  APIFY_DEFAULT_BASE_URL,
  APIFY_FAILURE_PORT_CODES,
  APIFY_SYSTEM_CLASS,
  apifyConnectorConfig,
  apifyFailureToIntegrationFailure,
  redactedApifyConfigSummary,
  toPortImportOutcome,
} from "./model";
import type { ApifyConnectorFailure, ApifyFailureCode } from "./model";
import {
  INTEGRATION_FAILURE_CODES,
  failureFamily,
  isRetryableFailure,
} from "../model";
import type { ImportRecordOutcome } from "../model";

const FIXTURE_TOKEN = "model-test-token-SENTINEL-value";

/* ------------------------------------------------------------------ */

describe("apify config: optional, disabled by default", () => {
  test("the default config is DISABLED (the product works without Apify)", () => {
    const config = apifyConnectorConfig();
    expect(config.enabled).toBe(false);
    expect(config.baseUrl).toBe(APIFY_DEFAULT_BASE_URL);
    expect(config.token).toBe("");
  });

  test("explicit overrides are honored (enabled + baseUrl + token)", () => {
    const config = apifyConnectorConfig({
      enabled: true,
      baseUrl: "https://api.apify.example",
      token: FIXTURE_TOKEN,
    });
    expect(config.enabled).toBe(true);
    expect(config.baseUrl).toBe("https://api.apify.example");
    expect(config.token).toBe(FIXTURE_TOKEN);
  });

  test("a disabled connector needs NO token (construction succeeds)", () => {
    expect(() => apifyConnectorConfig({ token: "" })).not.toThrow();
  });

  test("enabled=true with an empty token is a typed construction refusal", () => {
    expect(() => apifyConnectorConfig({ enabled: true, token: "" })).toThrow(
      /enabled=true requires a token/,
    );
  });

  test("baseUrl must be an http(s) URL (construction refusal otherwise)", () => {
    expect(() => apifyConnectorConfig({ baseUrl: "" })).toThrow(/baseUrl must be an http\(s\) URL/);
    expect(() => apifyConnectorConfig({ baseUrl: "ftp://api.apify.com" })).toThrow(
      /baseUrl must be an http\(s\) URL/,
    );
  });
});

describe("apify config: structural token isolation", () => {
  test("the redacted summary carries baseUrl + enabled and NEVER the token", () => {
    const config = apifyConnectorConfig({
      enabled: true,
      baseUrl: "https://api.apify.example",
      token: FIXTURE_TOKEN,
    });
    const summary = redactedApifyConfigSummary(config);
    expect(summary).toContain("https://api.apify.example");
    expect(summary).toContain("enabled=true");
    expect(summary).toContain("token=<redacted>");
    expect(summary.includes(FIXTURE_TOKEN)).toBe(false);
  });

  test("production sources never JSON.stringify and never log (comment-stripped scan)", () => {
    const stripComments = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const file of ["model.ts", "adapter.ts"]) {
      const source = stripComments(
        readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8"),
      );
      expect(source.includes("JSON.stringify")).toBe(false);
      expect(source.includes("console.")).toBe(false);
    }
  });
});

describe("apify failure family: frozen mapping into the AISE-037 taxonomy", () => {
  const ALL_CODES: readonly ApifyFailureCode[] = [
    "quota_exceeded",
    "rate_limited",
    "disabled",
    "invalid_actor",
    "network_error",
  ];

  test("the mapping table covers EXACTLY the five apify codes", () => {
    expect(Object.keys(APIFY_FAILURE_PORT_CODES).sort()).toEqual([...ALL_CODES].sort());
  });

  test("every mapped code is a member of the frozen AISE-037 taxonomy", () => {
    for (const code of ALL_CODES) {
      expect(INTEGRATION_FAILURE_CODES).toContain(APIFY_FAILURE_PORT_CODES[code]);
    }
  });

  test("quota exhaustion / disabled / invalid_actor are PERMANENT (fail fast)", () => {
    for (const code of ["quota_exceeded", "disabled", "invalid_actor"] as const) {
      expect(failureFamily(APIFY_FAILURE_PORT_CODES[code])).toBe("permanent");
      expect(isRetryableFailure(APIFY_FAILURE_PORT_CODES[code])).toBe(false);
    }
  });

  test("rate limiting / network errors are TRANSIENT (bounded retry legitimate)", () => {
    for (const code of ["rate_limited", "network_error"] as const) {
      expect(failureFamily(APIFY_FAILURE_PORT_CODES[code])).toBe("transient");
      expect(isRetryableFailure(APIFY_FAILURE_PORT_CODES[code])).toBe(true);
    }
  });

  test("402 quota exhaustion maps to the account-side permanent refusal", () => {
    expect(APIFY_FAILURE_PORT_CODES.quota_exceeded).toBe("AUTH_REVOKED");
  });

  test("429 rate limiting maps to RATE_LIMITED (the natural pairing)", () => {
    expect(APIFY_FAILURE_PORT_CODES.rate_limited).toBe("RATE_LIMITED");
  });
});

describe("apify failure translation: detail honesty", () => {
  const cases: readonly ApifyConnectorFailure[] = [
    { code: "disabled", detail: "connector is off by configuration" },
    { code: "quota_exceeded", detail: "free-plan quota exhausted", httpStatus: 402 },
    { code: "rate_limited", detail: "rate limit hit — retry-after: 30s", httpStatus: 429, retryAfterSeconds: 30 },
    { code: "invalid_actor", detail: "blank record id at position 0" },
    { code: "network_error", detail: "endpoint could not be reached", httpStatus: null },
  ];

  test("the VERBATIM apify code prefixes the port detail (nothing is lost)", () => {
    for (const failure of cases) {
      const translated = apifyFailureToIntegrationFailure(failure);
      expect(translated.detail.startsWith(`[apify:${failure.code}] `)).toBe(true);
      expect(translated.detail).toContain(failure.detail);
      expect(translated.code).toBe(APIFY_FAILURE_PORT_CODES[failure.code]);
    }
  });

  test("the rate_limited failure carries the retry-after interval structurally", () => {
    const withRetry: Extract<ApifyConnectorFailure, { code: "rate_limited" }> = {
      code: "rate_limited",
      detail: "rate limit hit — retry-after: 30s",
      httpStatus: 429,
      retryAfterSeconds: 30,
    };
    expect(withRetry.retryAfterSeconds).toBe(30);
    const translated = apifyFailureToIntegrationFailure(withRetry);
    expect(translated.detail).toContain("retry-after: 30s");
  });
});

describe("apify outcome lifting: port compatibility", () => {
  const record: ImportRecordOutcome = {
    status: "imported",
    sourceOfRecord: {
      sourceSystem: { systemClass: "storage-document", systemInstanceId: "apify" },
      sourceRecordId: "ds-verbatim-001",
      fetchedAt: "2026-07-13T09:30:00.000Z",
      contentId: "a".repeat(64),
      syncId: "b".repeat(64),
    },
    evidencePayload: {
      contentId: "a".repeat(64),
      byteSize: 1,
      mediaType: "application/json",
      bytes: new Uint8Array([65]),
      sourceMetadata: { "apify.datasetId": "ds-verbatim-001" },
    },
    derivationHints: [],
  };

  test("success lifts IDENTITY-EQUAL through toPortImportOutcome", () => {
    const records = [record];
    const lifted = toPortImportOutcome({ kind: "success", records });
    expect(lifted.kind).toBe("success");
    if (lifted.kind === "success") {
      expect(lifted.records).toBe(records);
    }
  });

  test("failure lifts through the frozen mapping table", () => {
    const lifted = toPortImportOutcome({
      kind: "failure",
      failure: { code: "quota_exceeded", detail: "free-plan quota exhausted", httpStatus: 402 },
    });
    expect(lifted.kind).toBe("failure");
    if (lifted.kind === "failure") {
      expect(lifted.failure.code).toBe("AUTH_REVOKED");
      expect(lifted.failure.detail).toContain("[apify:quota_exceeded]");
    }
  });
});

describe("apify connector identity constants", () => {
  test("the connector id/version/class are frozen and honest", () => {
    expect(APIFY_CONNECTOR_ID).toBe("apify-web-acquisition");
    expect(APIFY_CONNECTOR_VERSION).toBe("1.0.0");
    expect(APIFY_SYSTEM_CLASS).toBe("storage-document");
  });
});
