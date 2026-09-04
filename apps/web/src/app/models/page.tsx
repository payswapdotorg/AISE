import Link from "next/link";
import { requireSession } from "@/server/page-guard";
import { listModels, listVersions } from "@/server/model-store";

/**
 * `/models` — the authenticated read-only model list (AC-080:
 * the user loads a model in the browser).
 */
export default async function ModelsPage() {
  const session = await requireSession();
  const models = listModels().map((model) => ({
    ...model,
    versions: listVersions(model.modelId),
  }));

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Models</h1>
          <p className="page-sub">
            Read-only workspace — authoritative backend reads, no browser-side canonical state.
          </p>
        </div>
        <div className="page-session">
          <span>{session.user}</span>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="linkish">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <ul className="model-list">
        {models.map((model) => (
          <li key={model.modelId} className="model-card">
            <Link href={`/models/${model.modelId}`} className="model-link">
              <strong>{model.modelId}</strong>
              <span className="model-meta">
                {model.projectId} · {model.versions.length} version
                {model.versions.length === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
