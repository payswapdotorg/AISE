/**
 * PROD-002 — the demo dataset: the frozen libraries' fixtures assembled
 * into the product's per-surface data (the "dev without backend" world).
 *
 * HONESTY RULES:
 *
 *  - Every record keeps its VERBATIM ids (proj-riverside-refit, v003,
 *    boq-0042, case-007, scenario-office-refit, …) — the demo world is the
 *    fixtures' world, not a re-keyed copy.
 *  - The fixtures describe (by design) more than one project world: the
 *    pilot "proj-riverside-refit" (context/reality/BOQ/case/connectors) and
 *    "project-zurich-hq" (the intervention scenario record). Both are
 *    listed; records are NEVER re-attributed to a project they do not name.
 *  - Per-project lookups return null / empty arrays for absent data —
 *    surfaces render genuine empty states, never borrowed data.
 *  - All factories return FRESH objects (the fixture helpers already do);
 *    no clock, no randomness anywhere in this module.
 */

import { boqLensInput } from "../boqlens/fixtures";
import { workspaceInput } from "../workspace/fixtures";
import {
  allBindings,
  authorizationTable,
  boqImportView,
  caseView,
  contextView,
  evidenceBoqSource,
  evidenceWallEast,
  evidenceWallNorth,
  realityV003,
  type AuthorizationTableRow,
} from "../shell/fixtures";
import { approvedScenario } from "../viewer/fixtures";
import type {
  BoqLensInput,
} from "../boqlens";
import type {
  BoqPaneView,
  CasePaneView,
  ConnectorBindingView,
  ContextPaneView,
  EvidencePaneView,
  RealityPaneView,
} from "../shell";
import type { WorkspaceInput } from "../workspace";
import type { ViewerScenario } from "../viewer";

/** The demo organization (the pilot world's org id, verbatim). */
export const DEMO_ORG_ID = "org-northwind";

/** The pilot project (rich demo world). */
export const DEMO_PROJECT_ID = "proj-riverside-refit";

/** The intervention-scenario project (the viewer fixture world). */
export const DEMO_SCENARIO_PROJECT_ID = "project-zurich-hq";

/**
 * The interactive-solution demo project (PROD-026): the solution module's
 * committed demo wall world (`proj-demo-001` — the SAME world the engine,
 * the contract corpus and the PROD-025 BOQ fixtures describe). The world's
 * own records (observed scene, baseline geometry, recorded solution
 * journey) live in `apps/web/src/solution/fixtures.ts` and are consumed
 * read-only through that module's public exports.
 */
export const DEMO_SOLUTION_PROJECT_ID = "proj-demo-001";

/** One demo project card (Projects surface). */
export interface DemoProject {
  readonly projectId: string;
  readonly organizationId: string;
  /** Display name — the context record's name, or the verbatim id. */
  readonly name: string;
  /** Honest one-line description of what the demo dataset holds. */
  readonly note: string;
  /** True when the demo dataset carries a context record for this project. */
  readonly hasContext: boolean;
}

/** The demo project list (deterministic order, fresh objects). */
export function demoProjects(): readonly DemoProject[] {
  return [
    {
      projectId: DEMO_PROJECT_ID,
      organizationId: DEMO_ORG_ID,
      name: "Riverside office refit",
      note: "Pilot demo project — context, reality snapshot, BOQ import, engineering case and connector bindings.",
      hasContext: true,
    },
    {
      projectId: DEMO_SCENARIO_PROJECT_ID,
      organizationId: DEMO_ORG_ID,
      name: "project-zurich-hq",
      note: "Intervention scenario project — one proposed office-refit scenario; the demo dataset holds no context or reality records for it (honest empty surfaces).",
      hasContext: false,
    },
    {
      projectId: DEMO_SOLUTION_PROJECT_ID,
      organizationId: DEMO_ORG_ID,
      name: "Demo wall upgrade (interactive solution)",
      note: "Interactive engineering-solution demo project — the observed wall world (reality version rgv-demo-0007) with the recorded reference solution journey and its generated solution BOQ; the demo dataset holds no context, reality-snapshot or BOQ-import records for it (the solution workspace composes its own case context).",
      hasContext: false,
    },
  ];
}

/** The demo context record of a project (null when the dataset has none). */
export function demoContext(projectId: string): ContextPaneView | null {
  return projectId === DEMO_PROJECT_ID ? contextView() : null;
}

/** The demo reality snapshot of a project (null when the dataset has none). */
export function demoReality(projectId: string): RealityPaneView | null {
  return projectId === DEMO_PROJECT_ID ? realityV003() : null;
}

/** The demo BOQ import record of a project (null when the dataset has none). */
export function demoBoqImport(projectId: string): BoqPaneView | null {
  return projectId === DEMO_PROJECT_ID ? boqImportView() : null;
}

/** The demo evidence records of a project (empty when the dataset has none). */
export function demoEvidenceList(projectId: string): readonly EvidencePaneView[] {
  if (projectId !== DEMO_PROJECT_ID) {
    return [];
  }
  return [evidenceWallNorth(), evidenceWallEast(), evidenceBoqSource()];
}

/** The demo engineering case of a project (null when the dataset has none). */
export function demoCase(projectId: string): CasePaneView | null {
  return projectId === DEMO_PROJECT_ID ? caseView() : null;
}

/** The demo connector bindings of a project (empty when the dataset has none). */
export function demoBindings(projectId: string): readonly ConnectorBindingView[] {
  return projectId === DEMO_PROJECT_ID ? allBindings() : [];
}

/** The demo authorization decision table (the identity vocabulary, verbatim). */
export function demoAuthorizationTable(): readonly AuthorizationTableRow[] {
  return authorizationTable();
}

/** The demo BOQ Lens input of a project (null when the dataset has none). */
export function demoLensInput(projectId: string): BoqLensInput | null {
  return projectId === DEMO_PROJECT_ID ? boqLensInput() : null;
}

/**
 * The demo SiteTwin pinned workspace input of a project (the AISE-021
 * fixture world: drawing v002 + graph snapshot + evidence entries; null
 * when the dataset has none).
 */
export function demoWorkspaceInput(projectId: string): WorkspaceInput | null {
  return projectId === DEMO_PROJECT_ID ? workspaceInput() : null;
}

/**
 * The demo intervention scenario of a project (null when the dataset has
 * none). The APPROVED fixture variant exercises the governed vocabulary
 * (status transitions + the recorded case review reference) — every state
 * layer is still a PROPOSED projection over the pinned baseline.
 */
export function demoScenario(projectId: string): ViewerScenario | null {
  return projectId === DEMO_SCENARIO_PROJECT_ID ? approvedScenario() : null;
}

/**
 * Whether the demo dataset holds the interactive-solution world for a
 * project (PROD-026): TRUE only for the solution module's committed demo
 * wall world (`proj-demo-001`). Other projects answer honestly false and
 * the solution surface renders its genuine empty state — the world is
 * never borrowed across projects.
 */
export function demoSolutionWorldHeld(projectId: string): boolean {
  return projectId === DEMO_SOLUTION_PROJECT_ID;
}

/**
 * The interactive-solution demo world's IDENTITY PINS (PROD-026) — the
 * browser-safe mirror of the solution module's `DEMO_SOLUTION_WORLD`
 * constants. The solution module's own value imports transitively require
 * `node:crypto` (the engine's identity derivations), which a plain
 * browser bundle externalizes — so the browser-safe composition layer
 * carries these plain-data pins instead, and the composition-model suite
 * asserts the mirror equals the module's own constants (no drift).
 */
export const DEMO_SOLUTION_WORLD_PINS = Object.freeze({
  projectId: "proj-demo-001",
  caseId: "case-demo-wall-001",
  solutionId: "solution-demo-001",
  title: "Ground-floor wall upgrade solution",
  problemStatement:
    "Rising damp has damaged the ground-floor masonry wall; the damaged " +
    "section must be removed, rebuilt with concrete blocks and re-plastered.",
  baselineRealityVersionId: "rgv-demo-0007",
} as const);

/**
 * The observed FACTS of the demo solution world's scene (PROD-026) — the
 * browser-safe mirror of the solution module's `demoObservedScene()`
 * element facts, rendered by the honest engine-unavailable panel. The
 * composition-model suite asserts the mirror equals the module's own
 * scene facts (no drift).
 */
export function demoSolutionObservedFacts(): readonly {
  readonly elementId: string;
  readonly label: string;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
}[] {
  return [
    {
      elementId: "node-wall-002",
      label: "Damaged ground-floor wall faces",
      facts: [
        { label: "Observed area (south face set)", value: "12.5 m2" },
        { label: "Observed length", value: "5 m" },
        { label: "Observed height", value: "2.5 m" },
        { label: "Observed condition", value: "rising damp damage along the base courses" },
      ],
    },
    {
      elementId: "geo-wall-line-003",
      label: "The wall line along the damaged section",
      facts: [
        { label: "Observed length", value: "5 m" },
        { label: "Observed height", value: "2.5 m" },
      ],
    },
    {
      elementId: "node-slab-003",
      label: "Ground-floor slab",
      facts: [
        { label: "Observed extent", value: "5 m × 4 m" },
        { label: "Observed condition", value: "sound" },
      ],
    },
    {
      elementId: "node-site-001",
      label: "Open ground south of the building",
      facts: [
        { label: "Observed extent", value: "10 m × 5 m" },
        { label: "Observed surface", value: "grass and gravel" },
      ],
    },
  ];
}

/** The acting principals offered by the demo authorization table. */
export const DEMO_PRINCIPALS: readonly string[] = Object.freeze([
  "user-alice",
  "user-bob",
  "user-carol",
  "user-dave",
  "user-erin",
]);
