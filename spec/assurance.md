# AISE v2 Assurance Model

## Profiles

| Profile | Example | Core proof |
|---|---|---|
| LIGHT | navigation/cosmetic | unit/static + review |
| STANDARD | ordinary workflows | unit + integration + regression |
| HIGH_ASSURANCE | general reconstruction, BOQ interpretation, exports | contract + benchmark + evidence review |
| CRITICAL | engineering measurements, consequential diagnosis, compliance, intervention decisions | physical/golden benchmark + uncertainty + mutation/discrimination + independent review |

Assurance profiles define proof depth, never authority semantics.

## Readiness dimensions

A task may be visually complete but not engineering-ready. Track independently:

- spatial coverage;
- geometry completeness;
- semantic completeness;
- metric certainty;
- evidence completeness;
- task readiness.

## Device-aware assurance rule

The declared task assurance is immutable during capture planning. If a device cannot satisfy preferred evidence requirements, AISE may:

1. request additional guided evidence;
2. substitute a weaker evidence method with explicit uncertainty;
3. request a reference/control measurement;
4. request a specialist instrument/device;
5. declare the task not ready.

It may not silently lower assurance.

## Evidence-gap scoring

Each gap should contain at least:

```text
impactOnTask
expectedUncertaintyReduction
operatorEffort
recoverability
riskIfUnresolved
```

Recommended next actions should maximize useful information per unit of operator effort subject to safety/policy.

## Critical gates

Critical work must prove:

- source/evidence immutability;
- uncertainty semantics;
- negative/unknown behavior;
- deterministic measurement behavior;
- regression against golden captures;
- critical-class performance;
- discrimination of the protection claimed;
- physical/reality validation where applicable.

## Engineering reasoning gate

AI-generated diagnoses and interventions remain advisory until evidence, deterministic rules and required human review satisfy the relevant task profile.
