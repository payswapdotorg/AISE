/**
 * PROD-018 — the composed task-first panel (the hook-driven wrapper).
 *
 * The task-first shell's composition entry: the PROD-017 task-flow resource
 * (the REAL adapter seam — `useTaskFlow`, the same loader the strips and
 * panels use) rendered through the composition body (the four canonical
 * actions with honest per-step states + the evidence-gap next actions).
 *
 * This wrapper lives SEPARATELY from parity/components.tsx so the import
 * graph stays one-directional: surfaces → (this module → app/task-first,
 * parity/components) — app/task-first itself never imports the wrapper,
 * so the task-first surface can embed `TaskCompositionPanelBody` without
 * a module cycle.
 */

import type { ReactNode } from "react";
import { useTaskFlow, TaskFlowResourceView } from "../app/task-first";
import { TaskCompositionPanelBody } from "./components";

/** The composed task-first panel (the hook-driven composition surface). */
export function TaskCompositionPanel({
  projectId,
}: {
  readonly projectId: string;
}): ReactNode {
  const { state, reload } = useTaskFlow(projectId);
  return (
    <TaskFlowResourceView
      state={state}
      onRetry={reload}
      render={(data) => <TaskCompositionPanelBody data={data} />}
    />
  );
}
