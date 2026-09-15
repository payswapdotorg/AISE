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

/** The acting principals offered by the demo authorization table. */
export const DEMO_PRINCIPALS: readonly string[] = Object.freeze([
  "user-alice",
  "user-bob",
  "user-carol",
  "user-dave",
  "user-erin",
]);
