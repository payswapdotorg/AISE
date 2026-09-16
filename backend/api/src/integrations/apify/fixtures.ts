/**
 * PROD-008 — Apify connector fixtures: deterministic, NO network.
 *
 * TEST SUPPORT ONLY — never imported by production modules. Realistic shapes
 * of the hosted Apify API v2 responses the connector consumes:
 *
 *  - actor-run objects (`GET /v2/actor-runs/{runId}` → `{ data: { … } }`),
 *  - dataset item bodies (`GET /v2/datasets/{datasetId}/items` → JSON array
 *    of scraped-page items — the connector preserves these bytes VERBATIM as
 *    evidence and never interprets them),
 *  - the 402 (free-plan quota exhaustion) / 429 (rate limit, with
 *    retry-after) / 404 (record not found) HTTP fixtures,
 *  - the status-probe user response (`GET /v2/users/me`).
 *
 * The fixture token is an OBVIOUSLY-FAKE sentinel so the credential-isolation
 * tests have a concrete secret-like value to hunt for; it is not, and never
 * was, a real credential.
 */

import type { ScriptedApifyResponse } from "./testkit";

/** Fake sentinel credential — for isolation assertions ONLY. */
export const APIFY_FIXTURE_TOKEN = "apify_api_fixture_TOKEN_not_a_real_credential_9f2c";

/** A fixture Apify actor run id (opaque, carried VERBATIM). */
export const APIFY_FIXTURE_RUN_ID = "yS5tJbUcF2xvQmNzP";

/** A fixture Apify actor id (the scraping program that produced the run). */
export const APIFY_FIXTURE_ACTOR_ID = "moJRLRc85AitAr5UL";

/** The run's default dataset id (where the run's items live). */
export const APIFY_FIXTURE_DATASET_ID = "fYHLcXPpQqGnR7vXm";

/** A second dataset id for multi-record imports. */
export const APIFY_FIXTURE_SECOND_DATASET_ID = "k7WwQzR2nBbYtGh9L";

/** Fixture media type served for dataset item bodies. */
export const APIFY_FIXTURE_MEDIA_TYPE = "application/json; charset=utf-8";

/**
 * The actor-run response body for the fixture run (Apify API v2 envelope:
 * `{ data: { … } }`; `defaultDatasetId` + `actId` are read verbatim).
 */
export function fixtureActorRunBody(runId: string): string {
  return JSON.stringify({
    data: {
      id: runId,
      actId: APIFY_FIXTURE_ACTOR_ID,
      defaultDatasetId: APIFY_FIXTURE_DATASET_ID,
      status: "SUCCEEDED",
      startedAt: "2026-07-13T09:11:42.000Z",
      finishedAt: "2026-07-13T09:12:03.000Z",
      buildNumber: "0.0.23",
    },
  });
}

/**
 * The dataset items body for a dataset id — deterministic scraped-page item
 * shapes. The connector imports these EXACT bytes as evidence.
 */
export function fixtureDatasetItemsBody(datasetId: string): string {
  return JSON.stringify([
    {
      url: `https://example-construction.example/projects/${datasetId}/specification`,
      title: "Structural specification — revision C",
      text: "The specification page acquired by the fixture actor run.",
      scrapedAt: "2026-07-13T09:11:58.000Z",
    },
    {
      url: `https://example-construction.example/projects/${datasetId}/boq`,
      title: "Bill of quantities overview",
      text: "The BOQ overview page acquired by the fixture actor run.",
      scrapedAt: "2026-07-13T09:12:01.000Z",
    },
  ]);
}

/* ------------------------------------------------------------------ */
/* Scripted HTTP fixtures                                               */
/* ------------------------------------------------------------------ */

/** 200 — the fixture actor-run object. */
export const FIXTURE_RUN_OK: ScriptedApifyResponse = {
  status: 200,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: fixtureActorRunBody(APIFY_FIXTURE_RUN_ID),
};

/** 200 — the fixture dataset items body. */
export const FIXTURE_DATASET_OK: ScriptedApifyResponse = {
  status: 200,
  headers: { "content-type": APIFY_FIXTURE_MEDIA_TYPE },
  body: fixtureDatasetItemsBody(APIFY_FIXTURE_DATASET_ID),
};

/** 200 — the fixture SECOND dataset items body (different bytes). */
export const FIXTURE_SECOND_DATASET_OK: ScriptedApifyResponse = {
  status: 200,
  headers: { "content-type": APIFY_FIXTURE_MEDIA_TYPE },
  body: fixtureDatasetItemsBody(APIFY_FIXTURE_SECOND_DATASET_ID),
};

/** 402 — free-plan quota exhausted (Apify usage-limits error shape). */
export const FIXTURE_QUOTA_EXCEEDED_402: ScriptedApifyResponse = {
  status: 402,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    error: {
      type: "usage-limits-exceeded",
      message: "You have exceeded the monthly usage limit of your free plan.",
    },
  }),
};

/** 429 — rate limit hit, with a retry-after interval (seconds). */
export const FIXTURE_RATE_LIMITED_429: ScriptedApifyResponse = {
  status: 429,
  headers: { "content-type": "application/json; charset=utf-8", "retry-after": "30" },
  body: JSON.stringify({
    error: {
      type: "rate-limit-exceeded",
      message: "You have exceeded the rate limit of 30 requests per second.",
    },
  }),
};

/** 429 — rate limit hit WITHOUT a retry-after header. */
export const FIXTURE_RATE_LIMITED_429_NO_RETRY_AFTER: ScriptedApifyResponse = {
  status: 429,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    error: { type: "rate-limit-exceeded", message: "Rate limit exceeded." },
  }),
};

/** 404 — the named dataset/run id does not exist. */
export const FIXTURE_NOT_FOUND_404: ScriptedApifyResponse = {
  status: 404,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    error: { type: "record-not-found", message: "Dataset or run not found." },
  }),
};

/** 401 — unexpected/transport-tier status outside the classified family. */
export const FIXTURE_UNEXPECTED_401: ScriptedApifyResponse = {
  status: 401,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ error: { type: "unauthorized", message: "…" } }),
};

/** 200 — the status probe's user response (GET /v2/users/me). */
export const FIXTURE_USERS_ME_OK: ScriptedApifyResponse = {
  status: 200,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    data: { id: "iN2cXhMkQpVrTzB8y", username: "aise-fixture", plan: "free" },
  }),
};
