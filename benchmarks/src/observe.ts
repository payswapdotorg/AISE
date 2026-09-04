/**
 * Deterministic observed-value extraction (AISE-022): the
 * benchmark's view of the reconstruction output.
 *
 * The observable is the INGESTED Reality Graph (the full
 * AISE-008→010→011 chain output — the "model" the benchmark
 * scores), never the raw scene: AC-131 scores
 * model/reconstruction changes end-to-end.
 *
 * Extraction is pure and fail-closed:
 *
 * - counts come from the graph's objects (canonical order
 *   irrelevant — counting is order-invariant);
 * - dimensions/elevations come from the objects' structured
 *   geometry quantities, converted EXACTLY to SI metres (the
 *   units mirror table);
 * - an observable that does not exist (e.g. no door extracted)
 *   is MISSING — reported honestly, never silently skipped and
 *   never fabricated;
 * - the extractor never writes anything: the graph is the
 *   canonical authority's content, the benchmark only reads.
 */
import type { RealityModelGraph, RealityObject } from "@aise/engineering-model";
import { lengthToSiMeters } from "./units.js";
import type { MetricObservable } from "./cases.js";

/** An observed value: present (SI metres / a count) or missing. */
export interface Observation {
  readonly value?: number;
  readonly present: boolean;
  /** Where the value came from (machine-readable observability). */
  readonly source: string;
}

/** Observes every metric observable of one ingested graph. */
export function observeGraph(graph: RealityModelGraph): Readonly<Record<MetricObservable, Observation>> {
  const byClass = new Map<string, RealityObject[]>();
  for (const object of graph.objects) {
    const list = byClass.get(object.objectClass) ?? [];
    list.push(object);
    byClass.set(object.objectClass, list);
  }

  const floor = soleObject(byClass, "FLOOR");
  const ceiling = soleObject(byClass, "CEILING");
  const door = soleObject(byClass, "DOOR");
  const window = soleObject(byClass, "WINDOW");
  const walls = byClass.get("WALL") ?? [];

  const space = graph.spaces[0];
  const roomHeight = (space?.properties ?? []).find((assertion) => assertion.key === "roomHeight");

  const observation: Record<MetricObservable, Observation> = {
    "count:FLOOR": countOf(byClass, "FLOOR"),
    "count:CEILING": countOf(byClass, "CEILING"),
    "count:WALL": countOf(byClass, "WALL"),
    "count:DOOR": countOf(byClass, "DOOR"),
    "count:WINDOW": countOf(byClass, "WINDOW"),
    "floor-width": quantityOf(floor, "width", "floor.width"),
    "floor-depth": quantityOf(floor, "height", "floor.height"),
    "ceiling-elevation": quantityOf(ceiling, "elevation", "ceiling.elevation"),
    "room-height": {
      ...(roomHeight?.quantity !== undefined
        ? { value: lengthToSiMeters(roomHeight.quantity.value, roomHeight.quantity.unit), present: true }
        : { present: false }),
      source: "space.roomHeight",
    },
    "door-width": quantityOf(door, "width", "door.width"),
    "door-height": quantityOf(door, "height", "door.height"),
    "window-width": quantityOf(window, "width", "window.width"),
    "window-height": quantityOf(window, "height", "window.height"),
    "window-sill": quantityOf(window, "sillHeight", "window.sillHeight"),
    "wall-height": {
      ...(walls.length > 0
        ? { value: Math.max(...walls.map((wall) => quantityOf(wall, "height", "wall.height").value ?? Number.NEGATIVE_INFINITY)), present: true }
        : { present: false }),
      source: "max(wall.height)",
    },
  };
  return observation;
}

function countOf(byClass: Map<string, RealityObject[]>, objectClass: string): Observation {
  const list = byClass.get(objectClass) ?? [];
  return { value: list.length, present: true, source: `count(${objectClass})` };
}

/**
 * The sole object of a class, or undefined when the class is
 * absent. When a class carries MULTIPLE objects (fragmentation —
 * e.g. the outlier room's six walls), the sole-object observables
 * (floor/door/window dimensions) are read from the FIRST object
 * in canonical order and the fragmentation itself is surfaced by
 * the count metrics — the observation stays deterministic and
 * the degradation is visible where it belongs.
 */
function soleObject(byClass: Map<string, RealityObject[]>, objectClass: string): RealityObject | undefined {
  const list = byClass.get(objectClass);
  return list !== undefined && list.length > 0 ? list[0] : undefined;
}

/** Reads one geometry quantity (exact SI conversion; missing when absent). */
function quantityOf(
  object: RealityObject | undefined,
  field: "width" | "height" | "elevation" | "sillHeight",
  source: string,
): Observation {
  const quantity =
    field === "width"
      ? object?.geometry?.structured?.width
      : field === "height"
        ? object?.geometry?.structured?.height
        : field === "elevation"
          ? object?.geometry?.structured?.elevation
          : object?.geometry?.structured?.sillHeight;
  if (quantity === undefined || object === undefined) {
    return { present: false, source };
  }
  return { value: lengthToSiMeters(quantity.value, quantity.unit), present: true, source };
}
