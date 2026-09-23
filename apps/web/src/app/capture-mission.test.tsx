/**
 * PROD-034 — the CAPTURE / UPLOAD surface tests (issue #9 gap 1).
 *
 * The surfaces-create.test.tsx discipline: static renders of pure
 * projections (renderToStaticMarkup — no network, no clock, no
 * randomness) + typed seam tests with stubbed transports. Every explicit
 * state is pinned: the mission (verbatim NBA + declared gaps + the honest
 * platform-blocked note), the upload entry (demo notice, Web-Crypto
 * unavailable, STORED/DUPLICATE outcomes, the typed gateway rejection),
 * and the router/canonical-action discoverability of the surface.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CaptureMissionBody,
  CaptureUploadCardBody,
  BrowserCaptureLimitsCard,
  type CaptureUploadOutcome,
  type SelectedCaptureFile,
} from "./surfaces/CaptureMission";
import { formatRoute, parseHash } from "./router";
import {
  uploadCaptureAssetLive,
  webCryptoSha256,
  type FetchLike,
} from "./api";
import { canonicalAction, canonicalActionHref } from "../parity/action-labels";
import { taskFlowView } from "./task-flow";
import {
  DEMO_TASK_PROJECT_ID,
  demoTaskFlowBundle,
} from "./task-dataset";
import type { TaskFlowResourceData } from "./task-first";

const bundle = demoTaskFlowBundle();
const view = taskFlowView(bundle, DEMO_TASK_PROJECT_ID);
const missionData: TaskFlowResourceData = {
  mode: "demo",
  projectId: DEMO_TASK_PROJECT_ID,
  view,
  bundle,
};

describe("PROD-034 gap 1 — the capture route is first-class and discoverable", () => {
  test("the capture route parses/formats round-trip and joins the per-project surfaces", () => {
    expect(parseHash("#/projects/p1/capture")).toEqual({
      name: "capture",
      projectId: "p1",
    });
    expect(formatRoute({ name: "capture", projectId: "p1" })).toBe(
      "#/projects/p1/capture",
    );
    expect(parseHash(formatRoute({ name: "capture", projectId: "p 1" }))).toEqual({
      name: "capture",
      projectId: "p 1",
    });
  });

  test("a malformed capture address is the explicit not-found route (never a silent fallback)", () => {
    expect(parseHash("#/projects/p1/capture?x=1").name).toBe("not-found");
    expect(parseHash("#/projects//capture").name).toBe("not-found");
    expect(parseHash("#/projects/p1/capture/extra").name).toBe("not-found");
  });

  test("the Capture canonical action opens the capture mission surface (not SiteTwin inspection)", () => {
    const capture = canonicalAction("capture")!;
    expect(capture.routeName).toBe("capture");
    const href = canonicalActionHref(capture, DEMO_TASK_PROJECT_ID);
    expect(href).toBe(`#/projects/${DEMO_TASK_PROJECT_ID}/capture`);
    expect(parseHash(href)).toEqual({ name: "capture", projectId: DEMO_TASK_PROJECT_ID });
  });
});

describe("PROD-034 gap 1 — the guided capture mission (verbatim record statements)", () => {
  test("renders the server's blocked NBA with its typed blockers and the declared gaps as the why", () => {
    const html = renderToStaticMarkup(<CaptureMissionBody data={missionData} />);
    expect(html).toContain("The capture mission");
    expect(html).toContain("Depth capture cannot start");
    expect(html).toContain("capability-blocked");
    expect(html).toContain("authorization-denied");
    expect(html).toContain("What to capture and why");
    expect(html).toContain("gap-4471");
    expect(html).toContain("MISSING");
    expect(html).toContain(
      "No calibrated reference dimension was captured for the cracked masonry area",
    );
    expect(html).toContain("gap-4472");
    expect(html).toContain("WEAK");
    expect(html).toContain("demo data");
  });

  test("renders the honest platform-blocked note (this browser cannot execute the capture)", () => {
    const html = renderToStaticMarkup(<CaptureMissionBody data={missionData} />);
    expect(html).toContain('data-platform-blocked="true"');
    expect(html).toContain("This browser cannot execute this capture task");
    expect(html).toContain("the truth standard never changes");
  });

  test("renders the honest empty state when no task-flow objects are recorded", () => {
    const html = renderToStaticMarkup(
      <CaptureMissionBody
        data={{ mode: "demo", projectId: "other", view: null, bundle: null }}
      />,
    );
    expect(html).toContain("No task-flow objects recorded for this project");
    expect(html).toContain("the adapter never invents a mission");
  });

  test("renders the honest no-gaps state (nothing to capture is recorded)", () => {
    const noGaps = taskFlowView(
      {
        ...bundle,
        evidence: { ...bundle.evidence!, gaps: [] },
      },
      DEMO_TASK_PROJECT_ID,
    );
    const html = renderToStaticMarkup(
      <CaptureMissionBody
        data={{ mode: "demo", projectId: DEMO_TASK_PROJECT_ID, view: noGaps, bundle: { ...bundle, evidence: { ...bundle.evidence!, gaps: [] } } }}
      />,
    );
    expect(html).toContain("No evidence gaps are declared");
  });
});

describe("PROD-034 gap 1 — the upload entry's explicit states", () => {
  const noop = () => {};

  test("demo mode disables submission with the honest never-fabricate notice", () => {
    const html = renderToStaticMarkup(
      <CaptureUploadCardBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={true}
        digestAvailable={true}
        file={null}
        reading={false}
        submitting={false}
        outcome={null}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-demo-notice="true"');
    expect(html).toContain("the shell never fabricates writes");
    expect(html).toContain('data-submit-state="demo"');
  });

  test("a platform without Web Crypto renders the explicit blocked reason (never a fallback hash)", () => {
    const html = renderToStaticMarkup(
      <CaptureUploadCardBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={false}
        digestAvailable={false}
        file={null}
        reading={false}
        submitting={false}
        outcome={null}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-digest-unavailable="true"');
    expect(html).toContain("does not expose Web Crypto");
    expect(html).toContain("never falls back to an unverified address");
    expect(html).toContain('data-submit-state="no-digest"');
  });

  test("a selected file renders its honest summary and enables the live submit", () => {
    const file: SelectedCaptureFile = {
      name: "level2-crack-oblique.jpg",
      byteSize: 2048,
      mediaType: "image/jpeg",
    };
    const html = renderToStaticMarkup(
      <CaptureUploadCardBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={false}
        digestAvailable={true}
        file={file}
        reading={false}
        submitting={false}
        outcome={null}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain("level2-crack-oblique.jpg");
    expect(html).toContain("2048 bytes");
    expect(html).toContain("image/jpeg");
    expect(html).toContain('data-submit-state="ready"');
  });

  test("the STORED outcome states the verbatim gateway fields and the honest not-yet-evidence line", () => {
    const outcome: CaptureUploadOutcome = {
      kind: "stored",
      record: {
        outcome: "STORED",
        contentId: "a".repeat(64),
        byteSize: 2048,
        mediaType: "image/jpeg",
      },
      endpoint: `/v1/capture/assets/${"a".repeat(64)}`,
    };
    const html = renderToStaticMarkup(
      <CaptureUploadCardBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={false}
        digestAvailable={true}
        file={{ name: "x.jpg", byteSize: 2048, mediaType: "image/jpeg" }}
        reading={false}
        submitting={false}
        outcome={outcome}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-outcome="stored"');
    expect(html).toContain("Stored server-side.");
    expect(html).toContain("Registering it as an Evidence document");
    expect(html).toContain("this upload does not do it");
  });

  test("the typed failure renders verbatim (the gateway refusal, never a generic error)", () => {
    const html = renderToStaticMarkup(
      <CaptureUploadCardBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={false}
        digestAvailable={true}
        file={{ name: "x.jpg", byteSize: 1, mediaType: "image/jpeg" }}
        reading={false}
        submitting={false}
        outcome={{ kind: "failed", detail: "HTTP 422 — CONTENT_ID_MISMATCH: computed sha-256 … does not match the declared content id" }}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-outcome="failed"');
    expect(html).toContain("The upload was refused.");
    expect(html).toContain("CONTENT_ID_MISMATCH");
  });

  test("the browser-limits card states the implemented modes and the mobile field journey honestly", () => {
    const html = renderToStaticMarkup(<BrowserCaptureLimitsCard />);
    expect(html).toContain("menu-navigation");
    expect(html).toContain("mobile field adapter");
    expect(html).toContain("never pretends to satisfy it");
  });
});

describe("PROD-034 gap 1 — the capture upload seam (typed, stubbed transport)", () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const digest = async () => `${"b".repeat(64)}`;

  test("a captured request carries the raw bytes, the digest path and the media type", async () => {
    let seen: { input: string; init?: RequestInit } | null = null;
    const fetchImpl: FetchLike = async (input, init) => {
      seen = { input, init };
      return new Response(
        JSON.stringify({
          ok: true,
          outcome: "STORED",
          contentId: "b".repeat(64),
          byteSize: 4,
          mediaType: "image/jpeg",
        }),
        { status: 200 },
      );
    };
    const result = await uploadCaptureAssetLive(fetchImpl, digest, bytes, "image/jpeg");
    expect(result.ok).toBe(true);
    expect(seen!.input).toBe(`/v1/capture/assets/${"b".repeat(64)}`);
    expect(seen!.init?.method).toBe("POST");
    expect((seen!.init?.headers as Record<string, string>)["content-type"]).toBe("image/jpeg");
    expect(seen!.init?.body).toBe(bytes);
    if (result.ok) {
      expect(result.record.outcome).toBe("STORED");
      expect(result.record.contentId).toBe("b".repeat(64));
      expect(result.record.byteSize).toBe(4);
    }
  });

  test("the DUPLICATE outcome is carried verbatim (idempotent re-upload is not an error)", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(
        JSON.stringify({
          ok: true,
          outcome: "DUPLICATE",
          contentId: "b".repeat(64),
          byteSize: 4,
          mediaType: "image/jpeg",
        }),
        { status: 200 },
      );
    const result = await uploadCaptureAssetLive(fetchImpl, digest, bytes, "image/jpeg");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.outcome).toBe("DUPLICATE");
    }
  });

  test("the gateway's typed 422 (reasonCode/reasonDetail — its own envelope shape) surfaces verbatim", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(
        JSON.stringify({
          ok: false,
          reasonCode: "CONTENT_COLLISION",
          reasonDetail:
            "content id is already stored with different bytes or a different media type; stored records are immutable and are never rewritten",
        }),
        { status: 422 },
      );
    const result = await uploadCaptureAssetLive(fetchImpl, digest, bytes, "image/jpeg");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("http");
      if (result.failure.kind === "http") {
        expect(result.failure.status).toBe(422);
        expect(result.failure.code).toBe("CONTENT_COLLISION");
        expect(result.failure.reason).toContain("immutable");
      }
    }
  });

  test("a structurally invalid 2xx answer is the explicit invalid failure (never coerced)", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ ok: true, unexpected: true }), { status: 200 });
    const result = await uploadCaptureAssetLive(fetchImpl, digest, bytes, "image/jpeg");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("invalid");
      expect(result.failure.detail).toContain("did not return the expected");
    }
  });

  test("webCryptoSha256 is null without Web Crypto (the honest unavailable state) or digests hex", async () => {
    // The test runtime exposes Web Crypto (Bun) — the digest path is real;
    // the null branch is pinned by the digestAvailable=false static render.
    const digestImpl = webCryptoSha256();
    expect(digestImpl === null || typeof digestImpl === "function").toBe(true);
    if (digestImpl !== null) {
      const hex = await digestImpl(new Uint8Array([]));
      expect(hex).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
