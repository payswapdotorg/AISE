/**
 * The AISE web session (AISE-015): HMAC-SHA256 signed,
 * HttpOnly, SameSite=Lax cookie sessions.
 *
 * Discipline:
 *
 * - **No credential storage in the browser**: the session token
 *   is a server-signed value (`user|expiry|hmac`); the browser
 *   only ever holds the opaque signed cookie (HttpOnly — not
 *   readable from scripts).
 * - **Timing-safe verification everywhere** (`timingSafeEqual`);
 * - **Fail closed**: a tampered token, a wrong signature, an
 *   expired session or an empty production secret all verify as
 *   "not authenticated";
 * - **Constant-shape tokens**: no ambient state, no randomness
 *   in the verification path (the HMAC is deterministic over the
 *   token content; sessions minted at different seconds differ
 *   by content only).
 *
 * v1 known limitation (documented): single demo user,
 * env-configured credentials — the identity provider arrives
 * with the enterprise integration stage.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebConfig } from "./config.js";

/** The cookie name the session travels in. */
export const SESSION_COOKIE = "aise_session";

/** One verified session (the server's view of the caller). */
export interface Session {
  readonly user: string;
  /** Expiry as epoch seconds. */
  readonly expiresAtSec: number;
}

/** Mints the signed session token for a user. */
export function mintSessionToken(config: WebConfig, user: string, nowSec: number): string {
  const expiresAtSec = nowSec + config.sessionTtlSeconds;
  const payload = `${user}|${expiresAtSec}`;
  const signature = sign(config.sessionSecret, payload);
  return `${payload}|${signature}`;
}

/** Verifies a session token (fail closed; timing-safe). */
export function verifySessionToken(config: WebConfig, token: string | undefined, nowSec: number): Session | undefined {
  if (token === undefined || token.length === 0) {
    return undefined;
  }
  if (config.sessionSecret.length === 0) {
    // Production without a configured secret: no session can be
    // trusted — fail closed rather than minting unsigned trust.
    return undefined;
  }
  const parts = token.split("|");
  if (parts.length !== 3) {
    return undefined;
  }
  const [user, expiresRaw, signature] = parts as [string, string, string];
  if (user.length === 0 || !/^\d+$/.test(expiresRaw)) {
    return undefined;
  }
  const expiresAtSec = Number(expiresRaw);
  if (expiresAtSec <= nowSec) {
    return undefined;
  }
  const expected = sign(config.sessionSecret, `${user}|${expiresRaw}`);
  if (!safeEqual(expected, signature)) {
    return undefined;
  }
  return { user, expiresAtSec };
}

/** Timing-safe credential comparison (both fields). */
export function credentialsMatch(config: WebConfig, user: string, passphrase: string): boolean {
  return safeEqual(config.demoUser, user) && safeEqual(config.demoPassphrase, passphrase);
}

/** The Set-Cookie attributes for the session cookie. */
export function sessionCookieAttributes(config: WebConfig): string {
  const maxAge = config.sessionTtlSeconds;
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

/** The Set-Cookie header value for clearing the session. */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/** Timing-safe string equality with fixed-length padding. */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(pad(a), pad(b));
}

/** Pads to a fixed buffer length (timing-safe requires equal lengths). */
function pad(value: string): Buffer {
  const target = 128;
  const buffer = Buffer.alloc(target, 0x20);
  buffer.write(value.slice(0, target), 0, "utf8");
  return buffer;
}

/** Reads the session of a Request (cookie header → verified session). */
export function sessionFromRequest(config: WebConfig, request: Request, nowSec: number): Session | undefined {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  return verifySessionToken(config, token, nowSec);
}

/** Extracts one cookie value from a cookie header (no dependencies). */
export function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq > 0 && trimmed.slice(0, eq) === name) {
      return trimmed.slice(eq + 1);
    }
  }
  return undefined;
}
