/**
 * The AISE-015 web session suite: signed-cookie discipline.
 */
import { describe, expect, it } from "vitest";
import { loadWebConfig } from "./config";
import {
  SESSION_COOKIE,
  credentialsMatch,
  mintSessionToken,
  readCookie,
  sessionFromRequest,
  verifySessionToken,
} from "./session";

function testConfig() {
  const before = { ...process.env };
  process.env.AISE_WEB_DEMO_USER = "alice";
  process.env.AISE_WEB_DEMO_PASSPHRASE = "correct horse";
  process.env.AISE_WEB_SESSION_SECRET = "test-secret";
  const config = loadWebConfig();
  process.env = before;
  return config;
}

describe("session minting and verification", () => {
  it("round-trips: a minted token verifies as the same user", () => {
    const config = testConfig();
    const token = mintSessionToken(config, "alice", 1000);
    const session = verifySessionToken(config, token, 1001);
    expect(session?.user).toBe("alice");
    expect(session?.expiresAtSec).toBe(1000 + config.sessionTtlSeconds);
  });

  it("expired tokens fail closed", () => {
    const config = testConfig();
    const token = mintSessionToken(config, "alice", 1000);
    const late = 1000 + config.sessionTtlSeconds + 1;
    expect(verifySessionToken(config, token, late)).toBeUndefined();
  });

  it("tampered tokens fail closed (wrong signature, wrong parts, empty)", () => {
    const config = testConfig();
    const token = mintSessionToken(config, "alice", 1000);
    const parts = token.split("|");
    expect(verifySessionToken(config, "alice|9999999999|deadbeef", 1001)).toBeUndefined();
    expect(verifySessionToken(config, `${parts[0]}|${parts[1]}|${"0".repeat(64)}`, 1001)).toBeUndefined();
    expect(verifySessionToken(config, "not-a-token", 1001)).toBeUndefined();
    expect(verifySessionToken(config, "", 1001)).toBeUndefined();
    expect(verifySessionToken(config, undefined, 1001)).toBeUndefined();
  });

  it("a secret rotated under a session invalidates it (HMAC binding)", () => {
    const config = testConfig();
    const token = mintSessionToken(config, "alice", 1000);
    const rotated = { ...config, sessionSecret: "other-secret" };
    expect(verifySessionToken(rotated, token, 1001)).toBeUndefined();
  });

  it("an EMPTY production secret refuses to trust ANY token (fail closed)", () => {
    const noSecret = { ...testConfig(), sessionSecret: "" };
    const token = mintSessionToken({ ...noSecret, sessionSecret: "x" }, "alice", 1000);
    expect(verifySessionToken(noSecret, token, 1001)).toBeUndefined();
    expect(verifySessionToken(noSecret, mintSessionToken(noSecret, "a", 1), 2)).toBeUndefined();
  });

  it("credentials compare timing-safely: only exact matches pass", () => {
    const config = testConfig();
    expect(credentialsMatch(config, "alice", "correct horse")).toBe(true);
    expect(credentialsMatch(config, "alice", "wrong")).toBe(false);
    expect(credentialsMatch(config, "bob", "correct horse")).toBe(false);
    expect(credentialsMatch(config, "", "")).toBe(false);
  });
});

describe("request/session integration", () => {
  it("reads the session cookie from a Request and verifies it", () => {
    const config = testConfig();
    const token = mintSessionToken(config, "alice", 1000);
    const request = new Request("https://aise.test/api/models", {
      headers: { cookie: `${SESSION_COOKIE}=${token}; other=x` },
    });
    const session = sessionFromRequest(config, request, 1001);
    expect(session?.user).toBe("alice");
  });

  it("requests without the cookie are unauthenticated", () => {
    const config = testConfig();
    const request = new Request("https://aise.test/api/models");
    expect(sessionFromRequest(config, request, 1001)).toBeUndefined();
  });

  it("readCookie extracts one value from a cookie header (no dependencies)", () => {
    expect(readCookie("a=1; b=2; c=3", "b")).toBe("2");
    expect(readCookie("a=1", "a")).toBe("1");
    expect(readCookie("a=1", "z")).toBeUndefined();
    expect(readCookie("", "a")).toBeUndefined();
    expect(readCookie("weird", "weird")).toBeUndefined();
  });
});
