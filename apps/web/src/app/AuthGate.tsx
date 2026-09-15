/**
 * PROD-004 — the web gate UI: the sign-in / "Enter demo" panel that sits
 * before the product shell, and the signed-in user menu.
 *
 * The components are PURE PROJECTIONS of the gate state machine
 * (`gate.ts`): they render state and emit intents (callbacks); they never
 * perform I/O, never hold their own copy of the truth, and never learn
 * anything about the principal beyond the display-only vocabulary.
 * Styling reuses the shell's existing classes (.card, .button, .api-chip,
 * .inline-label) plus token-based inline layout styles, so the gate adds
 * ZERO new global CSS (the styles/ surface is untouched).
 *
 * A11Y: a labelled form (explicit <label> + input + submit), an alert role
 * for failures, disabled-while-submitting buttons with honest labels, and
 * the same visible-focus discipline as the rest of the shell.
 */

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { SessionPrincipal } from "./api";
import { describeGateActionFailure, type GateState } from "./gate";

const screenStyle: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  background: "var(--bg)",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "460px",
};

const formStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  alignItems: "center",
  margin: "0 0 12px",
};

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: "200px",
};

const dividerStyle: CSSProperties = {
  margin: "12px 0",
  textAlign: "center",
  color: "var(--ink-faint)",
  fontSize: "0.85rem",
};

const noteStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "var(--ink-soft)",
  fontSize: "0.85rem",
};

const failureStyle: CSSProperties = {
  margin: "12px 0 0",
  padding: "10px 12px",
  borderRadius: "var(--radius)",
  background: "var(--error-bg)",
  color: "var(--error)",
};

const probeErrorStyle: CSSProperties = {
  margin: "12px 0 0",
  padding: "10px 12px",
  borderRadius: "var(--radius)",
  background: "var(--warn-bg)",
};

const menuStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
};

const menuNameStyle: CSSProperties = {
  fontWeight: 600,
};

const menuRoleStyle: CSSProperties = {
  color: "var(--ink-soft)",
  fontSize: "0.82rem",
};

/** One button-ish action the gate can perform. */
export interface GateActions {
  /** Submit the sign-in form with a principal id. */
  readonly onSignIn: (principalId: string) => void;
  /** "Enter demo" — the controlled demo path. */
  readonly onEnterDemo: () => void;
  /** Retry the failed auth probe. */
  readonly onRetry: () => void;
}

/** The gate panel: sign-in form + Enter demo + honest failure states. */
export function AuthGate({
  state,
  actions,
}: {
  readonly state: GateState;
  readonly actions: GateActions;
}): ReactNode {
  const [principalId, setPrincipalId] = useState("");

  const busy = state.submitting !== "none";
  const actionFailure = state.actionFailure;

  return (
    <div className="gate-screen" style={screenStyle}>
      <section className="card" style={cardStyle} aria-labelledby="gate-title">
        <div className="card-head">
          <h2 id="gate-title" className="card-title">
            Sign in to AISE
          </h2>
        </div>
        <div className="card-body">
          <p>
            This deployment requires a session for the product surfaces. Sign
            in as a registered principal, or enter the controlled demo path —
            a deterministic evaluator session bound to the demo tenant only.
          </p>
          <form
            style={formStyle}
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) {
                actions.onSignIn(principalId);
              }
            }}
          >
            <label className="inline-label" htmlFor="gate-principal">
              Principal id
            </label>
            <input
              id="gate-principal"
              type="text"
              style={inputStyle}
              value={principalId}
              autoComplete="username"
              spellCheck={false}
              onChange={(event) => {
                setPrincipalId(event.target.value);
              }}
            />
            <button
              type="submit"
              className="button"
              disabled={busy || principalId.trim().length === 0}
            >
              {state.submitting === "sign-in" ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <div role="separator" style={dividerStyle}>
            or
          </div>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={() => {
              actions.onEnterDemo();
            }}
          >
            {state.submitting === "demo" ? "Entering demo…" : "Enter demo"}
          </button>
          <p style={noteStyle}>
            The demo session is confined to the demo tenant — it can never
            read or mutate another tenant&apos;s projects.
          </p>
          {actionFailure !== null && actionFailure.who !== "sign-out" ? (
            <p role="alert" style={failureStyle}>
              {describeGateActionFailure(actionFailure.failure, actionFailure.who)}
            </p>
          ) : null}
          {state.status === "error" && state.probeFailure !== null ? (
            <div role="alert" style={probeErrorStyle}>
              <p>The auth check on this origin could not be completed.</p>
              <button type="button" className="button button-small" onClick={actions.onRetry}>
                Retry
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

/** The signed-in user menu (header chip): display name, role, demo badge, sign out. */
export function UserMenu({
  principal,
  signingOut,
  onSignOut,
}: {
  readonly principal: SessionPrincipal;
  readonly signingOut: boolean;
  readonly onSignOut: () => void;
}): ReactNode {
  return (
    <span className="user-menu" style={menuStyle}>
      <span style={menuNameStyle} title={principal.roleLabel}>
        {principal.displayName}
      </span>
      {principal.kind === "demo" ? (
        <span className="api-chip api-chip-demo" title="Controlled demo path — demo tenant only">
          demo
        </span>
      ) : (
        <span style={menuRoleStyle}>{principal.roleLabel}</span>
      )}
      <button
        type="button"
        className="button button-small button-secondary"
        disabled={signingOut}
        onClick={onSignOut}
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </span>
  );
}
