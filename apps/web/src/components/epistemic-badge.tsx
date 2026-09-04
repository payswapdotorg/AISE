/**
 * The epistemic badge (AC-082): the workspace visually
 * distinguishes OBSERVED / INFERRED / CONFIRMED / PROPOSED
 * content. Server-authored styling map — one authoritative
 * color vocabulary shared by the list, the inspector and the 3D
 * shell (the canvas reads the same CSS custom properties).
 */
export type EpistemicState = "OBSERVED" | "INFERRED" | "CONFIRMED" | "PROPOSED";

export const EPISTEMIC_COLORS: Readonly<Record<EpistemicState, string>> = {
  CONFIRMED: "#0f766e",
  OBSERVED: "#1d4ed8",
  INFERRED: "#b45309",
  PROPOSED: "#6b7280",
};

export function epistemicColor(state: string): string {
  return EPISTEMIC_COLORS[state as EpistemicState] ?? "#6b7280";
}

export function EpistemicBadge({ state }: { state: string }) {
  return (
    <span className="epistemic-badge" data-state={state}>
      {state}
    </span>
  );
}
