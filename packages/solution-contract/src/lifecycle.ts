/**
 * Solution lifecycle, version and branch semantics (PROD-021).
 *
 * THE GOVERNED STATE MACHINE for draft, validated, superseded and abandoned
 * proposals (work-order scope: "define lifecycle/version/branch semantics
 * for draft, validated, superseded and abandoned proposals"):
 *
 * ```text
 *   draft ────► validated ────► superseded   (terminal)
 *     │            │
 *     │            └──────────► abandoned    (terminal)
 *     └───────────────────────► abandoned
 * ```
 *
 * Rules (mirroring the intervention scenario discipline of AISE-026 and the
 * ACR-005 invariants):
 *
 *  - A DRAFT is editable: operations may be appended. Editing never rewrites
 *    a recorded operation — revision creates a NEW solution version (or a
 *    proposal BRANCH), which supersedes the prior version.
 *  - VALIDATED is reached only with a declared validation snapshot
 *    (enforced by the SolutionVersion invariant checks — see invariants.ts);
 *    a generated solution BOQ may be derived only from a validated version's
 *    declared snapshot.
 *  - SUPERSEDED and ABANDONED are TERMINAL: no further lifecycle
 *    transitions. `superseded` replaces (never deletes) — the superseding
 *    successor is named; `abandoned` withdraws the proposal.
 *  - The statuses carry NO approval semantics: approving an intervention is
 *    an Engineering Case domain act (AISE-025 reviews). The vocabulary
 *    deliberately excludes `approved`/`rejected`.
 *
 * PROPOSAL-IS-REALITY-ISOLATION: lifecycle status describes a PROPOSAL, never
 * observed reality. `Solution.epistemicClass` is the literal `PROPOSED` and
 * `ProposedState.epistemicStatus` is the literal `PROPOSED` — this module
 * offers no transition that could upgrade either (asserted by
 * authority.test.ts).
 */

import { SolutionContractLifecycleError } from "./errors";

export const SOLUTION_LIFECYCLE_STATUSES = [
  "draft",
  "validated",
  "superseded",
  "abandoned",
] as const;
export type SolutionLifecycleStatus = (typeof SOLUTION_LIFECYCLE_STATUSES)[number];

/** Terminal statuses — no further transitions, no further mutation. */
export const TERMINAL_SOLUTION_STATUSES = ["superseded", "abandoned"] as const;

/**
 * The governed transition table (single authority; frozen). `draft` may be
 * validated, superseded or abandoned; `validated` may be superseded or
 * abandoned (a revision creates a NEW version instead of reopening this
 * one); `superseded` and `abandoned` are terminal.
 */
export const SOLUTION_LIFECYCLE_TRANSITIONS: Readonly<
  Record<SolutionLifecycleStatus, readonly SolutionLifecycleStatus[]>
> = {
  draft: ["validated", "superseded", "abandoned"],
  validated: ["superseded", "abandoned"],
  superseded: [],
  abandoned: [],
};

/** Whether a lifecycle status admits no further transitions. */
export function isTerminalSolutionStatus(status: SolutionLifecycleStatus): boolean {
  return (TERMINAL_SOLUTION_STATUSES as readonly string[]).includes(status);
}

/** Whether the governed table admits a `from → to` transition. */
export function canTransitionSolutionStatus(
  from: SolutionLifecycleStatus,
  to: SolutionLifecycleStatus,
): boolean {
  return (SOLUTION_LIFECYCLE_TRANSITIONS[from] as readonly string[]).includes(to);
}

/**
 * Asserts a governed lifecycle transition. PURE and deterministic: legal
 * pairs pass silently; any illegal pair (including anything out of a
 * terminal status, self-transitions and re-entry into `draft`) throws the
 * typed `SolutionContractLifecycleError` carrying the attempted pair.
 */
export function assertSolutionLifecycleTransition(
  from: SolutionLifecycleStatus,
  to: SolutionLifecycleStatus,
): void {
  if (!canTransitionSolutionStatus(from, to)) {
    throw new SolutionContractLifecycleError(from, to);
  }
}
