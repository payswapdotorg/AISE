import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/page-guard";
import { listModels, listVersions } from "@/server/model-store";

/**
 * `/models/[modelId]` — the version history (stable routing;
 * prior versions remain discoverable — the architecture's
 * historical-reality invariant, read-only).
 */
export default async function ModelVersionsPage({
  params,
}: {
  params: Promise<{ modelId: string }>;
}) {
  await requireSession();
  const { modelId } = await params;
  const model = listModels().find((candidate) => candidate.modelId === modelId);
  if (model === undefined) {
    notFound();
  }
  const versions = [...listVersions(modelId)].reverse();

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <nav className="crumb">
            <Link href="/models">Models</Link> <span>/</span> <span>{modelId}</span>
          </nav>
          <h1>{modelId}</h1>
          <p className="page-sub">Version history — immutable, read-only.</p>
        </div>
      </header>

      <ul className="version-list">
        {versions.map((version) => (
          <li key={version.version} className="version-card">
            <Link href={`/models/${modelId}/v/${version.version}`} className="version-link">
              <strong>v{version.version}</strong>
              <span className="mono dim">{version.digest.slice(0, 16)}</span>
              <span className="dim">{version.committedAt}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
