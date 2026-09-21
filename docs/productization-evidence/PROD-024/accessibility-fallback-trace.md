# PROD-024 — Accessibility / fallback trace (the first-class non-viewer path)

**Work item:** PROD-024 · **Module:** `apps/web/src/solution/**`
**Source:** the automated suites
(`apps/web/src/solution/fallback/fallback.test.tsx` — headless
completeness + markup accessibility; `workspace.test.tsx` — the component
surfaces; the WCAG-AA stylesheet in `styles.ts`).

The accessible non-3D fallback is a FIRST-CLASS path (§4.7): a user can
inspect and revise a full solution through it, with zero reliance on the
spatial viewer — and it exercises the SAME semantics.

## 1. Headless completeness (the fallback session, no viewer involved)

The recorded fallback session (automated; the exact controllers the
fallback panes call — no scene SVG, no projection anywhere in the path):

```text
1. inspect   — the workspace opens on the engine baseline overlay
               (version 1, layer 0, PROPOSED seal, pinned rgv-demo-0007).
2. select    — the user selects the damaged wall faces through the
               ACCESSIBLE scene list (a labeled button list — not the
               drawing).
3. manipulate — "Remove the damaged section" (demolition 5 m × 2.4 m ×
               0.1 m) through the SAME typed-intent path: engine applies,
               layer 1 materializes with the corpus's operation identity.
4. step      — timeline back to layer 0, forward to layer 1 (engine
               states by identity).
5. inspect   — the operation's detail record (parameters, target,
               provenance, state delta, engine quantities).
6. revise    — "Undo this step (new version)": NEW version 2 through the
               engine's revision service; version 1 preserved verbatim in
               the history.
```

The journey record of that session (asserted):
`[inspect, direct-manipulation, step-back, step-forward, revise]` — every
step traceable without any spatial rendering. An agent decision
(unsupported) also folds through the fallback path with the verbatim
reason surfaced (asserted).

## 2. The accessible scene pane (markup, asserted)

- every observed element renders as a **labeled button** with
  `aria-pressed` selection state and its recorded facts (e.g. "Observed
  area (south face set): 12.5 m2");
- the proposed work at the current step renders as a **labeled list**
  with real-world wording, step numbers and directions ("Removed section
  — removes material (Removing a section, step 1)");
- explicit empty states ("No proposed work is visible at this step.").

## 3. Keyboard navigation and screen-reader labeling (markup, asserted)

| Surface | Accessibility affordances (asserted) |
|---|---|
| Workspace root | `aria-label="Interactive solution workspace — …"`, `role`-bearing semantic landmarks (`main`/`header`/`footer`/`section`) |
| Timeline | prev/next buttons with `aria-label`s; every layer tick is a button with a full `aria-label` ("Layer 1: …; removes 1.2 m3 …") and `aria-current="step"` at the cursor |
| Operation list | every row is a button with the full real-world summary + provenance in its `aria-label` |
| Detail inspector | a labeled region (`aria-label="Details of step N"`), definition rows (`dl`), the verbatim command quote, and the undo control's explicit `aria-label` ("creates a new version, keeps history") |
| Quantities | a real `<table>` with `<caption>` and `scope="col"` headers |
| Notice pane | `role="status"` + `aria-live="polite"` |
| Agent panel | a programmatic label on the input (`sr-only` + `for`/`id`), a live transcript (`role="log"` + `aria-live="polite"`), pending states as visible cards with explicit confirm/cancel buttons |
| Viewer | `role="img"` + `aria-label` + the textual scene alternative (observed and proposed content in words); all controls are native buttons/inputs/selects/sliders with labels |
| Fallback toggle | an `aria-pressed` button ("Use the accessible view (no drawing)") |

## 4. WCAG AA contrast and focus (stylesheet)

The module's stylesheet (a constant string, never data-derived) keeps:
body text `#1c1917` on `#ffffff` (≈16:1), secondary text `#57534e`
(≈7.4:1), refusal tones `#7f1d1d` on `#fef2f2` (≈7:1), pending-proposal
`#134e4a`-family borders on `#f0fdfa`; every interactive element carries
an explicit `:focus-visible` outline (`#c2410c`, 3px) for keyboard users;
buttons keep comfortable touch targets (≥34px control height, ≥44px rows
via padding); the observed/proposed color distinction is always PAIRED
with the structural layer separation + dash patterns + textual
alternatives (never color alone).

## 5. The fallback is not a stub

The fallback session above performs a COMPLETE inspect-and-revise cycle:
select → manipulate → step → inspect detail → undo — all through the same
typed intents, the same one submission path, the same engine states and
the same append-only revision as the viewer path (the convergence is the
point: there is exactly one operation semantics in the module).
