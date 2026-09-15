/**
 * The stable error envelope for the DEPLOYED AISE API (PROD-003).
 *
 * Contract (the work order's "error responses are stable and documented"):
 *
 *   EVERY error response served through the runtime entry (local `bun run
 *   start` AND the Vercel catch-all function — one deployable contract) has
 *   the documented JSON body
 *
 *     { "error": { "code": "<stable-snake-case-code>", "message": "<human text>", "requestId": "<correlation id>" } }
 *
 *   with the correct HTTP status (400/401/403/404/405/413/422/500/503 …)
 *   and the `x-request-id` correlation header.
 *
 * How this is achieved WITHOUT touching the closed domain modules: the domain
 * routers already emit a uniform internal error shape
 * `{ok:false, error:"<code>", ...extras}` (extras such as `issues`, `detail`
 * or `format`; never secrets — the core's issue strings carry variable names
 * and expectations only). `translateErrorResponse` re-envelopes those bodies
 * at the deployment seam: the `error` string becomes the envelope's `code`,
 * the message is derived deterministically from the code, `requestId` is the
 * response's `x-request-id`, and every extra field is preserved verbatim at
 * the top level (lossless translation). The internal `ok:false` marker is
 * REPLACED by the envelope (its absence IS the documented error signal; 2xx
 * bodies keep their `ok:true` discipline).
 *
 * Honesty rules:
 * - translation is total but conservative: a 4xx/5xx JSON body is re-enveloped
 *   ONLY when it is a record with `ok === false` and a string `error` field
 *   (the shape every existing router emits). Anything else — non-JSON bodies,
 *   unknown JSON shapes, unparseable bodies — passes through UNCHANGED (never
 *   mangle what we do not understand);
 * - statuses and headers (content-type, x-request-id, allow, …) are preserved
 *   exactly;
 * - messages are derived from codes by `humanizeCode` (deterministic: snake
 *   case → capitalized sentence), never from error values, so no credential
 *   material can leak through them;
 * - runtime-originated errors (seam-level failures) use `errorResponse`, which
 *   builds the envelope directly.
 *
 * Determinism: pure functions of (status, body, requestId) — no clock, no
 * randomness, no I/O.
 */

/** The documented error body served by the runtime entry. */
export interface ErrorEnvelopeBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    /** Present on every served envelope (the response's correlation id). */
    readonly requestId?: string;
  };
  /** Preserved extra fields from the internal error shape (issues/detail/…). */
  readonly [extra: string]: unknown;
}

/** Deterministically humanize a stable snake_case error code. */
export function humanizeCode(code: string): string {
  const words = code.split("_").filter((word) => word.length > 0);
  if (words.length === 0) {
    return code;
  }
  const first = words[0]!;
  const sentence = first.charAt(0).toUpperCase() + first.slice(1);
  const text = [sentence, ...words.slice(1)].join(" ");
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** Build a runtime-originated error response in the documented envelope. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  extraHeaders?: Record<string, string>,
): Response {
  const body: ErrorEnvelopeBody = {
    error: { code, message, requestId },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": requestId,
      ...extraHeaders,
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Re-envelope a core error response (status >= 400) into the documented
 * shape. Conservative: anything that is not JSON, or not the internal
 * `{ok:false, error:<string>}` shape, is returned byte-for-byte unchanged.
 */
export async function translateErrorResponse(response: Response): Promise<Response> {
  if (response.status < 400) {
    return response;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return response;
  }
  // The body can be consumed once: read it, then decide.
  let text: string;
  try {
    text = await response.text();
  } catch {
    return response;
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // Unparseable body: pass the original bytes through unchanged.
    return new Response(text, { status: response.status, headers: response.headers });
  }
  if (!isRecord(body) || body["ok"] !== false || typeof body["error"] !== "string") {
    // Not the internal error shape (or already enveloped — `error` would be
    // an object): pass the parsed bytes through unchanged.
    return new Response(text, { status: response.status, headers: response.headers });
  }
  const code = body["error"];
  const requestId = response.headers.get("x-request-id");
  const envelope: { error: { code: string; message: string; requestId?: string }; [extra: string]: unknown } = {
    error: {
      code,
      message: humanizeCode(code),
      ...(requestId === null ? {} : { requestId }),
    },
  };
  for (const [key, value] of Object.entries(body)) {
    if (key === "ok" || key === "error") {
      continue;
    }
    envelope[key] = value;
  }
  return new Response(JSON.stringify(envelope), {
    status: response.status,
    headers: response.headers,
  });
}
