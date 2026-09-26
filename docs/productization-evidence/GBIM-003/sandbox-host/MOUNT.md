# GBIM-003 — Sandbox host mounting (how the browser sandbox runs)

The spike app (`apps/spatial-studio-spike/`) is deliberately NOT a workspace member (it adds no
`package.json`, so the root `package.json`/`bun.lock` stay frozen). It is mounted by a bundler
host. This directory records the exact host wiring used for the delivered, browser-verified
sandbox (a Next.js 16 App Router host):

## Host setup

1. **tsconfig paths** (host `tsconfig.json` `compilerOptions.paths`):

```json
{
  "@aise/solution-contract/browser": ["./AISE/packages/solution-contract/src/browser.ts"],
  "@aise/solution-contract": ["./AISE/packages/solution-contract/src/index.ts"],
  "@aise/solution-engine": ["./AISE/packages/solution-engine/src/index.ts"],
  "@aise/solution-boq": ["./AISE/packages/solution-boq/src/index.ts"],
  "@aise/shared-contracts": ["./AISE/packages/shared-contracts/src/index.ts"],
  "@aise/solution-compiler": ["./AISE/backend/api/src/reasoning/solution/compiler.ts"],
  "@aise/solution-compiler/model": ["./AISE/backend/api/src/reasoning/solution/model.ts"],
  "@spike/*": ["./AISE/apps/spatial-studio-spike/src/*"]
}
```

2. **Renderer externals** (host): `bun add three @types/three web-ifc`, then copy
   `node_modules/web-ifc/web-ifc.wasm` to the host `public/` dir (the IFC lane loads it from
   `/web-ifc.wasm` with `SetWasmPath("/", true)`).

3. **The page** (`page.tsx`, this directory): a client component that dynamic-imports
   `SandboxApp` from `@spike/client/components/SandboxApp` with `ssr: false` (Three.js needs the
   browser).

4. **The nine API routes** (`routes/`, this directory — thin delegators, each ~10 lines):
   `open`, `reset`, `preview`, `apply`, `revise-opening`, `agent-compile`, `identity`,
   `evidence`, `ifc`. All canonical work happens in `@spike/server/workspace`
   (`apps/spatial-studio-spike/src/server/workspace.ts`) and, for the agent lane, in the REAL
   compiler imported from the AISE backend sources (`@aise/solution-compiler` — the backend zone
   may not be imported from the apps zone inside the repo, which is why this import lives in the
   HOST, mirroring how `apps/web` calls backend routes over HTTP in production).

5. **The agent trace recorder** (`record-agent-trace.ts`, this directory):
   `bun src/scripts/record-agent-trace.ts` from the host root compiles the canonical
   equivalence utterance through the real compiler and writes
   `AISE/docs/productization-evidence/GBIM-003/results/agent-trace.json` (consumed by the
   clone-side check runner's `direct-nl-equivalence` check).

## Why the split is lawful

- The spike sources import AISE packages by RELATIVE source paths from the apps zone
  (boundary-legal: apps→packages) so they run unchanged under `bun` inside the clone.
- The host imports the backend compiler (backend zone) — allowed only in the host, which is not
  inside the repo's import-zone matrix; production reaches the same code over HTTP
  (`POST /v1/solution-agent/compile`), and the sandbox keeps that separation by routing
  compilation through its own server-side API route.
- The client code imports ONLY `@aise/solution-contract/browser` (the crypto-free PROD-031 cut)
  — identity derivations stay server-side (`/api/spike/identity`).
