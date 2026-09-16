/**
 * PROD-002/010 — the Projects surface: the requester-guarded organization
 * registry list (re-keyed on sign-in/probe completion — never a stale
 * principal's answer) plus the brokered NewProjectPanel (identity:write).
 *
 * Honesty: the list is what the identity registry answers for ONE
 * organization and the ACTING principal (`?requester=`); the panel's write
 * is offered ONLY through the AISE-040 broker (an explicit `allowed`
 * decision of `identity:write` enables it) and is honestly DISABLED in
 * demo mode — this shell never fabricates writes.
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { formatRoute, PROJECT_SURFACES, projectSurfaceRoute } from "../router";
import { useResource, type ResourceOutcome } from "../resource";
import { isDemoMode, useAppEnvironment } from "../environment";
import {
  createLiveAuthorizationPort,
  createProjectLive,
  describeApiFailure,
  loadProjectsLive,
} from "../api";
import {
  createRecordAction,
  projectsResourceKey,
  resolveCreateActionOffer,
  validateNewProjectDraft,
  type CreateActionOffer,
  type NewProjectDraft,
} from "../create-forms";
import { DEMO_ORG_ID, demoProjects } from "../demo";
import {
  Card,
  CreateField,
  CreateRecordPanel,
  DataBadge,
  EmptyState,
  ResourceView,
  type CreatePanelOutcome,
} from "../components";

/** One project entry the surface can list. */
export interface ProjectEntry {
  readonly projectId: string;
  readonly name: string;
  readonly note: string;
}

/** What the Projects surface renders once loaded. */
export interface ProjectsData {
  readonly mode: "demo" | "api";
  readonly entries: readonly ProjectEntry[];
}

/** The per-session org store key (last-used org; hand-entry stays). */
const ORG_STORAGE_KEY = "aise.organization";

/** Read the last-used organization id (null when no session storage exists). */
function readStoredOrganizationId(): string | null {
  try {
    if (typeof sessionStorage === "undefined") {
      return null;
    }
    const value = sessionStorage.getItem(ORG_STORAGE_KEY);
    return value === null || value.trim().length === 0 ? null : value;
  } catch {
    return null;
  }
}

/** Persist the last-used organization id (best-effort; never throws). */
export function storeOrganizationId(organizationId: string): void {
  try {
    if (typeof sessionStorage !== "undefined" && organizationId.trim().length > 0) {
      sessionStorage.setItem(ORG_STORAGE_KEY, organizationId.trim());
    }
  } catch {
    // The session store is a convenience, never a dependency.
  }
}

/**
 * The organization id the surface acts on: the demo org in demo mode (the
 * demo tenant's own org, verbatim), the last-used org of this session
 * otherwise — hand-entry REMAINS the authority.
 */
export function defaultOrganizationId(demo: boolean): string {
  if (demo) {
    return DEMO_ORG_ID;
  }
  return readStoredOrganizationId() ?? DEMO_ORG_ID;
}

/** The Projects surface. */
export function Projects(): ReactNode {
  const environment = useAppEnvironment();
  const demo = isDemoMode(environment) || environment.apiStatus === null;
  const mode = demo ? "demo" : "live";
  const [organizationId, setOrganizationId] = useState(() => defaultOrganizationId(demo));
  const load = useCallback(async (): Promise<ResourceOutcome<ProjectsData>> => {
    if (demo) {
      const entries: readonly ProjectEntry[] = demoProjects().map((project) => ({
        projectId: project.projectId,
        name: project.name,
        note: project.note,
      }));
      return { kind: "ready", data: { mode: "demo", entries } };
    }
    // Live mode: the organization registry's guarded read (the acting
    // principal rides ?requester= — the identity router's requirement).
    const registry = await loadProjectsLive(environment.fetchImpl, organizationId, environment.principalId);
    if (!registry.ok) {
      return { kind: "error" as const, message: describeApiFailure(registry.failure) };
    }
    const entries: readonly ProjectEntry[] = registry.projects.map((project) => ({
      projectId: project.record.projectId,
      name: project.record.name,
      note: `registered in organization ${organizationId} — listed from the identity registry (guarded read, requester ${environment.principalId}).`,
    }));
    return { kind: "ready", data: { mode: "api", entries } };
  }, [demo, environment, organizationId]);

  // The registry list is requester-guarded: the key changes with the mode
  // AND the acting principal (a sign-in re-loads, never shows the previous
  // principal's answer) AND the organization the list is scoped to.
  const { state, reload } = useResource(
    `${projectsResourceKey(mode, environment.principalId)}:${organizationId}`,
    load,
  );

  return (
    <>
      <div className="page-head">
        <h1>Projects</h1>
        <p>
          Open a project to walk the golden journey: evidence, SiteTwin, BOQ
          understanding, engineering case and intervention design.
        </p>
      </div>
      <Card
        title="Organization"
        meta={<span>the registry list is organization-scoped — hand-entry stays</span>}
      >
        <CreateField
          label="Organization id"
          value={organizationId}
          onChange={(value) => {
            setOrganizationId(value);
            if (!demo) {
              storeOrganizationId(value);
            }
          }}
          hint={
            demo
              ? "Demo mode — the demo tenant's organization (org-northwind), verbatim."
              : "Prefilled with the last-used organization of this session; the identity API owns the registry."
          }
        />
      </Card>
      <ResourceView
        state={state}
        loadingLabel="Loading projects…"
        onRetry={reload}
        render={(data) => <ProjectsBody mode={data.mode} entries={data.entries} />}
      />
      <NewProjectPanel
        mode={demo ? "demo" : "api"}
        organizationId={organizationId}
        principalId={environment.principalId}
        fetchImpl={environment.fetchImpl}
        authorization={demo ? undefined : createLiveAuthorizationPort(environment.fetchImpl)}
        onCreated={reload}
      />
    </>
  );
}

export function ProjectsBody({
  mode,
  entries,
}: {
  readonly mode: "demo" | "api";
  readonly entries: readonly ProjectEntry[];
}): ReactNode {
  return (
    <div className="grid grid-2">
      {entries.length === 0 ? (
        <Card title="Projects" badge={<DataBadge mode={mode} />}>
          <EmptyState
            title="No projects are known to this organization yet"
            guidance={
              mode === "demo"
                ? "The demo dataset lists its two fixture projects; an empty demo list would mean the fixtures changed — this is not missing data."
                : "This organization's registry is empty. The first project can be created right here — the panel below offers the identity API's create-project act through the authorization broker."
            }
            action={
              <a className="button" href="#create-project">
                Create your first project
              </a>
            }
          />
        </Card>
      ) : (
        entries.map((entry) => (
          <Card
            key={entry.projectId}
            title={entry.name}
            badge={<DataBadge mode={mode} />}
            meta={<span className="mono">{entry.projectId}</span>}
          >
            <p>{entry.note}</p>
            <div className="toolbar">
              <a className="button" href={formatRoute({ name: "project", projectId: entry.projectId })}>
                Open project
              </a>
            </div>
            <ul className="pill-list">
              {PROJECT_SURFACES.map((surface) => (
                <li key={surface.surface}>
                  <a
                    className="button button-secondary button-small"
                    href={formatRoute(projectSurfaceRoute(surface.surface, entry.projectId))}
                  >
                    {surface.label}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}

/**
 * The brokered create-project panel (identity:write). The authorization
 * question is asked only once the draft forms the target + return address;
 * success offers the created record + the "Open project" deep link and the
 * caller reloads the registry list.
 */
export function NewProjectPanel({
  mode,
  organizationId,
  principalId,
  fetchImpl,
  authorization,
  onCreated,
}: {
  readonly mode: "demo" | "api";
  readonly organizationId: string;
  readonly principalId: string;
  readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  readonly authorization?: Parameters<typeof resolveCreateActionOffer>[0]["authorization"];
  readonly onCreated: () => void;
}): ReactNode {
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [actor, setActor] = useState(principalId);
  const [offer, setOffer] = useState<CreateActionOffer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<CreatePanelOutcome | null>(null);

  const draft: NewProjectDraft = { organizationId, projectId, name, actor };
  const defects = validateNewProjectDraft(draft);
  const askable = mode === "api" && organizationId.trim() !== "" && projectId.trim() !== "";

  useEffect(() => {
    if (!askable) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    void resolveCreateActionOffer({
      authorization,
      descriptor: createRecordAction({
        actionId: "create-project",
        label: "Create project",
        permission: "identity:write",
        sourceModule: "identity",
      }),
      bindingId: "projects:create-project",
      // The return address is the NEW project's own context record (the
      // journey continues there once it exists).
      returnTo: { module: "context", projectId },
      principalId,
      target: { kind: "organization", organizationId },
    }).then((resolved) => {
      if (!cancelled) {
        setOffer(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [askable, authorization, organizationId, principalId, projectId]);

  const submit = useCallback(async () => {
    if (mode !== "api" || defects.length > 0 || submitting) {
      return;
    }
    setSubmitting(true);
    const result = await createProjectLive(fetchImpl, organizationId, {
      projectId,
      name,
      actor,
    });
    setSubmitting(false);
    if (result.ok) {
      setOutcome({
        kind: "created",
        detail: `Project ${result.record.projectId} (“${result.record.name}”) registered in organization ${organizationId}.`,
        endpoint: result.endpoint,
      });
      onCreated();
    } else {
      setOutcome({ kind: "failed", detail: describeApiFailure(result.failure) });
    }
  }, [actor, defects.length, fetchImpl, mode, name, onCreated, organizationId, projectId, submitting]);

  return (
    <CreateRecordPanel
      id="create-project"
      title="Create a project"
      intro="Projects are registered in the identity registry through the organization endpoint (POST /v1/identity/organizations/:id/projects). The panel is offered only when the broker answers an explicit identity:write ALLOWED for the acting principal."
      offer={offer}
      mode={mode}
      draftValid={defects.length === 0}
      defects={defects}
      submitting={submitting}
      outcome={outcome}
      onSubmit={() => {
        void submit();
      }}
      submitLabel="Create project"
    >
      <CreateField label="Project id" value={projectId} onChange={setProjectId} hint="The registry's own id for the new project (1..256 characters)." />
      <CreateField label="Project name" value={name} onChange={setName} mono={false} />
      <CreateField
        label="Actor (the acting principal)"
        value={actor}
        onChange={setActor}
        hint="The identity contract's actor — prefilled with the acting principal; hand-entry stays."
      />
      {outcome !== null && outcome.kind === "created" ? (
        <div className="toolbar">
          <a className="button" href={formatRoute({ name: "project", projectId })}>
            Open project
          </a>
        </div>
      ) : null}
    </CreateRecordPanel>
  );
}
