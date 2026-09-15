/**
 * PROD-004 — HMAC-signed opaque session tokens.
 *
 * THE TOKEN CONTRACT (the loud parts):
 *
 *  - A token is `v1.<sessionId>.<expiresAtMs>.<hmac>` where `hmac` is the
 *    hex HMAC-SHA256 of `v1.<sessionId>.<expiresAtMs>` under the server's
 *    AUTH_SECRET (node:crypto — runtime-neutral across Bun and Node, per
 *    the lib/hash.ts discipline).
 *  - The token carries ONLY a session id and an expiry — NO principal data,
 *    NO claims, NO client-visible state. Everything else lives in the
 *    server-side session store (`store.ts`).
 *  - Verification is fail-closed and side-channel aware: the signature is
 *    compared with `timingSafeEqual` (length-guarded — never a plain
 *    `===` on attacker-controlled bytes), and a token whose embedded expiry
 *    has passed is rejected as `expired_token` BEFORE any store lookup.
 *  - Tokens are single-purpose opaque strings; the format is internal and
 *    may change with a version prefix bump (hence `v1.`).
 *
 * Determinism: pure functions of (secret, sessionId, expiry, token, now) —
 * no clock, no randomness. Tests use fixed secrets and fixed `now`s.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { TokenVerification } from "./model";

const TOKEN_PREFIX = "v1";
const TOKEN_SEGMENT_COUNT = 4;
/** The signature segment's exact shape: 64 lowercase hex chars (sha-256). */
const HEX_64 = /^[0-9a-f]{64}$/;

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/**
 * Mint a session token. The expiry is epoch MILLISECONDS (an integer); the
 * caller derives it from the session record's `expiresAt`.
 */
export function mintSessionToken(secret: string, sessionId: string, expiresAtMs: number): string {
  const payload = `${TOKEN_PREFIX}.${sessionId}.${String(expiresAtMs)}`;
  return `${payload}.${hmacHex(secret, payload)}`;
}

/** Constant-time equality of two same-length hex strings (false on length mismatch). */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Verify a presented token: shape → signature → expiry. Returns the
 * materialized payload on success or the precise rejection reason
 * (malformed | bad_signature | expired_token). NEVER throws.
 */
export function verifySessionToken(
  secret: string,
  token: string,
  nowMs: number,
): TokenVerification {
  const segments = token.split(".");
  if (segments.length !== TOKEN_SEGMENT_COUNT || segments[0] !== TOKEN_PREFIX) {
    return { ok: false, reason: "malformed_token" };
  }
  const sessionId = segments[1] ?? "";
  const expiryText = segments[2] ?? "";
  const signature = segments[3] ?? "";
  if (sessionId.length < 1 || !/^\d+$/.test(expiryText) || !HEX_64.test(signature)) {
    return { ok: false, reason: "malformed_token" };
  }
  const payload = `${TOKEN_PREFIX}.${sessionId}.${expiryText}`;
  if (!safeEqualHex(hmacHex(secret, payload), signature)) {
    return { ok: false, reason: "bad_signature" };
  }
  const expiresAtMs = Number.parseInt(expiryText, 10);
  if (!Number.isSafeInteger(expiresAtMs)) {
    return { ok: false, reason: "malformed_token" };
  }
  if (nowMs >= expiresAtMs) {
    // Expired at the boundary: a token is valid UP TO (exclusive) its expiry.
    return { ok: false, reason: "expired_token" };
  }
  return { ok: true, payload: { sessionId, expiresAtMs } };
}
