import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/page-guard";
import { getVersion, listModels } from "@/server/model-store";
import { projectModelVersion } from "@/server/model-view";
import { WorkspaceShell } from "@/components/workspace-shell";

/**
 * `/models/[modelId]/v/[version]` — THE engineering workspace
 * (AC-080/081/082): the 3D shell + object list + property
 * inspector, over the authoritative read-only view.
 *
 * The server loads and re-validates the canonical graph (the
 * store's integrity-checked read), projects the serializable
 * read-only view, and hands it to the client shell — the
 * browser never touches canonical state.
 */
export default async function ModelWorkspacePage({
  params,
}: {
  params: Promise<{ modelId: string; version: string }>;
}) {
  await requireSession();
  const { modelId, version } = await params;
  if (!/^\d+$/.test(version)) {
    notFound();
  }
  if (!listModels().some((candidate) => candidate.modelId === modelId)) {
    notFound();
  }
  const stored = getVersion(modelId, Number(version));
  if (stored === undefined) {
    notFound();
  }
  const view = projectModelVersion(stored.graph, stored.record.version);

  return (
    <main className="page page-wide">
      <header className="page-header">
        <div>
          <nav className="crumb">
            <Link href="/models">Models</Link> <span>/</span>{" "}
            <Link href={`/models/${modelId}`}>{modelId}</Link> <span>/</span>{" "}
            <span>v{view.version}</span>
          </nav>
          <h1>
            {modelId} <span className="dim">v{view.version}</span>
          </h1>
          <p className="page-sub mono">{view.digest.slice(0, 32)}…</p>
        </div>
      </header>
      <WorkspaceShell model={view} />
    </main>
  );
}
