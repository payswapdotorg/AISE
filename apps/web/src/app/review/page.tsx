import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/page-guard";
import { getVersion, listModels, listVersions } from "@/server/model-store";
import { projectReviewWorkspace, reviewableModels, ReviewViewError } from "./server/review-view";
import { ReviewShell } from "./components/review-shell";

/**
 * `/review` — THE evidence-aware review workspace (AISE-016):
 * object selection, evidence, properties, uncertainty,
 * confidence, epistemic state, and the governed
 * review/correction decision path.
 *
 * The server composes the authoritative read view (model graph
 * + evidence mapping validity + readiness reports — all
 * re-validated on read) and hands the serializable projection
 * to the client shell. The browser never touches canonical
 * state; the ONLY write channel is the governed decide route,
 * which commits new versions through the canonical
 * constructors.
 *
 * Version selection: `/review` serves the latest committed
 * version (the review frontier); `/review?v=N` pins one
 * committed version (immutable history remains reviewable).
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const session = await requireSession();
  const { v } = await searchParams;

  const models = reviewableModels();
  if (models.length === 0) {
    notFound();
  }
  const modelId = models[0];

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
  if (version === undefined || !listModels().some((model) => model.modelId === modelId)) {
    notFound();
  }
  if (getVersion(modelId, version) === undefined) {
    notFound();
  }

  let view;
  try {
    view = projectReviewWorkspace(modelId, version);
  } catch (error) {
    if (error instanceof ReviewViewError) {
      notFound();
    }
    throw error;
  }

  return (
    <main className="page page-wide">
      <header className="page-header">
        <div>
          <nav className="crumb">
            <Link href="/models">Models</Link> <span>/</span> <Link href={`/models/${modelId}`}>{modelId}</Link>{" "}
            <span>/</span> <span>review</span>
          </nav>
          <h1>
            Evidence Review <span className="dim">{modelId}</span>
          </h1>
          <p className="page-sub mono">
            v{view.version} · graph {view.graphDigest.slice(0, 16)}… · mapping{" "}
            {view.mappingDigest !== undefined ? `${view.mappingDigest.slice(0, 16)}…` : "absent"}
          </p>
          <p className="page-sub dim">
            Signed in as <span className="mono">{session.user}</span> — every decision commits a new governed
            version; nothing is edited in place.
          </p>
        </div>
      </header>
      <ReviewShell view={view} />
    </main>
  );
}
