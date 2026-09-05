import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/page-guard";
import { listModels, listVersions } from "@/server/model-store";
import { projectPlan2dWorkspace, Plan2dViewError } from "./server/plan-view";
import { PlanShell } from "./components/plan-shell";

/**
 * `/2d` — THE deterministic 2D plan/elevation workspace (AISE-017):
 * vector plan primitives over the canonical Reality Graph, with
 * traceable source IDs, canonical dimensions, epistemic
 * passthrough, and the explicit v1 limitations.
 *
 * The server composes the authoritative model version (the same
 * integrity-checked store read the 3D workspace uses) with the
 * deterministic AISE-017 projection and hands the browser ONLY
 * the derived, read-only document. The browser renders vector
 * geometry; it never computes canonical geometry, and there is no
 * write affordance on this surface — corrections flow through the
 * governed review workspace.
 *
 * Version selection: `/2d` serves the latest committed version;
 * `/2d?v=N` pins one committed version (immutable history remains
 * viewable). View selection: `?view=plan` (default) or
 * `?view=elev+x|elev-x|…` (wall-facing elevations).
 */
export default async function Plan2dPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; view?: string }>;
}) {
  const session = await requireSession();
  const { v, view } = await searchParams;

  const models = listModels();
  if (models.length === 0) {
    notFound();
  }
  const modelId = models[0]!.modelId;

  // Resolve the served version: pinned (?v=N) or latest.
  let version: number | undefined;
  if (v !== undefined) {
    if (!/^\d+$/.test(v)) {
      notFound();
    }
    version = Number(v);
  } else {
    const versions = listVersions(modelId);
    version = versions.length > 0 ? Math.max(...versions.map((entry) => entry.version)) : undefined;
  }
  if (version === undefined) {
    notFound();
  }

  const viewKey = view ?? "plan";

  let workspace;
  try {
    workspace = projectPlan2dWorkspace(modelId, version, viewKey);
  } catch (error) {
    if (error instanceof Plan2dViewError) {
      notFound();
    }
    throw error;
  }

  return (
    <main className="page page-wide">
      <header className="page-header">
        <div>
          <nav className="crumb">
            <Link href="/models">Models</Link> <span>/</span>{" "}
            <Link href={`/models/${modelId}`}>{modelId}</Link> <span>/</span> <span>2D plans</span>
          </nav>
          <h1>
            2D Plans <span className="dim">{modelId}</span>
          </h1>
          <p className="page-sub mono">
            v{workspace.version} · graph {workspace.graphDigest.slice(0, 16)}… ·{" "}
            {workspace.document.counts.projected} primitives · {workspace.document.counts.unprojected}{" "}
            unprojected
          </p>
          <p className="page-sub dim">
            Signed in as <span className="mono">{session.user}</span> — read-only projection; every
            dimension is the canonical model quantity; governed corrections live in{" "}
            <Link href={`/review?v=${workspace.version}`}>the review workspace</Link>.
          </p>
        </div>
      </header>
      <PlanShell view={workspace} />
    </main>
  );
}
