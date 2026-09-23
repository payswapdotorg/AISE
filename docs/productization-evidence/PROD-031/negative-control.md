# PROD-031 negative control — the solution surface at the PRE-FIX tree

Captured 2026-09-23T01:35:52Z at branch tip 4297ef6 (the pre-fix tree: the starting
contribution mounted, no PROD-031 changes) — `bun /tmp/prod031/negative-control.ts`
over tools/web-bundle/gate.ts's mountSolutionSurfaceInChromium + startLocalDeploymentStack
(built bundle + session-authenticated local backend, demo session entered through
the honest UI gate).

```
shell mounted: true
demo session entered: true
workspace mounted (#solution-workspace): false
browser mount marker: null
engine-unavailable panel: true
pageerror events: 0
```

The documented degradation (PROD-026's lazy-mount law): the local engine mount's
journey rejects in the plain browser (the externalized node:crypto stub throws at
call time), no second rung exists yet, and the honest engine-unavailable panel
renders — zero page errors. After the PROD-031 fix the SAME check mounts the
workspace (see gate-outputs.md).
