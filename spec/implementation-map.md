# AISE v2 Implementation Map

## Authorities

| Concern | Authority |
|---|---|
| Architecture | `spec/architecture-lock.md` |
| Product requirements | `spec/requirements.md` |
| Canonical semantics | `spec/domain-model.md` + Reality Graph implementation |
| Provenance | Evidence Graph |
| Readiness | Assurance Engine |
| Formal verification | Verification Engine |
| Work scope | `spec/work-items.md` + `spec/work-orders.md` |
| Eligibility | dependency graph + machine state |
| Sequence/progress | roadmap + machine state |

## Surface map

```text
apps/android/**                 Gemini
apps/web/**                     ZAI
backend/api/**                  ZAI
backend/capture/**              ZAI
backend/reality/**              ZAI
backend/evidence/**             ZAI
backend/assurance/**            ZAI
backend/verification/**        ZAI
backend/boq/**                  ZAI
backend/cases/**                ZAI
backend/intervention/**         ZAI
backend/integrations/**         ZAI
packages/engineering-model/**   ZAI
packages/shared-contracts/**    SHARED
benchmarks/**                   ZAI/SHARED by Work Item
docs/reality-lab/**             SHARED
```

## Cross-domain dependency principle

The BOQ, physical reality, documents and intervention scenarios connect through stable Reality Graph identifiers and provenance links. None becomes a competing canonical model.

## Composition checkpoints

After waves 3, 5, 7, 9, 11 and 13, run a composition checkpoint across the new interfaces. A component can be locally green while the composed system is invalid; composition is therefore an explicit acceptance gate.

## Fresh-agent selection

A Tech Lead reads machine state, finds activated/eligible items, selects up to three whose surfaces are disjoint, dispatches them, and waits for objective evidence before advancing the wave.
