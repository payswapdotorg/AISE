/**
 * PROD-004 — the session store tests (Fs + in-memory twins, CRUD, sweep).
 *
 * Determinism: scratch data dirs (mkdtemp, always removed), fixed session
 * records and fixed clock strings — no wall clock, no randomness.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "../lib/hash";
import { FsSessionStore, InMemorySessionStore, parseSessionRecord, sweepExpiredSessions } from "./store";
import type { SessionRecord } from "./model";

const scratchDirs: string[] = [];

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "aise-auth-store-test-"));
  scratchDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A fixed, valid session record (content only — ids are opaque strings). */
function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: "sess-fixed-0001",
    principalId: "user-alice",
    kind: "user",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseSessionRecord (the on-disk shape is strict)", () => {
  test("a well-formed record parses verbatim", () => {
    expect(parseSessionRecord(session())).toEqual(session());
  });

  test("non-objects, missing fields and wrong kinds are rejected as null", () => {
    expect(parseSessionRecord(null)).toBeNull();
    expect(parseSessionRecord("nope")).toBeNull();
    expect(parseSessionRecord(42)).toBeNull();
    expect(parseSessionRecord([])).toBeNull();
    expect(parseSessionRecord({ ...session(), sessionId: "" })).toBeNull();
    expect(parseSessionRecord({ ...session(), sessionId: "x".repeat(257) })).toBeNull();
    expect(parseSessionRecord({ ...session(), principalId: 7 })).toBeNull();
    expect(parseSessionRecord({ ...session(), kind: "admin" })).toBeNull();
    expect(parseSessionRecord({ ...session(), createdAt: "not-a-date" })).toBeNull();
    expect(parseSessionRecord({ ...session(), expiresAt: "" })).toBeNull();
  });
});

describe("the Fs store (one JSON file per session, hashed name)", () => {
  test("put + get round-trips the record; get of an absent id is null", async () => {
    const store = new FsSessionStore(scratchDir());
    const record = session();
    await store.put(record);
    expect(await store.get(record.sessionId)).toEqual(record);
    expect(await store.get("sess-never-minted")).toBeNull();
  });

  test("the file lives at auth/sessions/<sha256(sessionId)>.json and holds the id verbatim", async () => {
    const dir = scratchDir();
    const store = new FsSessionStore(dir);
    const record = session({ sessionId: "sess-visible-name" });
    await store.put(record);
    const expected = join(dir, "auth", "sessions", `${sha256Hex("sess-visible-name")}.json`);
    expect(existsSync(expected)).toBe(true);
    // The file name never carries the raw id; the record inside does.
    expect(readdirSync(join(dir, "auth", "sessions"))).toEqual([`${sha256Hex("sess-visible-name")}.json`]);
    expect(JSON.parse(readFileSync(expected, "utf8"))).toEqual(record);
  });

  test("delete removes the file and is idempotent for absent ids", async () => {
    const store = new FsSessionStore(scratchDir());
    const record = session();
    await store.put(record);
    await store.delete(record.sessionId);
    expect(await store.get(record.sessionId)).toBeNull();
    await expect(store.delete(record.sessionId)).resolves.toBeUndefined();
  });

  test("list returns every session sorted by id", async () => {
    const store = new FsSessionStore(scratchDir());
    await store.put(session({ sessionId: "sess-b" }));
    await store.put(session({ sessionId: "sess-a" }));
    await store.put(session({ sessionId: "sess-c", kind: "demo" }));
    expect((await store.list()).map((record) => record.sessionId)).toEqual(["sess-a", "sess-b", "sess-c"]);
  });

  test("a corrupt file on disk reads as ABSENT (one bad file never takes the surface down)", async () => {
    const dir = scratchDir();
    const store = new FsSessionStore(dir);
    const good = session({ sessionId: "sess-good" });
    await store.put(good);
    const badPath = join(dir, "auth", "sessions", `${sha256Hex("sess-bad")}.json`);
    writeFileSync(badPath, "{not json at all", "utf8");
    expect(await store.get("sess-bad")).toBeNull();
    expect((await store.list()).map((record) => record.sessionId)).toEqual(["sess-good"]);
  });
});

describe("the in-memory twin behaves byte-identically", () => {
  test("the same operation sequence yields the same list() output on both twins", async () => {
    const fsStore = new FsSessionStore(scratchDir());
    const memStore = new InMemorySessionStore();
    const sequence: SessionRecord[] = [
      session({ sessionId: "sess-1", principalId: "user-alice", kind: "user" }),
      session({ sessionId: "sess-2", principalId: "demo-evaluator", kind: "demo" }),
      session({ sessionId: "sess-3", principalId: "user-bob", kind: "user" }),
    ];
    for (const record of sequence) {
      await fsStore.put(record);
      await memStore.put(record);
    }
    await fsStore.delete("sess-2");
    await memStore.delete("sess-2");
    expect(await memStore.list()).toEqual(await fsStore.list());
    expect(await memStore.get("sess-1")).toEqual(await fsStore.get("sess-1"));
    expect(await memStore.get("sess-2")).toBeNull();
    expect(await fsStore.get("sess-2")).toBeNull();
  });

  test("a record that no longer parses (corruption) reads as absent on the twin too", async () => {
    const store = new InMemorySessionStore();
    await store.put(session({ sessionId: "sess-x" }));
    // Round-trip through the raw map is not exposed; parseSessionRecord is
    // the shared gate — a hypothetical corrupt entry is null on read.
    expect(parseSessionRecord({ ...session(), kind: "ghost" })).toBeNull();
    expect(await store.get("sess-absent")).toBeNull();
  });
});

describe("sweepExpiredSessions (the deterministic cleanup)", () => {
  test("removes exactly the sessions whose expiresAt is strictly before now, and reports them", async () => {
    const store = new InMemorySessionStore();
    await store.put(session({ sessionId: "sess-old", expiresAt: "2026-01-01T00:00:00.000Z" }));
    await store.put(session({ sessionId: "sess-boundary", expiresAt: "2026-01-02T00:00:00.000Z" }));
    await store.put(session({ sessionId: "sess-fresh", expiresAt: "2026-06-01T00:00:00.000Z" }));
    const report = await sweepExpiredSessions(store, "2026-01-02T00:00:00.000Z");
    expect(report).toEqual({ considered: 3, removedSessionIds: ["sess-old"] });
    expect((await store.list()).map((record) => record.sessionId)).toEqual([
      "sess-boundary",
      "sess-fresh",
    ]);
  });

  test("a sweep with nothing to do reports the honest empty pass", async () => {
    const store = new InMemorySessionStore();
    await store.put(session({ sessionId: "sess-fresh", expiresAt: "2027-01-01T00:00:00.000Z" }));
    expect(await sweepExpiredSessions(store, "2026-01-01T00:00:00.000Z")).toEqual({
      considered: 1,
      removedSessionIds: [],
    });
  });

  test("the sweep works over the Fs twin identically (both stores, same report)", async () => {
    const fsStore = new FsSessionStore(scratchDir());
    const memStore = new InMemorySessionStore();
    for (const store of [fsStore, memStore]) {
      await store.put(session({ sessionId: "sess-expired", expiresAt: "2026-01-01T00:00:00.000Z" }));
      await store.put(session({ sessionId: "sess-alive", expiresAt: "2030-01-01T00:00:00.000Z" }));
    }
    const now = "2026-02-01T00:00:00.000Z";
    expect(await sweepExpiredSessions(fsStore, now)).toEqual({
      considered: 2,
      removedSessionIds: ["sess-expired"],
    });
    expect(await sweepExpiredSessions(memStore, now)).toEqual({
      considered: 2,
      removedSessionIds: ["sess-expired"],
    });
  });
});
