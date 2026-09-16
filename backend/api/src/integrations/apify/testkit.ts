/**
 * PROD-008 — Apify connector testkit: the deterministic fetch recorder.
 *
 * TEST SUPPORT ONLY — never imported by production modules. No network, no
 * wall clock, no randomness: every response is SCRIPTED, every request is
 * RECORDED (method, full URL, headers, body), so the tests can prove the
 * credential-isolation contract STRUCTURALLY:
 *
 *  - the token appears ONLY as the value of the `authorization` header —
 *    never in any URL, query string, request body, or other header;
 *  - the disabled connector performs ZERO fetches (an empty script makes any
 *    fetch a hard test failure);
 *  - every observable HTTP state (402 / 429 / 400-404-410 / transport
 *    rejection / unexpected status) is scriptable deterministically.
 */

import type { ApifyFetch } from "./adapter";

/** One scripted fetch outcome (consumed in call order). */
export interface ScriptedApifyResponse {
  /** HTTP status of the fabricated response (default 200). */
  readonly status?: number;
  /** Response headers of the fabricated response. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Response body (default empty string). */
  readonly body?: string;
  /** When set, the fetch REJECTS with this error (transport failure). */
  readonly transportError?: Error;
}

/** One recorded outgoing request, exactly as the connector issued it. */
export interface RecordedApifyRequest {
  readonly method: string;
  readonly url: string;
  /** Lower-cased header names → values (deterministic comparison). */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
}

/**
 * The fetch recorder/fake: `recorder.fetch` is injected as the connector's
 * fetch implementation. A fetch beyond the script's end is a HARD test
 * failure (thrown with the offending URL) — a disabled connector under an
 * EMPTY script therefore proves zero HTTP traffic.
 */
export class ApifyFetchRecorder {
  public readonly requests: RecordedApifyRequest[] = [];
  private nextIndex = 0;

  constructor(private readonly script: readonly ScriptedApifyResponse[]) {}

  public readonly fetch: ApifyFetch = async (
    url: string,
    init: { method: "GET"; headers: Record<string, string> },
  ): Promise<Response> => {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(init.headers)) {
      headers[name.toLowerCase()] = value;
    }
    this.requests.push({
      method: init.method,
      url,
      headers,
      body: null,
    });
    const step = this.script[this.nextIndex];
    this.nextIndex += 1;
    if (step === undefined) {
      throw new Error(
        `ApifyFetchRecorder: unexpected fetch #${this.nextIndex} (no scripted response) — url '${url}'`,
      );
    }
    if (step.transportError !== undefined) {
      throw step.transportError;
    }
    return new Response(step.body ?? "", {
      status: step.status ?? 200,
      headers: step.headers ?? {},
    });
  };

  /** Number of HTTP requests the connector actually issued. */
  public get callCount(): number {
    return this.requests.length;
  }
}

/**
 * STRUCTURAL credential-isolation assertion over the recorded traffic: for
 * every recorded request, the token must appear EXACTLY as the
 * `authorization: Bearer <token>` header — and NOWHERE else (not in any URL,
 * not in any body, not in any other header value). Returns the (deterministic)
 * list of violations; an empty list is a pass.
 */
export function apifyTokenIsolationViolations(
  recorder: ApifyFetchRecorder,
  token: string,
): string[] {
  const violations: string[] = [];
  if (recorder.requests.length === 0) {
    return violations;
  }
  for (const request of recorder.requests) {
    const authorization = request.headers["authorization"] ?? null;
    if (authorization !== `Bearer ${token}`) {
      violations.push(
        `request to '${request.url}': authorization header is ${JSON.stringify(authorization)}` +
          ` — expected exactly 'Bearer <token>'`,
      );
    }
    for (const [name, value] of Object.entries(request.headers)) {
      if (name !== "authorization" && value.includes(token)) {
        violations.push(`request to '${request.url}': token leaked into header '${name}'`);
      }
    }
    if (request.url.includes(token)) {
      violations.push(`request url '${request.url}' contains the token`);
    }
    if (request.body !== null && request.body.includes(token)) {
      violations.push(`request to '${request.url}': token leaked into the request body`);
    }
  }
  return violations;
}
