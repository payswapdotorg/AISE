# AISE-029 — Reality-vs-Design Comparison

Read-only comparison facts between an authoritative Reality Graph snapshot and a design reference.

## Guarantees

- deterministic correspondence using normalized element kind and position;
- explicit unmatched design/reality elements;
- uncertainty-aware position and size tolerances;
- provenance required on every compared element;
- ambiguous correspondence is `AMBIGUOUS` and fail-closed;
- mismatches carry the design/reality evidence references that support the comparison;
- the report digest is content-bound and validated before acceptance;
- no mutation of the canonical Reality Graph or design authority.

The module intentionally consumes normalized snapshots rather than defining a second canonical model representation.
