# ANCHOR-007 — Recommendation

The honest verdict on ANCHOR-001/PORT.md §7's second open question —
*"Line-art plans … either (a) an intermediate orthophoto/raster base map,
or (b) a geometric (wall-line) registration lane"* — as measured on the
Farnsworth/HABS IL-323 fixture (REAL plan, REAL photographs, DERIVED-DRILL
instruments, 26/26 fail-closed negatives, all runs deterministic through
the shipped supervised seam).

## The verdict

**Neither lane anchors real photographs to a real line-art plan today.
Both lanes are drill-validated instruments that honestly refuse the real
photoset — and the drills measure exactly why, at each lane's different
stage. Production must not promote either lane for the line-art case
without the specific unblock each one needs (below). The honest
deliverable is the measured refusal plus the two instrument validations.**

## Per lane

**Path (a) — intermediate raster + SIFT/RANSAC + photometric NCC gate.**
Drill-exact: 3/3 known transforms recovered at 0.004–0.013 m realized
RMS with budgets covering. Real photoset: 0/16 — 10 stills refused by
the photometric gate (NCC ≈ 0 vs the 0.25 floor), 6 below the RANSAC
inlier floor. The measured blocker is APPEARANCE, not geometry: the
synthesized intermediate raster carries the drawing's 1950s line-work
appearance, and the 1960s–2020s documentation photographs share no
texture with it (the ANCHOR-003b cross-vintage finding, reproduced on
the line-art fixture).
**Unblock:** a same-vintage or appearance-free verification gate (e.g.,
geometric-only verification of the SIFT fits, or an intermediate raster
derived to be texture-neutral), each with its own drill + discriminator
validation before any relaxation of the NCC gate — the gate is what
keeps this lane honest today.

**Path (b) — vp-rectified-line-search/3 geometric wall-line lane.**
Drill-honest: 1/3 anchored (1.81 m realized on an oblique drill; the
first-order budget under-covers — recorded), 2/3 refused as ambiguous
where dense-ink false minima measured TIED with the truth (196 vs 198)
— refused rather than chosen; the /2's false-anchor soundness hole
(26.9 m realized at confidence 0.89) was measured, fixed in /3, and the
fix history is declared in the version echo. Real photoset: 0/16 — 14
stills never rectify (no consistent Manhattan frame in real-photo LSD
structure: trees, furniture, mixed-era details), 2 refuse as ambiguous
at low support.
**Unblock:** the front end — Manhattan-frame rectification robust to
real photograph line structure (e.g., dominant-two-line-orientation
estimation with outlier families, or a horizon-first pipeline), plus
empirical budget calibration. The back end (search/refine/gates) is
drill-validated and its failure modes are measured.

## What ANCHOR-007 adds to the record

1. The two-lane question of §7 is now MEASURED, not speculative: path
   (a) fails on appearance, path (b) fails on rectification — different
   stages, both honest, both with drill-proven instruments behind them.
2. The 003b finding-#2 law (declared, versioned verification gates)
   carried into a second method family: path (b)'s geometric gates are
   declared in-config, and the drills measured their necessity (the
   share floor's 26–41% false vs 54–65% truth gap; the ambiguity gate's
   twin-tie refusals).
3. A reusable measurement pattern for future anchoring spikes: drills
   with KNOWN transforms + a realized-error instrument with
   visible-footprint restriction + budget-coverage checking + a
   wrong-building discriminator in the negative ledger.

## If a production Work Item follows

- Keep the closed `plan-raster` vocabulary (neg-009 on both lanes); the
  line-art character stays in declared adapter methods.
- Do NOT relax any gate without a new drill + negative set that would
  have caught the /2's 26.9 m false anchor — that anchor passed
  support, spread, RMS and margin gates; only the share floor (added in
  /3 with its measured justification) and the ambiguity tie-refusal
   stand between the current instrument and that class.
- The real-photoset refusals are the honest baseline to beat: any
  future lane must anchor MORE than 0/16 while keeping 26/26
  fail-closed and drill-realized errors measured and budget-covered.
