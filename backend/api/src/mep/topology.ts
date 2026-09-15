/**
 * AISE-034 — MEP topology validation (typed connectivity rules).
 *
 * DESIGN (work order §034: "topology with uncertainty/evidence"):
 *
 *  - TOPOLOGY IS TYPED: connectivity lives on segments (structural ports
 *    a/b), equipment terminals and typed connections between them. The
 *    validation walk resolves every endpoint reference, then applies a
 *    FIXED check sequence per connection — port class, flow direction,
 *    service, nominal size, voltage class — reporting EVERY violation
 *    (never first-only) and EVERY hop it cannot honestly validate.
 *  - VIOLATIONS ARE TYPED AND NAME BOTH ENDPOINTS: a port connects only to
 *    a compatible port class; diameter/service compatibility is checked and
 *    a violation names both endpoint labels and both values — never a
 *    blanket error, never silent acceptance.
 *  - HONEST INDETERMINACY: `UNKNOWN`, `NOT_OBSERVED` and `OCCLUDED` are
 *    first-class attribute values (model.ts). A check whose inputs are not
 *    established is NOT a violation and NOT silently passed: it is
 *    reported as a typed indeterminate finding naming the endpoint and the
 *    absence kind (an UNKNOWN terminal state makes the hop unvalidatable —
 *    reported as such, never guessed).
 *  - UNCERTAINTY, NOT CONFIDENCE: the nominal-size comparison uses ONLY
 *    the measurement-uncertainty fields (DIMENSIONAL/STATISTICAL ± or
 *    INTERVAL bounds) as conservative value bounds. Confidence values are
 *    never read here — a high confidence can never widen a tolerance.
 *
 *    Nominal-size rule (hand-checkable): with tolerance T,
 *      gap = |d1 − d2| − T.
 *        gap ≤ 0                → compatible (within tolerance).
 *        gap > 0, bounds apart
 *        beyond T               → violation `diameter_mismatch` (no pair of
 *                                 values within the stated bounds is
 *                                 compatible within T).
 *        gap > 0, bounds within
 *        T of touching          → indeterminate `diameter_within_uncertainty`
 *                                 (a nominal mismatch the stated measurement
 *                                 uncertainty can explain — not honestly
 *                                 assertable as a violation).
 *    Bounds per side: no uncertainty → the point [v, v]; DIMENSIONAL or
 *    STATISTICAL plusMinus pm → [v−pm, v+pm]; INTERVAL → [lower, upper].
 *
 *  - DETERMINISM: the walk iterates connections in canonical id order
 *    (UTF-16 code-unit order) regardless of input listing order, applies
 *    checks in a fixed sequence, and emits findings ordered by
 *    (connectionId, check sequence, from-endpoint key, to-endpoint key).
 *    Pure function: the input system is never mutated; the report is
 *    deep-frozen. No clock, no randomness, no I/O.
 *
 *  - COMPONENTS: structural connectivity (union-find over connections
 *    whose endpoints both resolve — including connections that carry
 *    violations and self-connections; a connection is a physical statement
 *    regardless of its compatibility findings). Isolated primitives are
 *    singleton components. Components are reported sorted by their first
 *    member id, with sorted member and connection id lists.
 *
 *  Voltage-class compatibility is checked only where it is an engineering
 *  error: connections whose BOTH endpoints are known port class "power"
 *  (the electrical power class). Signal-class containment has no
 *  module-level voltage rule (documented limitation).
 */

import type {
  AbsenceKind,
  MepConnection,
  MepEndpointRef,
  MepPrimitive,
  MepQuantity,
  MepSegment,
  MepService,
  MepSystem,
  PortClass,
  PresentQuantity,
  SegmentFlow,
  TerminalDirection,
  VoltageClass,
} from "./model";
import { SERVICE_PORT_CLASSES } from "./model";

/* ------------------------------------------------------------------ */
/* Registries (typed, frozen)                                           */
/* ------------------------------------------------------------------ */

/** Every distinct topology violation code (stable API). */
export const TOPOLOGY_VIOLATION_CODES = Object.freeze([
  /** An endpoint reference resolves to no segment port / equipment terminal. */
  "dangling_endpoint",
  /** A connection joins an endpoint to itself. */
  "self_connection",
  /** A resolved endpoint is used by more than one connection. */
  "endpoint_double_connected",
  /** Port classes differ (a port connects only to a compatible class). */
  "port_class_mismatch",
  /** Flow directions are not complementary. */
  "port_direction_mismatch",
  /** Services are not compatible across the connection. */
  "service_mismatch",
  /** Nominal sizes (diameter/width) are incompatible beyond tolerance and bounds. */
  "diameter_mismatch",
  /** Voltage classes differ on a power-class connection. */
  "voltage_class_mismatch",
] as const);
export type TopologyViolationCode = (typeof TOPOLOGY_VIOLATION_CODES)[number];

/** Every distinct honest-indeterminacy code (unvalidatable, not violations). */
export const TOPOLOGY_INDETERMINATE_CODES = Object.freeze([
  /** Port class not established on an endpoint (UNKNOWN/NOT_OBSERVED/OCCLUDED). */
  "port_class_indeterminate",
  /** Direction not established on an endpoint. */
  "port_direction_indeterminate",
  /** Service not established on an endpoint. */
  "service_indeterminate",
  /** Nominal size not established on an endpoint. */
  "diameter_indeterminate",
  /** Nominal mismatch within stated measurement uncertainty. */
  "diameter_within_uncertainty",
  /** Voltage class not established on a power connection. */
  "voltage_class_indeterminate",
] as const);
export type TopologyIndeterminateCode = (typeof TOPOLOGY_INDETERMINATE_CODES)[number];

/**
 * Nominal-size match tolerance in mm: sizes whose nominal difference is at
 * most this far apart are compatible (named constant — never a confidence
 * value, never per-call configuration; changing it is a governed change).
 */
export const DIAMETER_MATCH_TOLERANCE_MM = 1;

/* ------------------------------------------------------------------ */
/* Report types                                                         */
/* ------------------------------------------------------------------ */

/** Fields shared by violations and indeterminate findings. */
export interface TopologyFindingBase {
  readonly connectionId: string;
  readonly from: MepEndpointRef;
  readonly to: MepEndpointRef;
  /** Names both endpoints (and both values where applicable) — deterministic. */
  readonly detail: string;
}

/** A typed topology violation (names both endpoints). */
export interface TopologyViolation extends TopologyFindingBase {
  readonly code: TopologyViolationCode;
}

/** A typed honest-indeterminacy finding (a hop check that cannot run). */
export interface TopologyIndeterminate extends TopologyFindingBase {
  readonly code: TopologyIndeterminateCode;
}

/** One structurally connected group of primitives. */
export interface NetworkComponent {
  /** Sorted primitive ids (UTF-16 code-unit order). */
  readonly primitiveIds: readonly string[];
  /** Sorted ids of this component's connections (both endpoints resolve). */
  readonly connectionIds: readonly string[];
}

export interface TopologyStats {
  readonly primitiveCount: number;
  readonly connectionCount: number;
  readonly violationCount: number;
  readonly indeterminateCount: number;
  readonly componentCount: number;
}

export interface TopologyReport {
  readonly violations: readonly TopologyViolation[];
  readonly indeterminates: readonly TopologyIndeterminate[];
  readonly components: readonly NetworkComponent[];
  readonly stats: TopologyStats;
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                     */
/* ------------------------------------------------------------------ */

/** Endpoint flow direction vocabulary used by the checks. */
type EndpointDirection = "in" | "out" | "bidirectional";

/** Where an endpoint's checkable attributes came from (for honest details). */
type EndpointSource = "segment" | "terminal";

interface EndpointFacts {
  readonly ref: MepEndpointRef;
  readonly ownerPrimitiveId: string;
  readonly source: EndpointSource;
  readonly portClass: PortClass | AbsenceKind;
  readonly direction: EndpointDirection | AbsenceKind;
  readonly service: MepService | AbsenceKind;
  readonly size: MepQuantity;
  readonly voltageClass: VoltageClass | AbsenceKind | undefined;
}

type Resolution = { readonly facts: EndpointFacts } | { readonly reason: string };

/** UTF-16 code-unit order comparison (locale-independent, deterministic). */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isAbsenceKind(value: unknown): value is AbsenceKind {
  return (
    typeof value === "string" &&
    (["UNKNOWN", "NOT_OBSERVED", "OCCLUDED"] as readonly string[]).includes(value)
  );
}

function isPresentQuantity(quantity: MepQuantity): quantity is PresentQuantity {
  return quantity.presence === "PRESENT";
}

/** Human-readable endpoint label used in every finding detail. */
function endpointLabel(ref: MepEndpointRef): string {
  return "segmentId" in ref
    ? `${ref.segmentId} (port ${ref.port})`
    : `${ref.equipmentId} (terminal ${ref.terminalId})`;
}

/** Collision-free internal endpoint key (fixed-shape JSON). */
function endpointKey(ref: MepEndpointRef): string {
  return "segmentId" in ref
    ? JSON.stringify({ port: ref.port, segmentId: ref.segmentId })
    : JSON.stringify({ equipmentId: ref.equipmentId, terminalId: ref.terminalId });
}

/** Segment port direction from the declared flow (a_to_b: a=in, b=out). */
function segmentPortDirection(
  flow: SegmentFlow | AbsenceKind,
  port: "a" | "b",
): EndpointDirection | AbsenceKind {
  if (flow === "a_to_b") {
    return port === "a" ? "in" : "out";
  }
  if (flow === "b_to_a") {
    return port === "a" ? "out" : "in";
  }
  if (flow === "bidirectional") {
    return "bidirectional";
  }
  return flow;
}

/** Equipment terminal direction mapping (inlet→in, outlet→out). */
function terminalDirection(
  direction: TerminalDirection | AbsenceKind,
): EndpointDirection | AbsenceKind {
  if (direction === "inlet") {
    return "in";
  }
  if (direction === "outlet") {
    return "out";
  }
  if (direction === "bidirectional") {
    return "bidirectional";
  }
  return direction;
}

/** Complementary directions: out→in, in→out, bidirectional↔bidirectional. */
function directionsCompatible(a: EndpointDirection, b: EndpointDirection): boolean {
  if (a === "bidirectional" || b === "bidirectional") {
    return a === "bidirectional" && b === "bidirectional";
  }
  return (a === "out" && b === "in") || (a === "in" && b === "out");
}

/** Conservative value bounds for a PRESENT quantity (see module header). */
function sizeBounds(quantity: PresentQuantity): { readonly lower: number; readonly upper: number } {
  const value = quantity.value;
  const uncertainty = quantity.uncertainty;
  if (uncertainty === undefined) {
    return { lower: value, upper: value };
  }
  if (
    uncertainty.kind === "INTERVAL" &&
    typeof uncertainty.lower === "number" &&
    typeof uncertainty.upper === "number"
  ) {
    return { lower: uncertainty.lower, upper: uncertainty.upper };
  }
  if (typeof uncertainty.plusMinus === "number") {
    return { lower: value - uncertainty.plusMinus, upper: value + uncertainty.plusMinus };
  }
  // Hand-crafted record violating the parse-time uncertainty policy: the
  // parse boundary is the enforcement point; treat as a point estimate.
  return { lower: value, upper: value };
}

function resolveSegmentEndpoint(
  segment: MepSegment,
  port: "a" | "b",
): EndpointFacts {
  const service = segment.service;
  return {
    ref: { segmentId: segment.primitiveId, port },
    ownerPrimitiveId: segment.primitiveId,
    source: "segment",
    portClass: isAbsenceKind(service) ? service : SERVICE_PORT_CLASSES[service],
    direction: segmentPortDirection(segment.flow, port),
    service,
    size: segment.nominalSize,
    voltageClass: segment.voltageClass,
  };
}

function resolveEndpoint(primitivesById: Map<string, MepPrimitive>, ref: MepEndpointRef): Resolution {
  if ("segmentId" in ref) {
    const primitive = primitivesById.get(ref.segmentId);
    if (primitive === undefined) {
      return { reason: `no primitive with id ${JSON.stringify(ref.segmentId)} exists in the system` };
    }
    if (primitive.family === "equipment") {
      return {
        reason: `primitive ${JSON.stringify(ref.segmentId)} is equipment, not a segment (ports a/b exist only on pipe/duct/cable_tray primitives)`,
      };
    }
    return { facts: resolveSegmentEndpoint(primitive, ref.port) };
  }
  const primitive = primitivesById.get(ref.equipmentId);
  if (primitive === undefined) {
    return { reason: `no primitive with id ${JSON.stringify(ref.equipmentId)} exists in the system` };
  }
  if (primitive.family !== "equipment") {
    return {
      reason: `primitive ${JSON.stringify(ref.equipmentId)} is a ${primitive.family} segment, not equipment (terminals exist only on equipment primitives)`,
    };
  }
  const terminal = primitive.terminals.find((t) => t.terminalId === ref.terminalId);
  if (terminal === undefined) {
    return {
      reason: `equipment ${JSON.stringify(ref.equipmentId)} has no terminal ${JSON.stringify(ref.terminalId)}`,
    };
  }
  return {
    facts: {
      ref,
      ownerPrimitiveId: primitive.primitiveId,
      source: "terminal",
      portClass: terminal.portClass,
      direction: terminalDirection(terminal.direction),
      service: terminal.service,
      size: terminal.nominalSize,
      voltageClass: terminal.voltageClass,
    },
  };
}

/** Recursively freeze plain JSON data. */
function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* The validation walk                                                  */
/* ------------------------------------------------------------------ */

/**
 * Validate one MEP system's connectivity. Pure: the input is never mutated
 * (tests deep-freeze inputs to prove it); the returned report is deep-frozen.
 * Findings are canonically ordered by (connectionId, check sequence,
 * from-endpoint key, to-endpoint key) — see the module header.
 */
export function validateTopology(system: MepSystem): TopologyReport {
  const primitivesById = new Map<string, MepPrimitive>();
  for (const primitive of system.primitives) {
    primitivesById.set(primitive.primitiveId, primitive);
  }

  const violations: TopologyViolation[] = [];
  const indeterminates: TopologyIndeterminate[] = [];

  const pushViolation = (
    code: TopologyViolationCode,
    connection: MepConnection,
    detail: string,
  ): void => {
    violations.push({
      code,
      connectionId: connection.connectionId,
      from: connection.from,
      to: connection.to,
      detail,
    });
  };

  const pushIndeterminate = (
    code: TopologyIndeterminateCode,
    connection: MepConnection,
    detail: string,
  ): void => {
    indeterminates.push({
      code,
      connectionId: connection.connectionId,
      from: connection.from,
      to: connection.to,
      detail,
    });
  };

  // Union-find over primitives (structural connectivity).
  const parent = new Map<string, string>();
  for (const primitive of system.primitives) {
    parent.set(primitive.primitiveId, primitive.primitiveId);
  }
  const find = (id: string): string => {
    let root = id;
    let candidate = parent.get(root);
    while (candidate !== undefined && candidate !== root) {
      root = candidate;
      candidate = parent.get(root);
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) {
      return;
    }
    // Deterministic attachment: the larger root id becomes the child.
    if (compareStrings(rootA, rootB) < 0) {
      parent.set(rootB, rootA);
    } else {
      parent.set(rootA, rootB);
    }
  };

  // Endpoint usage tracking for double-connection detection (resolved
  // endpoints only — unresolvable references are dangling per connection).
  const endpointUsage = new Map<string, string>();

  // Canonical iteration order: connection id, UTF-16 code-unit order,
  // regardless of the input listing order.
  const orderedConnections = [...system.connections].sort((a, b) =>
    compareStrings(a.connectionId, b.connectionId),
  );

  // Connections contributing to structural connectivity (both endpoints
  // resolve), with their owner primitive pairs — for the component pass.
  const structuralConnections: { readonly connectionId: string; readonly a: string; readonly b: string }[] = [];

  for (const connection of orderedConnections) {
    // 1. Resolve both endpoints.
    const fromResolution = resolveEndpoint(primitivesById, connection.from);
    const toResolution = resolveEndpoint(primitivesById, connection.to);
    const from = "facts" in fromResolution ? fromResolution.facts : null;
    const to = "facts" in toResolution ? toResolution.facts : null;
    const fromReason = "reason" in fromResolution ? fromResolution.reason : null;
    const toReason = "reason" in toResolution ? toResolution.reason : null;

    // 2. Structural connectivity (both endpoints resolved — including
    //    self-connections and connections that carry violations: a
    //    connection is a physical statement regardless of its findings).
    //    Dangling connections do not join anything.
    if (from !== null && to !== null) {
      structuralConnections.push({
        connectionId: connection.connectionId,
        a: from.ownerPrimitiveId,
        b: to.ownerPrimitiveId,
      });
      union(from.ownerPrimitiveId, to.ownerPrimitiveId);
    }

    // 3. Dangling endpoints (typed, naming the reference and the reason);
    //    an identical dangling ref on both sides is reported once.
    if (from === null) {
      pushViolation(
        "dangling_endpoint",
        connection,
        `from-endpoint ${endpointLabel(connection.from)} does not resolve: ${fromReason}`,
      );
    }
    if (to === null && (from !== null || endpointKey(connection.to) !== endpointKey(connection.from))) {
      pushViolation(
        "dangling_endpoint",
        connection,
        `to-endpoint ${endpointLabel(connection.to)} does not resolve: ${toReason}`,
      );
    }
    if (from === null || to === null) {
      // Attribute checks need both endpoints; the dangling finding is the
      // honest report for this hop.
      continue;
    }

    // 4. Self-connection (the shared endpoint resolves): short-circuits the
    //    remaining checks (comparing an endpoint with itself is meaningless
    //    once the connection itself is invalid) and does not register
    //    endpoint usage.
    if (endpointKey(connection.from) === endpointKey(connection.to)) {
      pushViolation(
        "self_connection",
        connection,
        `connection joins endpoint ${endpointLabel(connection.from)} to itself`,
      );
      continue;
    }

    // 5. Double-connection detection on resolved endpoints.
    for (const facts of [from, to]) {
      const key = endpointKey(facts.ref);
      const firstUser = endpointUsage.get(key);
      if (firstUser !== undefined && firstUser !== connection.connectionId) {
        pushViolation(
          "endpoint_double_connected",
          connection,
          `endpoint ${endpointLabel(facts.ref)} is used by connection ${JSON.stringify(firstUser)} and connection ${JSON.stringify(connection.connectionId)}`,
        );
      } else {
        endpointUsage.set(key, connection.connectionId);
      }
    }

    // 6. Typed compatibility checks, fixed sequence — every violation is
    //    reported (never first-only), every unvalidatable check is reported
    //    as indeterminate (never silently passed).

    // 6a. Port class (a port connects only to a compatible port class).
    if (isAbsenceKind(from.portClass) || isAbsenceKind(to.portClass)) {
      for (const facts of [from, to]) {
        if (isAbsenceKind(facts.portClass)) {
          pushIndeterminate(
            "port_class_indeterminate",
            connection,
            `port class not established for ${endpointLabel(facts.ref)} (${facts.portClass}${facts.source === "segment" ? "; segment class derives from its service" : "; terminal portClass"})`,
          );
        }
      }
    } else if (from.portClass !== to.portClass) {
      pushViolation(
        "port_class_mismatch",
        connection,
        `port classes differ: ${endpointLabel(from.ref)} carries ${from.portClass}, ${endpointLabel(to.ref)} carries ${to.portClass}`,
      );
    }

    // 6b. Flow direction (typed in/out terminals and segment ports).
    if (isAbsenceKind(from.direction) || isAbsenceKind(to.direction)) {
      for (const facts of [from, to]) {
        if (isAbsenceKind(facts.direction)) {
          pushIndeterminate(
            "port_direction_indeterminate",
            connection,
            `direction not established for ${endpointLabel(facts.ref)} (${facts.direction}${facts.source === "segment" ? "; segment flow" : "; terminal direction"})`,
          );
        }
      }
    } else if (!directionsCompatible(from.direction, to.direction)) {
      pushViolation(
        "port_direction_mismatch",
        connection,
        `directions not complementary: ${endpointLabel(from.ref)} is ${from.direction}, ${endpointLabel(to.ref)} is ${to.direction} (allowed: out→in, in→out, bidirectional↔bidirectional)`,
      );
    }

    // 6c. Service (identical service required across a connection).
    if (isAbsenceKind(from.service) || isAbsenceKind(to.service)) {
      for (const facts of [from, to]) {
        if (isAbsenceKind(facts.service)) {
          pushIndeterminate(
            "service_indeterminate",
            connection,
            `service not established for ${endpointLabel(facts.ref)} (${facts.service})`,
          );
        }
      }
    } else if (from.service !== to.service) {
      pushViolation(
        "service_mismatch",
        connection,
        `services differ: ${endpointLabel(from.ref)} carries ${from.service}, ${endpointLabel(to.ref)} carries ${to.service}`,
      );
    }

    // 6d. Nominal size (diameter for pipes/ducts, width for trays) with
    //     honest uncertainty handling — see the module header for the rule.
    if (isPresentQuantity(from.size) && isPresentQuantity(to.size)) {
      const nominalDifference = Math.abs(from.size.value - to.size.value);
      const gap = nominalDifference - DIAMETER_MATCH_TOLERANCE_MM;
      if (gap > 0) {
        const fromBounds = sizeBounds(from.size);
        const toBounds = sizeBounds(to.size);
        // Distance between the two bound intervals (0 when overlapping).
        const boundGap = Math.max(0, Math.max(fromBounds.lower, toBounds.lower) - Math.min(fromBounds.upper, toBounds.upper));
        if (boundGap > DIAMETER_MATCH_TOLERANCE_MM) {
          pushViolation(
            "diameter_mismatch",
            connection,
            `nominal sizes incompatible: ${endpointLabel(from.ref)} ${from.size.value} mm, ${endpointLabel(to.ref)} ${to.size.value} mm (|Δ|=${nominalDifference} mm > tolerance ${DIAMETER_MATCH_TOLERANCE_MM} mm); stated bounds [${fromBounds.lower}, ${fromBounds.upper}] mm and [${toBounds.lower}, ${toBounds.upper}] mm are ${boundGap} mm apart`,
          );
        } else {
          pushIndeterminate(
            "diameter_within_uncertainty",
            connection,
            `nominal sizes differ (${from.size.value} vs ${to.size.value} mm, |Δ|=${nominalDifference} mm > tolerance ${DIAMETER_MATCH_TOLERANCE_MM} mm) but the stated measurement uncertainties leave them compatible: bounds [${fromBounds.lower}, ${fromBounds.upper}] mm and [${toBounds.lower}, ${toBounds.upper}] mm are within tolerance of touching — the mismatch is not honestly assertable`,
          );
        }
      }
    } else {
      for (const facts of [from, to]) {
        if (!isPresentQuantity(facts.size)) {
          pushIndeterminate(
            "diameter_indeterminate",
            connection,
            `nominal size not established for ${endpointLabel(facts.ref)} (${facts.size.presence}${facts.size.detail === undefined ? "" : `: ${facts.size.detail}`})`,
          );
        }
      }
    }

    // 6e. Voltage class — only on power-class connections (both classes
    //     known "power"); when the check applies but a voltage class is not
    //     established, that is indeterminate (typed absence or unasserted).
    const classesKnown =
      !isAbsenceKind(from.portClass) && !isAbsenceKind(to.portClass);
    if (classesKnown && from.portClass === "power" && to.portClass === "power") {
      const describeVoltage = (voltage: VoltageClass | AbsenceKind | undefined): string =>
        voltage === undefined ? "unasserted" : voltage;
      if (from.voltageClass === undefined || isAbsenceKind(from.voltageClass) || to.voltageClass === undefined || isAbsenceKind(to.voltageClass)) {
        for (const facts of [from, to]) {
          if (facts.voltageClass === undefined || isAbsenceKind(facts.voltageClass)) {
            pushIndeterminate(
              "voltage_class_indeterminate",
              connection,
              `voltage class not established for ${endpointLabel(facts.ref)} (${describeVoltage(facts.voltageClass)}) on a power connection`,
            );
          }
        }
      } else if (from.voltageClass !== to.voltageClass) {
        pushViolation(
          "voltage_class_mismatch",
          connection,
          `voltage classes differ on a power connection: ${endpointLabel(from.ref)} ${from.voltageClass}, ${endpointLabel(to.ref)} ${to.voltageClass}`,
        );
      }
    }
  }

  // Components: group primitives by union-find root, attach each structural
  // connection to its component, sort members/connections, sort components
  // by first member id.
  const memberLists = new Map<string, string[]>();
  for (const primitive of system.primitives) {
    const root = find(primitive.primitiveId);
    const list = memberLists.get(root);
    if (list === undefined) {
      memberLists.set(root, [primitive.primitiveId]);
    } else {
      list.push(primitive.primitiveId);
    }
  }
  const componentConnections = new Map<string, string[]>();
  for (const structural of structuralConnections) {
    const root = find(structural.a);
    const list = componentConnections.get(root);
    if (list === undefined) {
      componentConnections.set(root, [structural.connectionId]);
    } else {
      list.push(structural.connectionId);
    }
  }
  const components: NetworkComponent[] = [...memberLists.keys()]
    .map((root) => ({
      primitiveIds: Object.freeze([...(memberLists.get(root) ?? [])].sort(compareStrings)),
      connectionIds: Object.freeze([...(componentConnections.get(root) ?? [])].sort(compareStrings)),
    }))
    .sort((a, b) =>
      compareStrings(a.primitiveIds[0] ?? "", b.primitiveIds[0] ?? ""),
    );

  const report: TopologyReport = {
    violations: Object.freeze(violations),
    indeterminates: Object.freeze(indeterminates),
    components: Object.freeze(components),
    stats: {
      primitiveCount: system.primitives.length,
      connectionCount: system.connections.length,
      violationCount: violations.length,
      indeterminateCount: indeterminates.length,
      componentCount: components.length,
    },
  };
  return deepFreeze(report);
}
