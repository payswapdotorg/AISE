# AISE v2 Canonical Domain Model

The model is intentionally richer than any export format and is the sole semantic contract for product state.

## Entity families

### Project
`Organization`, `Project`, `Site`, `Building`, `Level`, `Space`.

### Reality
`RealityObject`, `GeometryAsset`, `Property`, `Measurement`, `Relationship`, `Observation`, `Issue`.

### Acquisition
`DeviceCapabilityProfile`, `CaptureMission`, `CaptureStep`, `CaptureSession`, `CaptureAsset`, `ReferenceControl`, `EvidenceGap`, `ObservationEpisode`.

### Evidence
`Evidence`, `ProvenanceLink`, `Derivation`, `EvidenceBundle`.

### Assurance/verification
`AssuranceProfile`, `ReadinessAssessment`, `VerificationRun`, `VerificationFinding`, `RuleResult`, `ReviewDecision`.

### BOQ
`BOQDocument`, `BOQRevision`, `BOQSection`, `BOQItem`, `BOQQuantity`, `BOQCost`, `ScopeInterpretation`, `CostScopeMapping`.

### Intervention
`EngineeringCase`, `DiagnosisHypothesis`, `InterventionScenario`, `InterventionStep`, `InterventionState`, `ExecutionRecord`, `OutcomeObservation`.

### Integration/adoption
`ExternalReference`, `ImportJob`, `Export`, `ConnectorBinding`, `ConnectorCapability`, `SyncCheckpoint`, `AuditEvent`, `IncumbentWorkflow`, `WorkflowStep`, `MigrationCandidate`, `SemanticEquivalenceRecord`, `MigrationState`, `RollbackPlan`, `IntegrationReadinessAssessment`.

## Property assertion shape

Every consequential property can be represented as:

```text
value
unit
status: OBSERVED | INFERRED | CONFIRMED | PROPOSED
confidence: optional probabilistic/qualitative support
uncertainty: dimensional/statistical/interval uncertainty where applicable
method
source_evidence[]
verified_by
verified_at
```

## Capture semantics

`DeviceCapabilityProfile` is a session-time snapshot, not a static marketing label. It records actual capabilities exposed by the device and environment.

`CaptureMission` defines required evidence for an intent. `CaptureStep` is an executable operator action. `EvidenceGap` represents missing/weak/ambiguous knowledge. `ObservationEpisode` binds a factual update to its acquisition event.

## Multi-dimensional readiness

A `ReadinessAssessment` must not collapse all quality into one number. Minimum dimensions:

```text
spatialCoverage
geometryCompleteness
semanticCompleteness
metricCertainty
evidenceCompleteness
taskReadiness
```

## BOQ semantics

BOQ data can represent intended scope, tender scope, priced scope or measured scope. `ScopeInterpretation` and `CostScopeMapping` are explicit derived objects. Original source cells/pages are retained. A BOQ item can map to zero, one or many Reality Objects.

## Integration semantics

`ExternalReference` identifies the external system, record identity, revision/version, timestamps and source-of-record role. `ConnectorBinding` exposes typed capabilities without granting ownership of AISE truth. `SyncCheckpoint` records synchronization lineage and conflict state.

An `IncumbentWorkflow` records the existing operational workflow. `MigrationCandidate` identifies an AISE replacement boundary. `SemanticEquivalenceRecord` captures how equivalence was established. `MigrationState` is progressive and reversible. `RollbackPlan` must remain available until operational acceptance. Migration never changes an external source of record implicitly.

## Codex vertical semantics

A Codex integration is represented as external integration metadata and capability bindings. It may orchestrate AISE operations but cannot become the owner of `RealityObject`, `Measurement`, `Evidence`, `ReadinessAssessment`, `InterventionState` or other authoritative AISE domain entities.

## Intervention semantics

`InterventionScenario` references a baseline authoritative model version. Each `InterventionState` references a deterministic transition from the previous state. States are `PROPOSED` until execution evidence is recorded. The same state ID feeds 3D, 2D, BOQ and report projections.

## Versioning

Model, evidence, BOQ revisions, connector checkpoints and intervention states are append-only/versioned. Reprocessing creates derived versions; it never erases prior source evidence or historical observations.
