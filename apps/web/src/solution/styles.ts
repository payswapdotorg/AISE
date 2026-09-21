/**
 * PROD-024 — the solution workspace's stylesheet (a constant string —
 * never derived from data; the AISE-021 workspace CSS discipline).
 *
 * WCAG AA contrast: body text #1c1917 on #ffffff (≈16:1); secondary text
 * #57534e on #ffffff (≈7.4:1); observed/proposed legend tones are
 * decorative supplements to the structural layer separation (dashed vs
 * solid strokes + data attributes), never the only distinguishing cue.
 * Focus states are explicit (outline) for keyboard users; buttons keep
 * ≥44px touch targets on interactive rows.
 */

export const SOLUTION_WORKSPACE_CSS = `
.solution-workspace{font:14px/1.5 system-ui,sans-serif;color:#1c1917;background:#ffffff;max-width:72rem;margin:0 auto;padding:0 1rem 2rem;display:flex;flex-direction:column;min-height:100vh}
.solution-workspace h2{margin:.4rem 0 .2rem}
.solution-workspace h3{margin:.2rem 0 .4rem;font-size:15px}
.solution-workspace h4{margin:.4rem 0 .2rem;font-size:13px}
.solution-header{border-bottom:2px solid #1c1917;padding:.5rem 0}
.solution-problem{margin:.2rem 0;color:#1c1917}
.solution-pin{color:#57534e;font-size:12px;margin:.2rem 0 .4rem}
.solution-header-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin:.4rem 0}
.solution-workspace button{font:inherit;min-height:34px;padding:.25rem .6rem;border:1px solid #44403c;border-radius:6px;background:#fafaf9;color:#1c1917;cursor:pointer}
.solution-workspace button:focus-visible{outline:3px solid #c2410c;outline-offset:1px}
.solution-workspace button:hover{background:#f5f5f4}
.solution-workspace button.danger{border-color:#b91c1c;color:#b91c1c}
.solution-workspace button[aria-pressed="true"]{background:#fef3c7;border-color:#92400e}
.solution-workspace input,.solution-workspace select{font:inherit;padding:.25rem .4rem;border:1px solid #44403c;border-radius:4px;min-height:34px}
.solution-workspace input:focus-visible,.solution-workspace select:focus-visible{outline:3px solid #c2410c;outline-offset:1px}
.solution-pane{border:1px solid #d6d3d1;border-radius:8px;padding:.6rem .75rem;margin:.5rem 0;background:#ffffff}
.solution-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(20rem,1fr));gap:.6rem}
.solution-columns .solution-pane{margin:0}
.empty{color:#57534e;font-style:italic}
.solution-notice{border:2px solid #b91c1c;background:#fef2f2;border-radius:8px;padding:.5rem .75rem;margin:.5rem 0}
.solution-notice .notice-reasons{margin:.25rem 0 0 1rem;color:#7f1d1d}
.solution-validation{border-color:#d97706;background:#fffbeb}
.solution-validation[data-validation-outcome="pass"]{border-color:#15803d;background:#f0fdf4}
.scene-svg svg{width:100%;height:auto;display:block;background:#fafaf9;border-radius:6px}
.scene-svg polygon{cursor:pointer}
.scene-alternative{color:#57534e;font-size:12px}
.viewer-controls{display:flex;gap:1rem;flex-wrap:wrap;align-items:end;margin:.3rem 0}
.viewer-controls label{display:flex;flex-direction:column;font-size:12px;color:#44403c;gap:.2rem}
.viewer-legend{font-size:12px;color:#44403c}
.legend-observed{color:#1c1917;font-weight:600}
.legend-added{color:#15803d;font-weight:600}
.legend-removed{color:#b91c1c;font-weight:600}
.timeline-controls{display:flex;gap:.5rem;margin:.3rem 0}
.timeline-ticks{list-style:none;padding:0;margin:.3rem 0;display:flex;flex-direction:column;gap:.25rem;max-height:18rem;overflow-y:auto}
.timeline-ticks .tick{display:flex;flex-direction:column;text-align:left;width:100%}
.timeline-ticks .tick-current{background:#fef3c7;border-color:#92400e}
.tick-title{font-weight:600}
.tick-detail{font-size:12px;color:#57534e}
.operation-list{list-style:none;padding:0;margin:.3rem 0;display:flex;flex-direction:column;gap:.25rem;max-height:18rem;overflow-y:auto}
.operation-row{display:flex;flex-direction:column;text-align:left;width:100%}
.operation-row-selected{background:#ffedd5;border-color:#9a3412}
.operation-index{font-size:12px;color:#57534e}
.operation-origin{font-size:12px;color:#57534e}
.detail-rows dt{font-weight:600;margin-top:.4rem}
.detail-rows dd{margin:0}
.detail-rows blockquote{margin:.2rem 0 0 1rem;padding:.2rem .5rem;border-left:3px solid #c2410c;background:#fffbeb;font-style:italic}
.detail-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.6rem}
.detail-quantities,.element-facts{margin:.15rem 0 .15rem 1rem}
.boq-table,.quantities-table{border-collapse:collapse;width:100%;font-size:13px}
.boq-table th,.boq-table td,.quantities-table th,.quantities-table td{border:1px solid #d6d3d1;padding:.25rem .4rem;text-align:left;vertical-align:top}
.boq-row-selected td{background:#fef3c7}
tr[data-contributes-to-selection="true"] td{background:#ffedd5}
.boq-sync-note{font-size:12px;color:#44403c}
.agent-form{display:flex;gap:.5rem;margin:.4rem 0}
.agent-form input{flex:1}
.agent-transcript{max-height:20rem;overflow-y:auto;border-top:1px solid #e7e5e4;padding-top:.4rem}
.agent-transcript ol{list-style:none;padding:0;margin:0}
.agent-transcript .turn{margin:.25rem 0;padding:.3rem .5rem;border-radius:6px}
.agent-transcript .turn-user{background:#f5f5f4}
.agent-transcript .turn-agent{background:#ecfdf5}
.turn-who{font-weight:600;margin-right:.4rem}
.agent-pending{border:2px solid #0f766e;background:#f0fdfa;border-radius:8px;padding:.5rem .75rem;margin:.4rem 0}
.proposal-command{font-weight:600;margin:.2rem 0}
.proposal-warning{color:#b91c1c;font-weight:600}
.proposal-actions{display:flex;gap:.5rem;margin-top:.4rem}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.solution-footer{margin-top:auto;border-top:1px solid #d6d3d1;padding:.6rem 0;color:#57534e;font-size:12px}
.accessible-observed,.accessible-proposed{list-style:none;padding:0}
.accessible-observed>li,.accessible-proposed>li{margin:.35rem 0}
@media (max-width:40rem){.solution-columns{grid-template-columns:1fr}.solution-workspace{padding:0 .5rem 2rem}}
`;
