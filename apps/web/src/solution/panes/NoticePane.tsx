/**
 * PROD-024 — the NOTICE surface: refusals rendered honestly.
 *
 * The workspace NEVER silently drops a refusal. When the solution engine
 * (or the agent compiler) refuses a request, the typed outcome and its
 * machine-readable reasons surface VERBATIM here — with the source
 * authority named. This is the §4.3 mutation-protection acceptance made
 * visible: attempt-to-overwrite and underspecified operations are
 * refused by the engine and the UI says so.
 */

import type { WorkspaceNotice } from "../model";

/** The authority label of each notice source. */
const SOURCE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "solution-engine": "Solution engine",
  "solution-agent": "Agent",
  workspace: "Workspace",
} as const);

/** The outcome wording per notice kind (honest, never softened). */
const KIND_TEXTS: Readonly<Record<string, string>> = Object.freeze({
  "engine-refusal": "refused the operation",
  "revision-refused": "refused the revision",
  "agent-unsupported": "cannot do this yet",
  "agent-ambiguous": "needs a clearer request",
  "agent-unsafe-refusal": "refused an unsafe request",
  "service-error": "service error",
} as const);

export function NoticePane({ notice, onDismiss }: {
  readonly notice: WorkspaceNotice;
  readonly onDismiss?: () => void;
}): React.ReactNode {
  return (
    <section
      aria-live="polite"
      aria-label="Operation notice"
      className="solution-notice"
      data-notice-kind={notice.kind}
      data-notice-source={notice.source}
      data-notice-outcome={notice.outcome}
      role="status"
    >
      <p>
        <strong>
          {SOURCE_LABELS[notice.source] ?? notice.source}{" "}
          {KIND_TEXTS[notice.kind] ?? `answered '${notice.outcome}'`}
        </strong>{" "}
        — nothing was changed by this request.
      </p>
      <ul className="notice-reasons">
        {notice.reasons.map((reason, index) => (
          <li data-reason-code={reason.code} key={`${reason.code}-${index}`}>
            {reason.detail}
          </li>
        ))}
      </ul>
      {onDismiss === undefined ? null : (
        <button onClick={onDismiss} type="button">
          Dismiss
        </button>
      )}
    </section>
  );
}
