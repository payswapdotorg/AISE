/**
 * `@aise/world-reality-substrate` — CesiumJS geospatial context adapter
 * CONTRACT (WORLD-P0-A).
 *
 * The port for WGS84 site context and 3D Tiles delivery: placing the AISE
 * site frame on the ellipsoid, bridging site-frame coordinates ↔
 * geodetic coordinates, and streaming photogrammetry/terrain tilesets.
 *
 * ANCHORING LAW: this adapter MAPS TO the existing
 * `@aise/anchoring-contract` interfaces — it does NOT redefine anchoring
 * vocabulary. Georeferencing verdicts reuse `AnchoringOutcome`
 * ("anchored" | "partial" | "refused"); a site georeference established
 * from still-anchoring evidence consumes `AnchoringHypothesis` inputs
 * verbatim. Cesium entity ids never become canonical AISE identity.
 *
 * Coordinate law: the site↔geodetic bridge is analytic and closed-form
 * (WGS84 ellipsoid, standard geodetic formulas) so the substitution
 * double implements it EXACTLY — a real Cesium adapter must agree with
 * the double to declared tolerance or it is not conformant (substitution
 * law 2: tolerances are declared, never implicit).
 */

import type { AnchoringHypothesis, AnchoringOutcome } from "@aise/anchoring-contract";
import type { SiteFrame } from "../scene";
import type { SubstrateOutcome } from "../errors";

/** WGS84 geodetic position (degrees, degrees, metres above ellipsoid). */
export interface GeodeticPosition {
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly heightM: number;
}

/** The WGS84 placement of the AISE site frame on the ellipsoid. */
export interface SiteGeoreference {
  /** Where the site-frame origin sits, geodetically. */
  readonly anchor: GeodeticPosition;
  /** Declared horizontal accuracy of the anchor (metres, 1-sigma). */
  readonly accuracyMetres: number;
  /** Anchoring evidence the georeference was derived from (verbatim inputs). */
  readonly derivedFrom: readonly AnchoringHypothesis[];
}

/** Opaque handle to an established site context. */
export interface SiteContextHandle {
  readonly handleKind: "site-context";
  readonly token: string;
}

/** A 3D Tiles tileset reference (opaque delivery contract). */
export interface TilesetReference {
  /** AISE-owned tileset identity (content-addressed or registered id). */
  readonly tilesetId: string;
  /** Declared content type of the stream the adapter will consume. */
  readonly contentType: "3d-tiles/1.1" | "3d-tiles/1.0";
  /** Byte size when known, else null (streamed sets may be unbounded). */
  readonly declaredByteSize: number | null;
}

/** Opaque handle to a registered tileset. */
export interface TilesetHandle {
  readonly handleKind: "tileset";
  readonly tilesetId: string;
  readonly token: string;
}

/** Verdict of a georeference establishment (reuses anchoring vocabulary). */
export interface GeoreferenceVerdict {
  readonly outcome: AnchoringOutcome;
  /**
   * The established georeference when outcome is "anchored"; the usable
   * partial georeference when "partial"; null when "refused".
   */
  readonly georeference: SiteGeoreference | null;
  /** Machine-readable reason on partial/refused (anchoring reason codes). */
  readonly reason: string | null;
}

/** Capabilities of a geospatial adapter implementation. */
export interface GeospatialCapabilities {
  readonly supportsTilesets: boolean;
  readonly supportsTerrain: boolean;
  readonly maxTilesets: number | null;
  readonly declaredToleranceMetres: number;
  readonly blocked: readonly { readonly capability: string; readonly reason: string }[];
}

/**
 * The CesiumJS geospatial port. Implementations wrap CesiumJS — or the
 * in-memory substitution double (../double.ts), whose analytic WGS84
 * bridge is the declared reference semantics.
 */
export interface CesiumGeospatialAdapter {
  readonly portId: "cesium.geospatial/1";
  readonly capabilities: GeospatialCapabilities;

  /** Establish the site context (georeference + site frame correspondence). */
  establishSiteContext(
    georeference: SiteGeoreference,
    siteFrame: SiteFrame,
  ): SubstrateOutcome<SiteContextHandle>;

  /** Resolve a georeference from anchoring evidence (anchoring-contract vocab). */
  resolveGeoreference(
    hypotheses: readonly AnchoringHypothesis[],
    candidate: GeodeticPosition,
  ): SubstrateOutcome<GeoreferenceVerdict>;

  /** Site-frame point (metres) → geodetic position. */
  siteToGeodetic(
    handle: SiteContextHandle,
    point: readonly [number, number, number],
  ): SubstrateOutcome<GeodeticPosition>;

  /** Geodetic position → site-frame point (metres). */
  geodeticToSite(
    handle: SiteContextHandle,
    position: GeodeticPosition,
  ): SubstrateOutcome<readonly [number, number, number]>;

  /** Register a 3D Tiles tileset for streaming into the world. */
  registerTileset(
    handle: SiteContextHandle,
    reference: TilesetReference,
  ): SubstrateOutcome<TilesetHandle>;

  /** Release a tileset. */
  releaseTileset(handle: SiteContextHandle, tileset: TilesetHandle): SubstrateOutcome<null>;
}
