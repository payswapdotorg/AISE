/**
 * `@aise/world-scene-runtime` — the public barrel (WORLD-P5 Mount 1).
 *
 * The REAL Babylon.js occupant of the WORLD-P0-A scene-runtime port.
 * The surface is substrate-neutral: `createBabylonSceneRuntime`
 * returns a `BabylonSceneRuntimeAdapter` typed over AISE types only.
 */

export type {
  SceneEngineSelection,
  GeometryResolver,
  BabylonRuntimeOptions,
  BabylonSceneRuntime,
  SceneRendererInfo,
  SceneFrameStats,
} from "./adapter";
export { createBabylonSceneRuntime, GHOST_MATERIAL_SPEC } from "./adapter";
export {
  isIngestedMeshGeometry,
  ingestedBoxViolations,
  type IngestedBoxGeometry,
  type IngestedMeshGeometry,
} from "./geometry";
