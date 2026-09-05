# @aise/backend-reporting

AISE deterministic evidence-linked site report — **AISE-019** (HIGH_ASSURANCE).

Structured report content + PDF rendering derived from the canonical
Reality Graph (AISE-011), the optional evidence graph (AISE-012) and the
plan projection ([AISE-017](../export/2d), the declared dependency),
behind a clean service boundary. The report is **derived state**; it
never becomes a second source of truth (architecture-lock).

## What it does

`siteReportOf(graph, options)` is a **pure function** producing the
report content; `renderSiteReportPdf(report)` renders it into a
deterministic PDF 1.4 document:

| Section | Acceptance | Content |
|---|---|---|
| 1. Project and capture metadata | **AC-120** | project/model identity, graph digest, declared frame, spaces, content-pinned capture inputs (scene + extraction pins with hashes) |
| 2. Model status | **AC-121** | weakest-link epistemic state, per-state/per-class counts, evidence live/retracted counts, plan projected/unprojected |
| 3. Measurements | **AC-121** | canonical quantities **VERBATIM** (value, unit, uncertainty, estimate-vs-measurement kind, assertion status) — never recomputed |
| 4. Object inventory | **AC-122** | per-object epistemic badge + attached evidence statuses (passthrough — never upgraded) |
| 5. Evidence records | source links | record kind, status (LIVE / LINK_RETRACTED / RECORD_RETRACTED), subject, source pins (capture session/asset/hash, measurement method, observation statement), recordedBy/recordedAt verbatim |
| 6. Issues | **AC-121** | unprojected objects (honest reasons) + retracted evidence — never silently dropped |
| 7. Images and capture assets | **AC-121** | asset references by content hash (**referenced, not embedded** — declared v1 limitation) |
| 8. Plan drawing | dependency | presentation-scaled line rendering of the AISE-017 plan projection with a scale bar honestly labeled "not a measurement" |
| 9. Limitations | honesty | the site-report limitations AND the AISE-017 projection limitations verbatim |

## Determinism

Pure functions of immutable inputs; canonical graph object order
throughout; fixed pagination rules (A4 portrait, fixed margins and line
heights); fixed 2-decimal PDF coordinates; the PDF writer embeds **no
wall-clock timestamps** (/CreationDate and /ModDate omitted) and no
document ID — repeated renders are byte-identical. No clock, no
randomness, no environment reads in the composition path
(source-scanned and tested).

## Text encoding

PDF content is ASCII-only (WinAnsi subset of the base-14 Helvetica
fonts): display prose is **deterministically transliterated**
(em-dash → `-`, `±` → `+/-`, `°` → `deg`); any unmappable character
fails closed (`TEXT_UNENCODABLE`) rather than being silently mangled.
Machine-readable values (quantities, hashes, IDs) are never rewritten.

## Evidence discipline (mirrors AISE-018)

- Evidence is surfaced **only** for a supplied evidence graph, and only
  for links pinned to **this model and version** (`version` is REQUIRED
  when evidence is supplied — subjects are version-pinned).
- Live AND retracted links are both visible with honest statuses;
  retractions surface again as issues.
- Without an evidence graph the report claims no evidence at all
  (absence is honest — nothing is fabricated).

## Declared v1 limitations (embedded in every artifact)

1. images/capture assets are referenced by content hash, never
   embedded (no raster data in v1 reports);
2. the plan drawing is presentation-scaled (the scale factor is
   derived for display; canonical quantities are the measurement
   authority);
3. no wall-clock timestamps in the PDF (determinism) — temporal facts
   appear only where evidence records carry them verbatim;
4. the full list travels inside every rendered report (section 9).

## Service composition

`buildReportingService(config, logger, options?)` adds bounded compute
(`maxGraphObjects`, default 100,000; `maxOutputBytes`, default 64 MiB)
and per-call structured debug logging (graph digest, counts, pages,
bytes — never payloads). `main.ts` is the standard fail-closed
boot/SIGTERM entry (v1 library limitation: no external request intake
yet).
