import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { sha256Hex } from "../lib/hash";
import { createLogger } from "../lib/log";
import type { EnvRecord } from "../lib/config";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import { createRequestHandler } from "../server";
import { captureStoreContentResolver, createEvidenceService } from "./service";
import { FsEvidenceStore } from "./store";
import {
  derivationBody,
  evidenceBody,
  fixedClock,
  linkBody,
  makeDerivation,
  makeEvidence,
  makeLink,
  rawBody,
  withTempDir,
} from "./testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** Handler backed by the REAL file-system evidence store rooted at `<root>/data`. */
function handlerWith(root: string): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: () => validEnv,
    version: pkg.version,
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
    evidence: createEvidenceService({
      store: new FsEvidenceStore(join(root, "data")),
      clock: fixedClock,
    }),
  });
}

/**
 * Full production wiring: additionally wires the content-pinning resolver
 * over the capture store, so evidence registration requires pinned content.
 */
function handlerWithPinning(root: string): (request: Request) => Promise<Response> {
  const captureStore = new InMemoryCaptureStore();
  return createRequestHandler({
    envSource: () => validEnv,
    version: pkg.version,
    logger: quietLogger,
    capture: createCaptureGateway({ store: captureStore, clock: fixedClock }),
    evidence: createEvidenceService({
      store: new FsEvidenceStore(join(root, "data")),
      clock: fixedClock,
      contentResolver: captureStoreContentResolver(captureStore),
    }),
  });
}

function postJson(path: string, body: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

function uploadAsset(contentId: string, bytes: Uint8Array): Request {
  return new Request(`http://localhost/v1/capture/assets/${contentId}`, {
    method: "POST",
    body: bytes,
    headers: { "content-type": "image/jpeg" },
  });
}

function get(path: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers });
}

interface RegisterBody {
  ok: boolean;
  outcome: "REGISTERED" | "IDEMPOTENT";
  evidence: { contentId: string };
  invalidation: { reason: string } | null;
}

interface ErrorBody {
  ok: boolean;
  error: string;
  detail?: string;
}

describe("evidence HTTP surface: registration", () => {
  test("registers, re-registers idempotently and rejects conflicts", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const evidence = makeEvidence("router-register");

      const first = await handler(
        postJson("/v1/evidence", evidenceBody(evidence), { "x-request-id": "corr-evidence-1" }),
      );
      expect(first.status).toBe(200);
      expect(first.headers.get("x-request-id")).toBe("corr-evidence-1");
      const body = (await first.json()) as RegisterBody;
      expect(body.ok).toBe(true);
      expect(body.outcome).toBe("REGISTERED");
      expect(body.evidence.contentId).toBe(evidence.contentId);
      expect(body.invalidation).toBeNull();

      const again = await handler(postJson("/v1/evidence", evidenceBody(evidence)));
      expect(again.status).toBe(200);
      expect(((await again.json()) as RegisterBody).outcome).toBe("IDEMPOTENT");

      const conflict = await handler(
        postJson("/v1/evidence", evidenceBody({ ...evidence, byteSize: 99 })),
      );
      expect(conflict.status).toBe(422);
      const conflictBody = (await conflict.json()) as ErrorBody;
      expect(conflictBody.error).toBe("evidence_conflict");
      expect(conflictBody.detail).toContain(evidence.contentId);
      // The response never echoes the conflicting values.
      expect(JSON.stringify(conflictBody)).not.toContain("99");
    });
  });

  test("enforces the content pinning gate over the capture store", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWithPinning(root);
      const bytes = new TextEncoder().encode("router-pinned-asset");
      const contentId = sha256Hex(bytes);
      const evidence = makeEvidence("router-pin", { contentId });

      // Not pinned yet: typed rejection.
      const rejected = await handler(postJson("/v1/evidence", evidenceBody(evidence)));
      expect(rejected.status).toBe(422);
      expect(((await rejected.json()) as ErrorBody).error).toBe("content_not_pinned");

      // Pin the content through the capture surface, then register.
      const upload = await handler(uploadAsset(contentId, bytes));
      expect(upload.status).toBe(200);
      const accepted = await handler(postJson("/v1/evidence", evidenceBody(evidence)));
      expect(accepted.status).toBe(200);
      expect(((await accepted.json()) as RegisterBody).outcome).toBe("REGISTERED");
    });
  });

  test("rejects malformed, schema-invalid and version-mismatched bodies", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);

      const malformed = await handler(postJson("/v1/evidence", "{not json"));
      expect(malformed.status).toBe(400);
      expect(((await malformed.json()) as ErrorBody).error).toBe("malformed_json");

      const invalid = await handler(postJson("/v1/evidence", rawBody({ contentId: "xyz" })));
      expect(invalid.status).toBe(400);
      const invalidBody = (await invalid.json()) as ErrorBody & { issues: unknown[] };
      expect(invalidBody.error).toBe("schema_invalid");
      expect(invalidBody.issues.length).toBeGreaterThan(0);

      const versioned = await handler(
        postJson(
          "/v1/evidence",
          rawBody({ ...makeEvidence("router-version"), contractVersion: "2.0.0" }),
        ),
      );
      expect(versioned.status).toBe(400);
      expect(((await versioned.json()) as ErrorBody).error).toBe("version_unsupported");
    });
  });
});

describe("evidence HTTP surface: reads, invalidation and listing", () => {
  test("returns the full read view with upstream invalidations", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const a = makeEvidence("router-read-a");
      const b = makeEvidence("router-read-b");
      await handler(postJson("/v1/evidence", evidenceBody(a)));
      await handler(postJson("/v1/evidence", evidenceBody(b)));
      await handler(
        postJson(
          "/v1/evidence/provenance-links",
          linkBody(makeLink("measurement", "meas-1", a.contentId)),
        ),
      );
      await handler(
        postJson(
          "/v1/evidence/derivations",
          derivationBody(makeDerivation("d-router", b.contentId, [a.contentId])),
        ),
      );
      await handler(
        postJson(`/v1/evidence/${a.contentId}/invalidation`, rawBody({ reason: "camera obstruction" })),
      );

      const readB = await handler(get(`/v1/evidence/${b.contentId}`));
      expect(readB.status).toBe(200);
      const view = (await readB.json()) as {
        ok: boolean;
        evidence: { contentId: string };
        invalidation: unknown;
        provenance: { asObject: unknown[]; asSubject: unknown[] };
        derivations: { inputsOf: unknown[]; derivedFrom: unknown[] };
        upstreamInvalidations: Array<{ contentId: string; reason: string; invalidatedAt: string }>;
      };
      expect(view.ok).toBe(true);
      expect(view.evidence.contentId).toBe(b.contentId);
      expect(view.invalidation).toBeNull();
      expect(view.derivations.derivedFrom).toHaveLength(1);
      expect(view.upstreamInvalidations).toEqual([
        { contentId: a.contentId, reason: "camera obstruction", invalidatedAt: fixedClock() },
      ]);

      const readA = await handler(get(`/v1/evidence/${a.contentId}`));
      expect(readA.status).toBe(200);
      const viewA = (await readA.json()) as {
        invalidation: { reason: string } | null;
        provenance: { asObject: unknown[] };
      };
      expect(viewA.invalidation?.reason).toBe("camera obstruction");
      expect(viewA.provenance.asObject).toHaveLength(1);

      const unknown = await handler(get(`/v1/evidence/${sha256Hex("router-unknown")}`));
      expect(unknown.status).toBe(404);
      expect(((await unknown.json()) as ErrorBody).error).toBe("evidence_not_found");

      const malformedId = await handler(get("/v1/evidence/not-a-content-id"));
      expect(malformedId.status).toBe(400);
      expect(((await malformedId.json()) as ErrorBody).error).toBe("invalid_content_id");
    });
  });

  test("invalidation endpoint appends once and rejects double invalidation", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const evidence = makeEvidence("router-invalidate");
      await handler(postJson("/v1/evidence", evidenceBody(evidence)));

      const first = await handler(
        postJson(`/v1/evidence/${evidence.contentId}/invalidation`, rawBody({ reason: "double-exposure" })),
      );
      expect(first.status).toBe(200);
      const body = (await first.json()) as { invalidation: { reason: string } };
      expect(body.invalidation.reason).toBe("double-exposure");

      const second = await handler(
        postJson(`/v1/evidence/${evidence.contentId}/invalidation`, rawBody({ reason: "again" })),
      );
      expect(second.status).toBe(422);
      expect(((await second.json()) as ErrorBody).error).toBe("already_invalidated");

      const unknown = await handler(
        postJson(`/v1/evidence/${sha256Hex("router-inv-unknown")}/invalidation`, rawBody({ reason: "x" })),
      );
      expect(unknown.status).toBe(404);

      const badBody = await handler(
        postJson(`/v1/evidence/${evidence.contentId}/invalidation`, rawBody({ reason: "x", extra: 1 })),
      );
      expect(badBody.status).toBe(400);
      expect(((await badBody.json()) as ErrorBody).error).toBe("schema_invalid");

      const emptyReason = await handler(
        postJson(`/v1/evidence/${evidence.contentId}/invalidation`, rawBody({ reason: "" })),
      );
      expect(emptyReason.status).toBe(400);
    });
  });

  test("listing excludes invalidated evidence by default", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const active = makeEvidence("router-list-active");
      const invalidated = makeEvidence("router-list-invalid");
      for (const item of [active, invalidated]) {
        await handler(postJson("/v1/evidence", evidenceBody(item)));
      }
      await handler(
        postJson(`/v1/evidence/${invalidated.contentId}/invalidation`, rawBody({ reason: "superseded" })),
      );

      const listed = await handler(get("/v1/evidence"));
      expect(listed.status).toBe(200);
      const body = (await listed.json()) as {
        evidence: Array<{ evidence: { contentId: string }; invalidation: unknown }>;
      };
      expect(body.evidence.map((item) => item.evidence.contentId)).toEqual([active.contentId]);

      const including = await handler(get("/v1/evidence?includeInvalidated=true"));
      const includeBody = (await including.json()) as {
        evidence: Array<{ evidence: { contentId: string } }>;
      };
      expect(includeBody.evidence.map((item) => item.evidence.contentId)).toEqual(
        [active.contentId, invalidated.contentId].sort(),
      );

      const junk = await handler(get("/v1/evidence?includeInvalidated=banana"));
      expect(junk.status).toBe(400);
      expect(((await junk.json()) as ErrorBody).error).toBe("invalid_query");
    });
  });
});

describe("evidence HTTP surface: links and derivations", () => {
  test("appends links idempotently and names missing ids on closure violations", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const a = makeEvidence("router-link-a");
      const b = makeEvidence("router-link-b");
      await handler(postJson("/v1/evidence", evidenceBody(a)));
      await handler(postJson("/v1/evidence", evidenceBody(b)));
      const link = makeLink("evidence", b.contentId, a.contentId, "DERIVED_FROM");

      const first = await handler(postJson("/v1/evidence/provenance-links", linkBody(link)));
      expect(first.status).toBe(200);
      expect(((await first.json()) as { outcome: string }).outcome).toBe("LINKED");

      const duplicate = await handler(postJson("/v1/evidence/provenance-links", linkBody(link)));
      expect(((await duplicate.json()) as { outcome: string }).outcome).toBe("DUPLICATE");

      const unknown = sha256Hex("router-link-unknown");
      const closure = await handler(
        postJson("/v1/evidence/provenance-links", linkBody(makeLink("measurement", "m-1", unknown))),
      );
      expect(closure.status).toBe(422);
      const closureBody = (await closure.json()) as ErrorBody;
      expect(closureBody.error).toBe("provenance_closure");
      expect(closureBody.detail).toContain(unknown);

      const malformed = await handler(postJson("/v1/evidence/provenance-links", "{"));
      expect(malformed.status).toBe(400);
      expect(((await malformed.json()) as ErrorBody).error).toBe("malformed_json");
    });
  });

  test("records derivations, rejects closure violations and cycles", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const a = makeEvidence("router-derivation-a");
      const b = makeEvidence("router-derivation-b");
      await handler(postJson("/v1/evidence", evidenceBody(a)));
      await handler(postJson("/v1/evidence", evidenceBody(b)));

      const derivation = makeDerivation("d-router-1", b.contentId, [a.contentId]);
      const first = await handler(postJson("/v1/evidence/derivations", derivationBody(derivation)));
      expect(first.status).toBe(200);
      expect(((await first.json()) as { outcome: string }).outcome).toBe("RECORDED");

      const duplicate = await handler(postJson("/v1/evidence/derivations", derivationBody(derivation)));
      expect(((await duplicate.json()) as { outcome: string }).outcome).toBe("DUPLICATE");

      const missingInput = sha256Hex("router-missing-input");
      const closure = await handler(
        postJson(
          "/v1/evidence/derivations",
          derivationBody(makeDerivation("d-router-2", b.contentId, [a.contentId, missingInput])),
        ),
      );
      expect(closure.status).toBe(422);
      const closureBody = (await closure.json()) as ErrorBody;
      expect(closureBody.error).toBe("provenance_closure");
      expect(closureBody.detail).toContain(missingInput);

      // a -> b is stored; b -> a would close the cycle.
      const cycle = await handler(
        postJson(
          "/v1/evidence/derivations",
          derivationBody(makeDerivation("d-router-3", a.contentId, [b.contentId])),
        ),
      );
      expect(cycle.status).toBe(422);
      expect(((await cycle.json()) as ErrorBody).error).toBe("derivation_cycle");
    });
  });
});

describe("evidence HTTP surface: methods and fall-through", () => {
  test("answers 405 with explicit allows and falls through for unknown shapes", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const contentId = makeEvidence("router-405").contentId;

      const putRoot = await handler(new Request("http://localhost/v1/evidence", { method: "PUT" }));
      expect(putRoot.status).toBe(405);
      expect(putRoot.headers.get("allow")).toBe("GET, POST");

      const getLinks = await handler(get("/v1/evidence/provenance-links"));
      expect(getLinks.status).toBe(405);
      expect(getLinks.headers.get("allow")).toBe("POST");

      const deleteEvidence = await handler(
        new Request(`http://localhost/v1/evidence/${contentId}`, { method: "DELETE" }),
      );
      expect(deleteEvidence.status).toBe(405);
      expect(deleteEvidence.headers.get("allow")).toBe("GET");

      // No matching route shape under /v1/evidence: server-wide 404.
      const unknown = await handler(get(`/v1/evidence/${contentId}/bogus`));
      expect(unknown.status).toBe(404);
      expect(((await unknown.json()) as ErrorBody).error).toBe("not_found");
    });
  });

  test("every response echoes the request correlation id", async () => {
    await withTempDir(async (root) => {
      const handler = handlerWith(root);
      const response = await handler(get("/v1/evidence", { "x-request-id": "corr-42" }));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-42");
      expect(await response.json()).toEqual({ ok: true, evidence: [] });
    });
  });
});

describe("evidence HTTP surface: default server wiring", () => {
  test("serves evidence routes without an injected service, rooted at AISE_DATA_DIR", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "wired-data");
      const handler = createRequestHandler({
        envSource: (): EnvRecord => ({ ...validEnv, AISE_DATA_DIR: dataDir }),
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
      });
      const evidence = makeEvidence("router-default-wiring");

      // Non-evidence traffic never constructs the default evidence store.
      const health = await handler(get("/healthz"));
      expect(health.status).toBe(200);
      expect(existsSync(join(dataDir, "evidence"))).toBe(false);

      const response = await handler(postJson("/v1/evidence", evidenceBody(evidence)));
      expect(response.status).toBe(200);
      expect(((await response.json()) as RegisterBody).outcome).toBe("REGISTERED");

      const recordPath = join(
        dataDir,
        "evidence",
        "records",
        `${sha256Hex(evidence.contentId)}.json`,
      );
      expect(existsSync(recordPath)).toBe(true);
      expect(JSON.parse(readFileSync(recordPath, "utf8")) as unknown).toEqual(evidence);

      const read = await handler(get(`/v1/evidence/${evidence.contentId}`));
      expect(read.status).toBe(200);
      const view = (await read.json()) as { evidence: { contentId: string }; invalidation: null };
      expect(view.evidence.contentId).toBe(evidence.contentId);
      expect(view.invalidation).toBeNull();
    });
  });
});
