/**
 * PROD-034 — the PROVIDER-STATUS tests (issue #9 gap 6).
 *
 * The task-first.test.tsx discipline: static renders of pure projections
 * (wrapped in the environment context — the note reads the probed status)
 * + the probeApi seam tests. The consistent vocabulary, the no-internals
 * discipline and the wiring at the provider-gated points are pinned.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import {
  ProviderStatusBadge,
  ProviderStatusList,
  ProviderStatusNote,
  describeProviderStatus,
} from "./provider-status";
import { AppEnvironmentContext } from "./environment";
import type { ApiStatus, FetchLike } from "./api";
import { probeApi } from "./api";
import { TaskFlowResourceView } from "./task-first";
import type { TaskFlowResourceData } from "./task-first";
import type { ResourceState } from "./resource";

/** A probed status factory (the only ApiStatus construction in tests). */
function apiStatus(overrides: Partial<ApiStatus>): ApiStatus {
  return {
    mode: "available",
    healthz: "ok",
    readyz: "ok",
    detail: "live API on this origin",
    providers: null,
    ...overrides,
  };
}

/** Render a node inside the app environment (the note reads the context). */
function renderWithEnvironment(node: ReactNode, status: ApiStatus | null): string {
  return renderToStaticMarkup(
    <AppEnvironmentContext.Provider
      value={{
        apiStatus: status,
        fetchImpl: (input) => Promise.reject(new Error(`no transport for ${input}`)),
        principalId: "user-alice",
      }}
    >
      {node}
    </AppEnvironmentContext.Provider>,
  );
}

describe("PROD-034 gap 6 — the consistent vocabulary (one meaning per recorded word)", () => {
  test("each recorded word carries exactly one calm meaning", () => {
    expect(describeProviderStatus("available").meaning).toContain(
      "ready — configured on this deployment",
    );
    expect(describeProviderStatus("disabled").meaning).toContain(
      "not configured — a deliberate deployment choice",
    );
    expect(describeProviderStatus("disabled").title).toContain("never an error");
    expect(describeProviderStatus("unavailable").meaning).toContain(
      "not usable — the deployment's readiness check reports it as misconfigured",
    );
  });

  test("the badge renders the recorded word VERBATIM with one visual per word", () => {
    expect(renderToStaticMarkup(<ProviderStatusBadge status="available" />)).toContain(
      ">available</span>",
    );
    expect(renderToStaticMarkup(<ProviderStatusBadge status="disabled" />)).toContain(
      ">disabled</span>",
    );
    expect(renderToStaticMarkup(<ProviderStatusBadge status="unavailable" />)).toContain(
      ">unavailable</span>",
    );
    expect(renderToStaticMarkup(<ProviderStatusBadge status="unavailable" />)).toContain(
      "tag-missing-open",
    );
  });

  test("the vocabulary leaks no implementation noise (no env vars, no SDK internals, no raw errors)", () => {
    for (const word of ["available", "disabled", "unavailable"] as const) {
      const meaning = describeProviderStatus(word);
      expect(meaning.meaning).not.toContain("API_KEY");
      expect(meaning.meaning).not.toContain("env");
      expect(meaning.meaning).not.toContain("stack");
    }
  });
});

describe("PROD-034 gap 6 — the provider list (Settings' API-connection section)", () => {
  test("every reported provider renders with the deployment's own id + the consistent meaning", () => {
    const html = renderToStaticMarkup(
      <ProviderStatusList providers={{ worldsculpt: "available", imagery: "disabled" }} />,
    );
    expect(html).toContain('data-provider-row="worldsculpt"');
    expect(html).toContain('data-provider-row="imagery"');
    expect(html).toContain("ready — configured on this deployment");
    expect(html).toContain("not configured — a deliberate deployment choice");
  });
});

describe("PROD-034 gap 6 — the compact note (the provider-gated surfaces)", () => {
  test("live + providers reported: the mode chip + each provider inline, never a guess", () => {
    const html = renderWithEnvironment(
      <ProviderStatusNote subject="the capture upload" />,
      apiStatus({ providers: { worldsculpt: "disabled" } }),
    );
    expect(html).toContain('data-provider-note="the capture upload"');
    expect(html).toContain("live API");
    expect(html).toContain('data-provider-inline="worldsculpt"');
    expect(html).toContain("disabled");
    expect(html).toContain("readiness report, never a guess");
  });

  test("live + no providers reported: the honest none-reported line", () => {
    const html = renderWithEnvironment(
      <ProviderStatusNote subject="the task-first flow" />,
      apiStatus({ providers: null }),
    );
    expect(html).toContain("reports no optional providers");
    expect(html).toContain("provider-gated beyond the API itself");
  });

  test("demo mode: the honest not-probeable line (never a guessed provider status)", () => {
    const html = renderWithEnvironment(
      <ProviderStatusNote subject="the capture upload" />,
      apiStatus({ mode: "unavailable", healthz: "failed", readyz: "skipped", detail: "demo" }),
    );
    expect(html).toContain("demo data");
    expect(html).toContain("provider statuses are not probeable");
    expect(html).toContain("instead of pretending");
  });

  test("probing: the note renders nothing (no honest statement to make yet)", () => {
    const html = renderWithEnvironment(<ProviderStatusNote subject="x" />, null);
    expect(html).toBe("");
  });

  test("wired under the task-flow UNAVAILABLE view (the blocked view names the layer)", () => {
    const state: ResourceState<TaskFlowResourceData> = {
      status: "unavailable",
      reason: "this deployment answers the API but does not serve the task-flow adapter contract objects",
      impact: "the task-first journey cannot run on live records here",
      attempt: 1,
    };
    const html = renderWithEnvironment(
      <TaskFlowResourceView
        state={state}
        onRetry={() => {}}
        render={() => <div />}
      />,
      apiStatus({ providers: { worldsculpt: "unavailable" } }),
    );
    expect(html).toContain("Unavailable in this deployment");
    expect(html).toContain('data-provider-note="the task-first flow"');
    expect(html).toContain("worldsculpt");
  });

  test("the note does NOT render in the task-flow loading/error/ready states (calm, not noise)", () => {
    const loading: ResourceState<TaskFlowResourceData> = { status: "loading", attempt: 1 };
    const html = renderWithEnvironment(
      <TaskFlowResourceView state={loading} onRetry={() => {}} render={() => <div>body</div>} />,
      apiStatus({ providers: { worldsculpt: "disabled" } }),
    );
    expect(html).not.toContain("data-provider-note");
    expect(html).toContain("Loading the task-first flow");
  });
});

describe("PROD-034 gap 6 — the probe seam extracts /readyz provider statuses (statuses only)", () => {
  const stub = (readyzBody: unknown): FetchLike =>
    (async (input: string) => {
      if (input === "/healthz") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (input === "/readyz") {
        return new Response(JSON.stringify(readyzBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not stubbed", { status: 404 });
    }) as FetchLike;

  test("the providers map is carried verbatim when the deployment reports it", async () => {
    const status = await probeApi(
      stub({ ok: true, providers: { worldsculpt: "available", imagery: "disabled" } }),
    );
    expect(status.mode).toBe("available");
    expect(status.providers).toEqual({ worldsculpt: "available", imagery: "disabled" });
  });

  test("a body without a providers map stays null (never guessed)", async () => {
    const status = await probeApi(stub({ ok: true }));
    expect(status.mode).toBe("available");
    expect(status.providers).toBeNull();
  });

  test("values outside the readiness vocabulary are dropped, never coerced", async () => {
    const status = await probeApi(
      stub({
        ok: true,
        providers: { worldsculpt: "available", bogus: "sometimes", other: 42 },
      }),
    );
    expect(status.providers).toEqual({ worldsculpt: "available" });
  });

  test("an unavailable API keeps providers null (nothing is probeable)", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ ok: false }), { status: 500 });
    const status = await probeApi(fetchImpl);
    expect(status.mode).toBe("unavailable");
    expect(status.providers).toBeNull();
  });
});
