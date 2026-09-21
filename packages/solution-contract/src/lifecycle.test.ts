/**
 * Solution lifecycle tests (PROD-021): the governed draft → validated →
 * superseded/abandoned state machine with version-pinned transitions,
 * terminal statuses and typed transition errors. Also proves the lifecycle
 * vocabulary carries NO approval semantics (approval is an Engineering Case
 * domain act — the vocabulary deliberately excludes approved/rejected).
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import {
  SOLUTION_LIFECYCLE_STATUSES,
  SOLUTION_LIFECYCLE_TRANSITIONS,
  TERMINAL_SOLUTION_STATUSES,
  assertSolutionLifecycleTransition,
  canTransitionSolutionStatus,
  isTerminalSolutionStatus,
} from "./lifecycle";
import { SolutionContractLifecycleError } from "./errors";

describe("the governed transition table", () => {
  test("the lifecycle vocabulary is exactly draft, validated, superseded, abandoned", () => {
    expect(SOLUTION_LIFECYCLE_STATUSES).toEqual([
      "draft",
      "validated",
      "superseded",
      "abandoned",
    ]);
  });

  test("the lifecycle vocabulary carries NO approval semantics", () => {
    for (const forbidden of ["approved", "rejected", "under_review"]) {
      expect(
        (SOLUTION_LIFECYCLE_STATUSES as readonly string[]).includes(forbidden),
      ).toBe(false);
    }
  });

  test("the transition table covers every lifecycle status", () => {
    expect([...Object.keys(SOLUTION_LIFECYCLE_TRANSITIONS)].sort()).toEqual(
      [...SOLUTION_LIFECYCLE_STATUSES].sort(),
    );
  });

  test("terminal statuses are superseded and abandoned only", () => {
    expect(TERMINAL_SOLUTION_STATUSES).toEqual(["superseded", "abandoned"]);
    for (const status of SOLUTION_LIFECYCLE_STATUSES) {
      expect(isTerminalSolutionStatus(status)).toBe(
        (TERMINAL_SOLUTION_STATUSES as readonly string[]).includes(status),
      );
    }
  });
});

describe("legal transitions pass silently", () => {
  test("draft -> validated | superseded | abandoned are legal", () => {
    expect(() => assertSolutionLifecycleTransition("draft", "validated")).not.toThrow();
    expect(() => assertSolutionLifecycleTransition("draft", "superseded")).not.toThrow();
    expect(() => assertSolutionLifecycleTransition("draft", "abandoned")).not.toThrow();
  });

  test("validated -> superseded | abandoned are legal (revision creates a NEW version)", () => {
    expect(() => assertSolutionLifecycleTransition("validated", "superseded")).not.toThrow();
    expect(() => assertSolutionLifecycleTransition("validated", "abandoned")).not.toThrow();
  });

  test("canTransitionSolutionStatus mirrors assertSolutionLifecycleTransition", () => {
    for (const from of SOLUTION_LIFECYCLE_STATUSES) {
      for (const to of SOLUTION_LIFECYCLE_STATUSES) {
        const legal = canTransitionSolutionStatus(from, to);
        if (legal) {
          expect(() => assertSolutionLifecycleTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertSolutionLifecycleTransition(from, to)).toThrow(
            SolutionContractLifecycleError,
          );
        }
      }
    }
  });
});

describe("illegal transitions throw the typed lifecycle error", () => {
  test("terminal statuses admit no transitions", () => {
    for (const terminal of TERMINAL_SOLUTION_STATUSES) {
      for (const to of SOLUTION_LIFECYCLE_STATUSES) {
        expect(() =>
          assertSolutionLifecycleTransition(terminal, to),
        ).toThrow(SolutionContractLifecycleError);
      }
    }
  });

  test("draft can never re-enter draft and validated can never reopen to draft", () => {
    expect(() => assertSolutionLifecycleTransition("draft", "draft")).toThrow(
      SolutionContractLifecycleError,
    );
    expect(() => assertSolutionLifecycleTransition("validated", "draft")).toThrow(
      SolutionContractLifecycleError,
    );
    expect(() => assertSolutionLifecycleTransition("validated", "validated")).toThrow(
      SolutionContractLifecycleError,
    );
  });

  test("the typed error carries the stable code and the attempted from/to pair", () => {
    let caught: unknown;
    try {
      assertSolutionLifecycleTransition("superseded", "draft");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SolutionContractLifecycleError);
    const lifecycleError = caught as SolutionContractLifecycleError;
    expect(lifecycleError.code).toBe("SOLUTION_CONTRACT_LIFECYCLE_ERROR");
    expect(lifecycleError.from).toBe("superseded");
    expect(lifecycleError.to).toBe("draft");
    expect(lifecycleError.message).toContain("superseded -> draft");
  });
});
