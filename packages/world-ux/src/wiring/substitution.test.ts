/**
 * WORLD-P4 — the SUBSTITUTION LAW proof: the reference and alternate
 * world-station source kits (the fully-alternate substrate seam — the
 * P2 alternate lane kit, the L3 alternate NL/clash/BOQ/replay
 * doubles, the P0-C alternate simulation double) produce the
 * BYTE-IDENTICAL station model over the committed fixtures, and the
 * composition is DETERMINISTIC (byte-identical across repeated runs).
 */

import { describe, expect, test } from "bun:test";
import {
  referenceWorldStationSources,
  alternateWorldStationSources,
} from "./doubles";
import { bindWorldStation } from "./contract";
import { STATION_BINDING_CONTEXT } from "../station/model";
import { canonicalJsonStringify } from "../seam";

describe("the substitution law (law #10)", () => {
  test("the reference and alternate kits produce the BYTE-IDENTICAL station model", () => {
    const reference = bindWorldStation(referenceWorldStationSources(), STATION_BINDING_CONTEXT);
    const alternate = bindWorldStation(alternateWorldStationSources(), STATION_BINDING_CONTEXT);
    expect(reference.ok).toBe(true);
    expect(alternate.ok).toBe(true);
    if (!reference.ok || !alternate.ok) return;
    const referenceJson = canonicalJsonStringify(reference.value);
    const alternateJson = canonicalJsonStringify(alternate.value);
    expect(alternateJson).toBe(referenceJson);
  });

  test("the station identity is substrate-independent (the same 16-hex digest)", () => {
    const reference = bindWorldStation(referenceWorldStationSources(), STATION_BINDING_CONTEXT);
    const alternate = bindWorldStation(alternateWorldStationSources(), STATION_BINDING_CONTEXT);
    if (!reference.ok || !alternate.ok) return;
    expect(alternate.value.stationId).toBe(reference.value.stationId);
  });
});

describe("the determinism law (law #9)", () => {
  test("repeated reference compositions are byte-identical (no clock/randomness drift)", () => {
    const first = bindWorldStation(referenceWorldStationSources(), STATION_BINDING_CONTEXT);
    const second = bindWorldStation(referenceWorldStationSources(), STATION_BINDING_CONTEXT);
    if (!first.ok || !second.ok) return;
    expect(canonicalJsonStringify(second.value)).toBe(canonicalJsonStringify(first.value));
  });

  test("repeated alternate compositions are byte-identical", () => {
    const first = bindWorldStation(alternateWorldStationSources(), STATION_BINDING_CONTEXT);
    const second = bindWorldStation(alternateWorldStationSources(), STATION_BINDING_CONTEXT);
    if (!first.ok || !second.ok) return;
    expect(canonicalJsonStringify(second.value)).toBe(canonicalJsonStringify(first.value));
  });

  test("a context change changes the station identity (composition is honest)", () => {
    const base = bindWorldStation(referenceWorldStationSources(), STATION_BINDING_CONTEXT);
    const other = bindWorldStation(referenceWorldStationSources(), {
      ...STATION_BINDING_CONTEXT,
      scopeLabel: "proj-other-999",
    });
    if (!base.ok || !other.ok) return;
    expect(other.value.stationId).not.toBe(base.value.stationId);
  });
});
