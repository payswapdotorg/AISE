/**
 * PROD-002 — the product web shell's typed hash router.
 *
 * A PURE route codec (no DOM access — the hook subscribes separately, so the
 * codec is trivially testable and deterministic):
 *
 *  - `parseHash("#/projects/p1/boq?item=x")` → a typed {@link Route} or an
 *    explicit `{ name: "not-found" }` — never a silent fallback to a default
 *    surface, never a guess;
 *  - `formatRoute(route)` → the canonical hash text (round-trips verbatim);
 *  - `routeKey(route)` → the stable identity used for React keys/reloads.
 *
 * Entity ids (project ids) are percent-encoded VERBATIM in the path — there
 * is no second id scheme: the routes carry the owning records' own ids.
 * Query parameters are structured (`layer` on the intervention route) and
 * validated: an unknown or malformed parameter makes the route not-found
 * (typed rejection, mirroring the shell library's address discipline).
 */

/** The optional query of the intervention route (the viewed layer + scenario). */
export interface InterventionQuery {
  /** The materialized state layer to view (non-negative integer). */
  readonly layer?: number;
  /** The deep-linked scenario id (percent-encoded verbatim in the query). */
  readonly scenario?: string;
}

/** Every route the product shell can address (the surfaces + meta). */
export type Route =
  | { readonly name: "dashboard" }
  | { readonly name: "projects" }
  | { readonly name: "project"; readonly projectId: string }
  | {
      readonly name: "sitetwin";
      readonly projectId: string;
    }
  | { readonly name: "boq-lens"; readonly projectId: string }
  | { readonly name: "case"; readonly projectId: string }
  | {
      readonly name: "intervention";
      readonly projectId: string;
      readonly query: InterventionQuery;
    }
  | { readonly name: "outcomes"; readonly projectId: string }
  | { readonly name: "settings" }
  | { readonly name: "not-found"; readonly hash: string };

/** The surface name a route renders (navigation grouping). */
export type SurfaceName =
  | "dashboard"
  | "projects"
  | "sitetwin"
  | "boq-lens"
  | "case"
  | "intervention"
  | "outcomes"
  | "settings";

/** The per-project surfaces (everything under `#/projects/:id/…`). */
export type ProjectSurface = "sitetwin" | "boq-lens" | "case" | "intervention" | "outcomes";

/** The per-project surface order (the golden journey order). */
export const PROJECT_SURFACES: readonly {
  readonly surface: ProjectSurface;
  readonly label: string;
}[] = Object.freeze([
  Object.freeze({ surface: "sitetwin", label: "SiteTwin / Evidence" } as const),
  Object.freeze({ surface: "boq-lens", label: "BOQ Lens" } as const),
  Object.freeze({ surface: "case", label: "Engineering Case" } as const),
  Object.freeze({ surface: "intervention", label: "Intervention Studio" } as const),
  Object.freeze({ surface: "outcomes", label: "Outcomes" } as const),
]);

/** The route of one per-project surface (the typed projection of the nav). */
export function projectSurfaceRoute(
  surface: ProjectSurface,
  projectId: string,
): Route {
  switch (surface) {
    case "sitetwin":
      return { name: "sitetwin", projectId };
    case "boq-lens":
      return { name: "boq-lens", projectId };
    case "case":
      return { name: "case", projectId };
    case "intervention":
      return { name: "intervention", projectId, query: {} };
    case "outcomes":
      return { name: "outcomes", projectId };
  }
}

/** Stable identity of a route (React keys, loader cache keys). */
export function routeKey(route: Route): string {
  return formatRoute(route);
}

/** The surface a route renders on the primary navigation. */
export function routeSurface(route: Route): SurfaceName | "projects-overview" | "not-found" {
  switch (route.name) {
    case "dashboard":
      return "dashboard";
    case "projects":
    case "project":
      return "projects";
    case "sitetwin":
      return "sitetwin";
    case "boq-lens":
      return "boq-lens";
    case "case":
      return "case";
    case "intervention":
      return "intervention";
    case "outcomes":
      return "outcomes";
    case "settings":
      return "settings";
    case "not-found":
      return "not-found";
  }
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/** Strictly decode one percent-encoded path segment (null on garbage). */
function decodeSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/**
 * Parse a hash string into a typed route. Unknown paths, empty ids, invalid
 * percent-encodings and unknown query parameters all produce an explicit
 * `not-found` route carrying the offending hash — the caller renders honest
 * guidance, never a fallback surface.
 */
export function parseHash(hash: string): Route {
  if (typeof hash !== "string" || hash.length === 0 || hash === "#" || hash === "#/") {
    return { name: "dashboard" };
  }
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw.startsWith("/")) {
    return { name: "not-found", hash };
  }
  const [path, query] = splitQuery(raw);
  // Empty path segments are invalid (an empty project id or surface name is
  // a typed rejection) — segments are NOT filtered away silently.
  const segments = path === "/" ? [] : path.split("/").slice(1);

  if (segments.length === 0) {
    return query === null ? { name: "dashboard" } : { name: "not-found", hash };
  }

  const head = segments[0];

  if (segments.length === 1) {
    if (head === "projects") {
      return rejectQuery(query, hash, { name: "projects" });
    }
    if (head === "settings") {
      return rejectQuery(query, hash, { name: "settings" });
    }
    return { name: "not-found", hash };
  }

  if (head === "projects" && segments.length >= 2) {
    const projectId = decodeSegment(segments[1] ?? "");
    if (projectId === null || projectId.trim().length === 0) {
      return { name: "not-found", hash };
    }
    if (segments.length === 2) {
      return rejectQuery(query, hash, { name: "project", projectId });
    }
    if (segments.length === 3) {
      const surface = segments[2];
      if (
        surface === "sitetwin" ||
        surface === "boq-lens" ||
        surface === "case" ||
        surface === "outcomes"
      ) {
        return rejectQuery(query, hash, { name: surface, projectId });
      }
      if (surface === "intervention") {
        return parseInterventionQuery(query, projectId, hash);
      }
      return { name: "not-found", hash };
    }
    return { name: "not-found", hash };
  }

  return { name: "not-found", hash };
}

/** Split a raw path into [path, queryString|null]. */
function splitQuery(raw: string): [string, string | null] {
  const index = raw.indexOf("?");
  if (index < 0) {
    return [raw, null];
  }
  return [raw.slice(0, index), raw.slice(index + 1)];
}

/** Return the route when no query string is present; otherwise not-found. */
function rejectQuery(query: string | null, hash: string, fallback: Route): Route {
  if (query === null || query === "") {
    return fallback;
  }
  return { name: "not-found", hash };
}

/**
 * Parse the intervention route's query parameters (`layer`, `scenario`) —
 * the `?layer=` precedent: percent-encoded verbatim ids, typed rejections
 * for unknown keys, blank/malformed values, and ANY parse order. The
 * canonical formatting order is `layer` first, then `scenario`.
 */
function parseInterventionQuery(
  query: string | null,
  projectId: string,
  hash: string,
): Route {
  if (query === null) {
    return { name: "intervention", projectId, query: {} };
  }
  let layer: number | undefined;
  let scenario: string | undefined;
  if (query !== "") {
    for (const pair of query.split("&")) {
      const equals = pair.indexOf("=");
      if (equals <= 0) {
        return { name: "not-found", hash };
      }
      const key = pair.slice(0, equals);
      const value = pair.slice(equals + 1);
      if (key === "layer") {
        if (!/^\d+$/.test(value)) {
          return { name: "not-found", hash };
        }
        const parsed = Number.parseInt(value, 10);
        if (!Number.isSafeInteger(parsed) || parsed < 0) {
          return { name: "not-found", hash };
        }
        layer = parsed;
      } else if (key === "scenario") {
        const decoded = decodeSegment(value);
        if (decoded === null || decoded.trim().length === 0) {
          return { name: "not-found", hash };
        }
        scenario = decoded;
      } else {
        return { name: "not-found", hash };
      }
    }
  }
  return {
    name: "intervention",
    projectId,
    query: {
      ...(layer === undefined ? {} : { layer }),
      ...(scenario === undefined ? {} : { scenario }),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** Format a route into its canonical hash text (round-trips `parseHash`). */
export function formatRoute(route: Route): string {
  switch (route.name) {
    case "dashboard":
      return "#/";
    case "projects":
      return "#/projects";
    case "project":
      return `#/projects/${encodeURIComponent(route.projectId)}`;
    case "sitetwin":
      return `#/projects/${encodeURIComponent(route.projectId)}/sitetwin`;
    case "boq-lens":
      return `#/projects/${encodeURIComponent(route.projectId)}/boq-lens`;
    case "case":
      return `#/projects/${encodeURIComponent(route.projectId)}/case`;
    case "outcomes":
      return `#/projects/${encodeURIComponent(route.projectId)}/outcomes`;
    case "intervention": {
      const base = `#/projects/${encodeURIComponent(route.projectId)}/intervention`;
      const params: string[] = [];
      if (route.query.layer !== undefined) {
        params.push(`layer=${String(route.query.layer)}`);
      }
      if (route.query.scenario !== undefined) {
        params.push(`scenario=${encodeURIComponent(route.query.scenario)}`);
      }
      return params.length === 0 ? base : `${base}?${params.join("&")}`;
    }
    case "settings":
      return "#/settings";
    case "not-found":
      return route.hash;
  }
}
