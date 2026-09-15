/**
 * PROD-004 — session token tests (HMAC mint/verify, tamper, expiry).
 *
 * Determinism: fixed secrets, fixed `now`s — pure functions under test.
 */

import { describe, expect, test } from "bun:test";
import { mintSessionToken, verifySessionToken } from "./token";

const SECRET = "test-auth-secret-fixed-for-tests";
const OTHER_SECRET = "a-completely-different-secret";
const SESSION_ID = "sess-abc123def456";
const EXPIRY_MS = 1_800_000_000_000; // 2027-01-15T06:40:00.000Z

describe("token round-trip", () => {
  test("a minted token verifies and carries ONLY id + expiry", () => {
    const token = mintSessionToken(SECRET, SESSION_ID, EXPIRY_MS);
    expect(token.startsWith("v1.")).toBe(true);
    const verification = verifySessionToken(SECRET, token, EXPIRY_MS - 1);
    expect(verification).toEqual({
      ok: true,
      payload: { sessionId: SESSION_ID, expiresAtMs: EXPIRY_MS },
    });
  });

  test("minting is deterministic: same inputs → byte-identical token", () => {
    expect(mintSessionToken(SECRET, SESSION_ID, EXPIRY_MS)).toBe(
      mintSessionToken(SECRET, SESSION_ID, EXPIRY_MS),
    );
  });

  test("different secrets produce different signatures for the same payload", () => {
    expect(mintSessionToken(SECRET, SESSION_ID, EXPIRY_MS)).not.toBe(
      mintSessionToken(OTHER_SECRET, SESSION_ID, EXPIRY_MS),
    );
  });

  test("verification under the wrong secret fails closed (bad_signature)", () => {
    const token = mintSessionToken(SECRET, SESSION_ID, EXPIRY_MS);
    expect(verifySessionToken(OTHER_SECRET, token, EXPIRY_MS - 1)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });
});

describe("token shape and tamper rejection", () => {
  test("not a 4-segment token → malformed_token", () => {
    for (const junk of ["", "v1", "v1.only-two", "plain-junk", "v1.a.b.c.d"]) {
      expect(verifySessionToken(SECRET, junk, 0)).toEqual({
        ok: false,
        reason: "malformed_token",
      });
    }
  });

  test("wrong prefix version → malformed_token", () => {
    const token = mintSessionToken(SECRET, SESSION_ID, EXPIRY_MS);
    expect(verifySessionToken(SECRET, `v2${token.slice(2)}`, 0)).toEqual({
      ok: false,
      reason: "malformed_token",
    });
  });

  test("tampering with the session id invalidates the signature", () => {
    const token = mintSessionToken(SECRET, SESSION_ID, EXPIRY_MS);
    const parts = token.split(".");
    parts[1] = "sess-tampered";
    expect(verifySessionToken(SECRET, parts.join("."), 0)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  test("tampering with the expiry invalidates the signature", () => {
    const token = mintSessionToken(SECRET, SESSION_ID, EXPIRY_MS);
    const parts = token.split(".");
    parts[2] = String(EXPIRY_MS + 3_600_000);
    expect(verifySessionToken(SECRET, parts.join("."), 0)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  test("a non-hex / wrong-length signature → malformed_token", () => {
    const token = mintSessionToken(SECRET, SESSION_ID, EXPIRY_MS);
    const parts = token.split(".");
    parts[3] = "zz".repeat(32); // 64 chars, not hex
    expect(verifySessionToken(SECRET, parts.join("."), 0)).toEqual({
      ok: false,
      reason: "malformed_token",
    });
    parts[3] = "abcd";
    expect(verifySessionToken(SECRET, parts.join("."), 0)).toEqual({
      ok: false,
      reason: "malformed_token",
    });
  });

  test("a non-numeric expiry segment → malformed_token", () => {
    const token = mintSessionToken(SECRET, SESSION_ID, EXPIRY_MS);
    const parts = token.split(".");
    parts[2] = "not-a-number";
    expect(verifySessionToken(SECRET, parts.join("."), 0)).toEqual({
      ok: false,
      reason: "malformed_token",
    });
  });

  test("an empty session id → malformed_token", () => {
    const token = mintSessionToken(SECRET, "", EXPIRY_MS);
    expect(verifySessionToken(SECRET, token, 0)).toEqual({
      ok: false,
      reason: "malformed_token",
    });
  });
});

describe("token expiry", () => {
  test("a token is valid UP TO (exclusive) its expiry", () => {
    const token = mintSessionToken(SECRET, SESSION_ID, EXPIRY_MS);
    expect(verifySessionToken(SECRET, token, EXPIRY_MS - 1).ok).toBe(true);
    expect(verifySessionToken(SECRET, token, EXPIRY_MS)).toEqual({
      ok: false,
      reason: "expired_token",
    });
    expect(verifySessionToken(SECRET, token, EXPIRY_MS + 1).ok).toBe(false);
  });

  test("expiry is rejected BEFORE any store could be consulted (fail-closed)", () => {
    const token = mintSessionToken(SECRET, SESSION_ID, 1_000);
    // A fixed far-future `now` (2100-01-01) — the injected-clock discipline,
    // never the wall clock; the outcome is time-independent by construction.
    expect(verifySessionToken(SECRET, token, 4_102_444_800_000)).toEqual({
      ok: false,
      reason: "expired_token",
    });
  });
});
