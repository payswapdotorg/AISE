/**
 * The in-memory substitution DOUBLE for the Cesium geospatial port
 * (WORLD-P0-A).
 *
 * The WGS84 site↔geodetic bridge is implemented ANALYTICALLY (a local
 * ENU tangent-plane approximation with the standard WGS84 ellipsoid
 * radii) — deterministic, substrate-free, and the declared reference
 * semantics a real Cesium adapter must match to the declared tolerance.
 * Tileset registration is bookkeeping-only (no streaming).
 */

import type { AnchoringHypothesis } from "@aise/anchoring-contract";
import type { SiteFrame } from "../scene";
import type { SubstrateOutcome } from "../errors";
import { ok, refuse } from "../errors";
import type {
  CesiumGeospatialAdapter,
  GeodeticPosition,
  GeoreferenceVerdict,
  GeospatialCapabilities,
  SiteContextHandle,
  SiteGeoreference,
  TilesetHandle,
  TilesetReference,
} from "./contract";

const PORT = "cesium.double";

/** WGS84 ellipsoid constants (EPSG-defined). */
const WGS84_A = 6378137.0;            // semi-major axis, metres
const WGS84_F = 1 / 298.257223563;    // flattening
const DEG = Math.PI / 180;

/** Prime-vertical radius of curvature at a geodetic latitude (radians). */
function primeVerticalRadius(latRad: number): number {
  const e2 = 2 * WGS84_F - WGS84_F * WGS84_F;
  return WGS84_A / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
}

interface DoubleSiteContext {
  token: string;
  georeference: SiteGeoreference;
  siteFrame: SiteFrame;
  tilesets: Map<string, string>;
}

export class InMemoryGeospatialDouble implements CesiumGeospatialAdapter {
  readonly portId = "cesium.geospatial/1" as const;
  readonly capabilities: GeospatialCapabilities = {
    supportsTilesets: true,
    supportsTerrain: false,
    maxTilesets: 64,
    declaredToleranceMetres: 0.5,
    blocked: [
      { capability: "terrain-streaming", reason: "in-memory double: no streaming — WORLD-P1 protocol" },
      { capability: "globe-rendering", reason: "in-memory double: no GPU — WORLD-P1 protocol" },
    ],
  };

  private contexts = new Map<string, DoubleSiteContext>();
  private nextToken = 1;

  establishSiteContext(
    georeference: SiteGeoreference,
    siteFrame: SiteFrame,
  ): SubstrateOutcome<SiteContextHandle> {
    const lat = georeference.anchor.latitudeDeg;
    const lon = georeference.anchor.longitudeDeg;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return refuse(
        "request_invalid",
        PORT,
        `anchor out of range: lat ${lat}, lon ${lon}`,
      );
    }
    if (!Number.isFinite(georeference.anchor.heightM) || georeference.accuracyMetres < 0) {
      return refuse("request_invalid", PORT, "anchor height/accuracy not finite/positive");
    }
    const token = `geo-${this.nextToken++}`;
    this.contexts.set(token, {
      token,
      georeference,
      siteFrame,
      tilesets: new Map(),
    });
    return ok({ handleKind: "site-context", token });
  }

  resolveGeoreference(
    hypotheses: readonly AnchoringHypothesis[],
    candidate: GeodeticPosition,
  ): SubstrateOutcome<GeoreferenceVerdict> {
    if (hypotheses.length === 0) {
      return ok({
        outcome: "refused",
        georeference: null,
        reason: "input-contract-violation: no hypotheses to derive a georeference from",
      });
    }
    // anchoring-contract outcome semantics: an "anchored" verdict requires
    // every hypothesis to carry inliers; weak evidence degrades to partial
    const allAnchored = hypotheses.every((h) => h.inlierCount > 0);
    const georeference: SiteGeoreference = {
      anchor: candidate,
      accuracyMetres: allAnchored ? 0.3 : 2.0,
      derivedFrom: hypotheses,
    };
    if (allAnchored) {
      return ok({ outcome: "anchored", georeference, reason: null });
    }
    return ok({
      outcome: "partial",
      georeference,
      reason: "insufficient-inliers: at least one hypothesis carries zero inliers",
    });
  }

  private ctx(handle: SiteContextHandle): DoubleSiteContext | null {
    return this.contexts.get(handle.token) ?? null;
  }

  siteToGeodetic(
    handle: SiteContextHandle,
    point: readonly [number, number, number],
  ): SubstrateOutcome<GeodeticPosition> {
    const ctx = this.ctx(handle);
    if (!ctx) return refuse("request_invalid", PORT, "unknown site context handle");
    // local ENU approximation about the anchor, using the ellipsoid radii
    const latRad = ctx.georeference.anchor.latitudeDeg * DEG;
    const Rn = primeVerticalRadius(latRad);
    const Rm = (Rn * (1 - (2 * WGS84_F - WGS84_F * WGS84_F))) || Rn * 0.9966;
    const dLat = (point[1] / Rm) / DEG;
    const dLon = (point[0] / (Rn * Math.cos(latRad))) / DEG;
    return ok({
      latitudeDeg: ctx.georeference.anchor.latitudeDeg + dLat,
      longitudeDeg: ctx.georeference.anchor.longitudeDeg + dLon,
      heightM: ctx.georeference.anchor.heightM + point[2],
    });
  }

  geodeticToSite(
    handle: SiteContextHandle,
    position: GeodeticPosition,
  ): SubstrateOutcome<readonly [number, number, number]> {
    const ctx = this.ctx(handle);
    if (!ctx) return refuse("request_invalid", PORT, "unknown site context handle");
    const latRad = ctx.georeference.anchor.latitudeDeg * DEG;
    const Rn = primeVerticalRadius(latRad);
    const Rm = (Rn * (1 - (2 * WGS84_F - WGS84_F * WGS84_F))) || Rn * 0.9966;
    const dLat = position.latitudeDeg - ctx.georeference.anchor.latitudeDeg;
    const dLon = position.longitudeDeg - ctx.georeference.anchor.longitudeDeg;
    return ok([
      dLon * DEG * Rn * Math.cos(latRad),
      dLat * DEG * Rm,
      position.heightM - ctx.georeference.anchor.heightM,
    ]);
  }

  registerTileset(
    handle: SiteContextHandle,
    reference: TilesetReference,
  ): SubstrateOutcome<TilesetHandle> {
    const ctx = this.ctx(handle);
    if (!ctx) return refuse("request_invalid", PORT, "unknown site context handle");
    if (!this.capabilities.supportsTilesets) {
      return refuse("unsupported_operation", PORT, "tilesets not supported by this adapter");
    }
    const max = this.capabilities.maxTilesets;
    if (max !== null && ctx.tilesets.size >= max) {
      return refuse("substrate_capacity_exceeded", PORT, `tileset capacity ${max} reached`);
    }
    if (ctx.tilesets.has(reference.tilesetId)) {
      return refuse("request_invalid", PORT, `tileset already registered: ${reference.tilesetId}`);
    }
    const token = `tileset-${this.nextToken++}`;
    ctx.tilesets.set(reference.tilesetId, token);
    return ok({ handleKind: "tileset", tilesetId: reference.tilesetId, token });
  }

  releaseTileset(handle: SiteContextHandle, tileset: TilesetHandle): SubstrateOutcome<null> {
    const ctx = this.ctx(handle);
    if (!ctx) return refuse("request_invalid", PORT, "unknown site context handle");
    if (!ctx.tilesets.has(tileset.tilesetId)) {
      return refuse("asset_not_found", PORT, `unknown tileset: ${tileset.tilesetId}`, tileset.tilesetId);
    }
    ctx.tilesets.delete(tileset.tilesetId);
    return ok(null);
  }
}
