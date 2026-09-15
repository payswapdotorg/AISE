/**
 * AISE-034 — MEP semantics foundation: public surface.
 *
 * A package-internal domain library (NO router / server / HTTP surface —
 * the work order deliberately scopes this module to primitives, topology
 * and controlled-fixture verification): pipe/duct/cable-tray/equipment
 * semantic primitives with uncertainty/evidence discipline, typed
 * connection-topology validation with named-endpoint refusals, and
 * deterministic controlled fixtures for the verification suite.
 *
 * Read the module headers before use:
 *  - model.ts     — vocabularies, assertion discipline, typed refusals,
 *                   boundary parsers (in-process == wire), deep-frozen
 *                   records, content ids;
 *  - topology.ts  — typed connectivity rules, canonical report ordering,
 *                   honest indeterminacy, uncertainty-aware size checks;
 *  - fixtures.ts  — hand-computable controlled fixture networks.
 *
 * This module is the MEP VOCABULARY, not a second canonical model: the
 * Reality Graph stays the only canonical engineering-model authority; the
 * property-semantics convention reference is semantics/ (read-only).
 */

export {
  // vocabularies (frozen)
  MEP_FAMILIES,
  PIPE_SERVICES,
  DUCT_SERVICES,
  TRAY_SERVICES,
  ALL_MEP_SERVICES,
  FAMILY_SERVICES,
  PORT_CLASSES,
  SERVICE_PORT_CLASSES,
  VOLTAGE_CLASSES,
  EQUIPMENT_KINDS,
  TERMINAL_DIRECTIONS,
  SEGMENT_FLOWS,
  ABSENCE_KINDS,
  // typed refusal registry
  MEP_ERROR_CODES,
  isMepError,
  MepError,
  // boundary parsers (single validation path)
  parseMepPrimitive,
  parseMepConnection,
  parseMepSystem,
  // constructors (parse under the hood)
  definePipeSegment,
  defineDuctSegment,
  defineCableTray,
  defineEquipment,
  defineMepConnection,
  defineMepSystem,
  // content ids (determinism pin)
  mepPrimitiveContentId,
  mepConnectionContentId,
  mepSystemContentId,
} from "./model";

export type {
  MepFamily,
  PipeService,
  DuctService,
  TrayService,
  MepService,
  PortClass,
  VoltageClass,
  EquipmentKind,
  TerminalDirection,
  SegmentFlow,
  AbsenceKind,
  SegmentFamily,
  MepErrorCode,
  PresentQuantity,
  AbsentQuantity,
  MepQuantity,
  MepPropertyAssertion,
  ReferencedGeometry,
  OmittedGeometry,
  MepGeometryLink,
  MepPrimitiveBase,
  MepPipe,
  MepDuct,
  MepCableTray,
  MepEquipmentTerminal,
  MepEquipment,
  MepPrimitive,
  MepSegment,
  MepEndpointRef,
  MepConnection,
  MepSystem,
  MepSegmentDraft,
  MepEquipmentDraft,
  MepConnectionDraft,
  MepSystemDraft,
} from "./model";

export {
  // topology registries + constants
  TOPOLOGY_VIOLATION_CODES,
  TOPOLOGY_INDETERMINATE_CODES,
  DIAMETER_MATCH_TOLERANCE_MM,
  // the validation walk
  validateTopology,
} from "./topology";

export type {
  TopologyViolationCode,
  TopologyIndeterminateCode,
  TopologyFindingBase,
  TopologyViolation,
  TopologyIndeterminate,
  NetworkComponent,
  TopologyStats,
  TopologyReport,
} from "./topology";

export {
  // controlled fixtures (deterministic, hand-computed expectations)
  cleanPipeNetwork,
  cleanDuctNetwork,
  cleanTrayNetwork,
  mismatchedNetwork,
} from "./fixtures";

export type {
  FixtureFinding,
  FixtureComponent,
  FixtureExpected,
  MepFixture,
} from "./fixtures";
