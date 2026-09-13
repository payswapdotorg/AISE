# AISE Reconstruction Engine Contract

**Status:** FROZEN with architecture 2.2
**Authority:** AISE architecture / ACR-003

This contract is the stable boundary between AISE and any reconstruction, spatial-intelligence, world-model, photogrammetry, depth-fusion or future engine.

## Principle

An engine is a replaceable evidence-processing provider. It produces candidate derived artifacts; AISE owns engineering meaning, provenance, uncertainty, assurance, verification and canonical Reality Graph state.

## Provider descriptor

Each registered provider exposes:

```text
provider_id
provider_version
adapter_version
supported_input_modalities
required_input_metadata
supported_output_modalities
coordinate_frames
scale_modes
scene/object capabilities
uncertainty capabilities
execution requirements
network/access requirements
license/terms metadata
cost/latency characteristics
benchmark profile
availability/readiness state
```

## Request

```text
ReconstructionRequest
  task_id
  assurance_profile
  evidence_ids[]
  capture_session_id
  camera/pose/calibration references
  requested representations
  requested spatial scope
  coordinate/scale constraints
  device/environment metadata
  policy/resource constraints
```

## Result

```text
ReconstructionResult
  candidate_artifact_ids[]
  representation_type
  source_evidence_ids[]
  provider_id/version
  model/checkpoint identity
  parameter/config digest
  coordinate-frame declaration
  transforms
  scale declaration
  quality diagnostics
  uncertainty/limitations
  generated-versus-observed flags
  execution metadata
  provenance links
```

## Stable output classes

Providers may return one or more of:

- mesh;
- point cloud;
- depth maps;
- camera poses;
- 3D Gaussian splat or equivalent view-synthesis representation;
- novel-view images/video;
- per-object geometry;
- semantic candidates;
- provider-native metadata.

Provider-native representations must be normalized into an AISE candidate artifact envelope without forcing the provider's internal representation into the Reality Graph.

## Provider selection

Selection is determined by the AISE orchestration layer using task and evidence compatibility, not by hard-coded provider identity.

Illustrative policy:

```text
engineering task + assurance
        ↓
existing evidence characterization
        ↓
provider capability filter
        ↓
access/resource/policy filter
        ↓
benchmark/performance profile
        ↓
primary provider + fallback providers
        ↓
run / compare / escalate
```

Selection can change between projects, devices, tasks and runtime conditions.

## Multi-provider execution

AISE may run multiple providers against identical evidence for:

- fallback;
- comparison;
- regression detection;
- cross-checking;
- ensemble reconstruction.

Provider outputs remain individually identifiable. Fusion is another explicitly derived operation with its own provenance.

## Imagination and generated completion

Some world models can infer or generate plausible geometry outside directly observed regions. AISE MUST label the epistemic distinction between:

`DIRECTLY_OBSERVED`, `RECONSTRUCTED_FROM_OBSERVED_EVIDENCE`, `INFERRED`, `GENERATED_COMPLETION`, `UNKNOWN`.

Generated completion can support visualization and hypothesis generation. It cannot become an observed or confirmed engineering fact without qualifying evidence.

## Engine compatibility examples

### WorldSculpt
Best suited as a multi-view/object-compositional reconstruction provider. AISE should retain its metric-world transforms, object-level outputs and model/checkpoint provenance.

### World Labs Atlas
Potentially useful for sparse-image/video reconstruction, novel-view synthesis, depth and 3D world reconstruction, subject to access/terms and benchmark qualification. AISE must treat generated completion as potentially imaginative outside observed support.

### Magic Leap Atlas
Useful as a posed-image scene reconstruction provider and benchmark/reference implementation, subject to its older runtime assumptions and coordinate/pose requirements.

### Future engines
Any future model can implement this contract. Adding a provider should normally require only:

```text
adapter
provider descriptor
input/output translation
provenance mapping
benchmark profile
verification fixtures
```

unless it requires a change to an AISE architectural authority.

## Failure semantics

A provider may report:

`UNAVAILABLE`, `ACCESS_REQUIRED`, `INPUT_INCOMPATIBLE`, `RESOURCE_INSUFFICIENT`, `EXECUTION_FAILED`, `OUTPUT_INVALID`, `QUALITY_INSUFFICIENT`, `PARTIAL`, `READY`.

Failure must be explicit. The orchestrator may select another qualified provider or request additional evidence. It may not silently lower the assurance target.
