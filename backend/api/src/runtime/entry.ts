/**
 * The runtime entry factory — the ONE deployable API contract (PROD-003).
 *
 * `createRuntimeHandler` builds the full request pipeline that BOTH
 * deployment adapters serve, so local `bun run start` (Bun.serve via
 * main.ts) and the Vercel catch-all function (api/[[...path]].ts via
 * runtime/serverless.ts) answer THE SAME routes with THE SAME shapes:
 *
 *   request
 *     → CORS layer (runtime/cors.ts: same-origin default, opt-in
 *       AISE_CORS_ORIGINS allowlist, preflight handled, arbitrary origins
 *       never echoed)
 *     → the routing core (server.ts `createRequestHandler` — NEVER
 *       rewritten: all /healthz, /readyz and /v1/* namespaces delegate to
 *       it unchanged)
 *     → /readyz augmentation (runtime/readiness.ts: per-optional-provider
 *       {available|disabled|unavailable} statuses added to the core's
 *       config-validity answer — statuses only, never credentials)
 *     → stable error envelope (runtime/errors.ts: every 4xx/5xx internal
 *       error body re-enveloped as {error:{code,message,requestId}})
 *     → CORS response decoration for allowlisted cross-origin callers.
 *
 * Configuration: `lib/config.ts` (the API's own authority — see its header)
 * extended additively with the production/serverless mode: AISE_SERVERLESS
 * marks the serverless deployment (no bind address; HOST/PORT stay optional
 * and unused for binding), an unset AISE_DATA_DIR defaults to the tmp-fs
 * data dir (/tmp/aise-data — the ONLY writable directory on Vercel
 * functions; durable artifacts are PROD-006's R2 concern, NOT a filesystem
 * promise), and AISE_CORS_ORIGINS opts specific origins into CORS.
 *
 * BOOT HONESTY (serverless): the factory does NOT fail fast by default. A
 * serverless function cannot "refuse to start" usefully — Vercel would
 * answer every request with an opaque 500, INCLUDING /healthz and /readyz,
 * which is dishonest liveness. Instead the runtime boots, /healthz proves
 * liveness, /readyz reports every configuration issue, and a capture store
 * that cannot be constructed (unwritable data dir) degrades to an explicit
 * per-request failure store — uploads fail LOUDLY with the reason in the
 * logs, never by silently writing to a vanishing location. The LOCAL
 * adapter keeps its strict fail-fast discipline by passing `failFast: true`
 * (main.ts exits 1 exactly as before).
 */

import { resolveDataDir, validateEnv, type EnvRecord, type EnvSource } from "../lib/config";
import { createLogger, type Logger } from "../lib/log";
import { createCaptureGateway, type CaptureGateway } from "../capture/gateway";
import { FsCaptureStore, type CaptureStore } from "../capture/store";
import {
  createAuthLayer,
  createDegradedAuthLayer,
  FsSessionStore,
  parseAuthConfig,
  type AuthLayer,
  type AuthReadinessStatus,
} from "../auth";
import { FsIdentityStore } from "../identity/store";
import { IdentityService } from "../identity/service";
import { createRequestHandler, SERVICE_NAME } from "../server";
import { bootPgPersistence, type PgBootResult } from "../pg/runtime";
import type { PgExecutor } from "../pg/executor";
import type { MigrationOutcome } from "../pg/migrate";
import { createCorsLayer } from "./cors";
import { errorResponse, translateErrorResponse } from "./errors";
import { evaluateOptionalProviders, type ProviderStatus } from "./readiness";
// PROD-006 (additive): the R2 artifact storage wiring — the R2_* env group
// decides the blob backend (see the wiring block below), and the /readyz
// augmentation reports which backend is actually serving (statuses only,
// never credentials).
import { allowAllArtifactAccess } from "../artifacts/access";
import { R2ArtifactStorage, resolveR2StorageConfig } from "../artifacts/r2";
import { ArtifactService, ArtifactServiceError } from "../artifacts/service";
import { maxBytesOrDefault } from "../artifacts/policy";
import { FsArtifactStorage } from "../artifacts/fs-storage";
import { FsArtifactMetadataStore, type ArtifactMetadataStore } from "../artifacts/store";
import {
  UnavailableArtifactStorage,
  type ArtifactStorage,
} from "../artifacts/storage";
import type { ArtifactsRouteOptions } from "../artifacts/router";
import pkg from "../../package.json" with { type: "json" };

export interface RuntimeHandlerOptions {
  /** Live environment source (re-checked on every /readyz call). Default: process.env. */
  readonly envSource?: EnvSource;
  /** Service version surfaced by /healthz. Default: the API package manifest. */
  readonly version?: string;
  /** Structured logger. Default: derived from the first env resolution's log level. */
  readonly logger?: Logger;
  /**
   * Refuse to boot on construction failures (default: false — the serverless
   * boot-honesty discipline above). The LOCAL adapter sets true to keep its
   * exit(1) discipline; a RuntimeBootError is thrown instead.
   */
  readonly failFast?: boolean;
  /**
   * PROD-005 test seam: the migration runner used when DATABASE_URL selects
   * Pg persistence. Production leaves it unset (the real `runMigrations`
   * against the pooled executor); the offline runtime-selection tests inject
   * a fake to observe the cold-start call without any database.
   */
  readonly pgMigrate?: (executor: PgExecutor) => Promise<MigrationOutcome>;
}

/** Typed construction failure for the fail-fast adapter (main.ts). */
export class RuntimeBootError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(["Runtime construction failed:"].concat(issues.map((i) => `  - ${i}`)).join("\n"));
    this.name = "RuntimeBootError";
  }
}

/**
 * A capture store that fails every operation with an explicit error. Used
 * ONLY as the degraded serverless fallback when the file-system store cannot
 * be constructed (unwritable data dir): capture routes then fail loudly and
 * honestly per request instead of silently writing somewhere vanishing (no
 * silent corruption — the error names the misconfiguration and its fix).
 */
class UnavailableCaptureStore implements CaptureStore {
  constructor(private readonly reason: string) {}

  private fail(): never {
    throw new Error(`capture store unavailable: ${this.reason}`);
  }

  getAsset(): Promise<never> {
    this.fail();
  }

  readAssetBytes(): Promise<never> {
    this.fail();
  }

  putAsset(): Promise<never> {
    this.fail();
  }

  getSession(): Promise<never> {
    this.fail();
  }

  getBatchRecord(): Promise<never> {
    this.fail();
  }

  putIdempotencyRecord(): Promise<never> {
    this.fail();
  }

  getIdempotencyRecord(): Promise<never> {
    this.fail();
  }

  acceptBatch(): Promise<never> {
    this.fail();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * A metadata store that fails every operation with the stable 503 envelope
 * code. Used ONLY as the degraded artifacts wiring when the R2 group is
 * half-configured or the Fs twin cannot be constructed: artifact routes
 * then fail loudly and honestly per request (the same discipline as
 * UnavailableCaptureStore above — never a silent fallback to a vanishing
 * location, never a pretend-empty store).
 */
class UnavailableArtifactMetadataStore implements ArtifactMetadataStore {
  constructor(private readonly reason: string) {}

  private fail(): never {
    throw new ArtifactServiceError("storage_unavailable", this.reason);
  }

  putRecord(): Promise<never> {
    this.fail();
  }

  getRecord(): Promise<never> {
    this.fail();
  }

  listRecords(): Promise<never> {
    this.fail();
  }

  tombstoneRecord(): Promise<never> {
    this.fail();
  }

  recordsReferencing(): Promise<never> {
    this.fail();
  }

  listAllRecords(): Promise<never> {
    this.fail();
  }
}

/**
 * PROD-006: the artifact storage backend actually serving /v1/artifacts,
 * derived from the SAME env record /readyz re-checks on every call
 * (statuses only — never credentials, never endpoint URLs).
 */
interface ArtifactReadinessStatus {
  readonly backend: "r2" | "local-fs";
  readonly status: ProviderStatus;
}

function artifactsReadiness(env: EnvRecord): ArtifactReadinessStatus {
  const resolution = resolveR2StorageConfig(env);
  if (resolution.status === "complete") {
    return { backend: "r2", status: "available" };
  }
  if (resolution.status === "partial") {
    // The operator asked for R2 but the group is half-configured: the
    // wiring fails loudly (503 per request) — never a silent local fallback.
    return { backend: "r2", status: "unavailable" };
  }
  return { backend: "local-fs", status: "available" };
}

/**
 * Augment the core's /readyz answer with per-optional-provider statuses.
 * The core's own config-validity logic is reused verbatim (its response is
 * the input) — this seam only ADDS the providers map:
 *
 *   200 → { ...ok-body, providers: {<id>: available|disabled|unavailable} }
 *   503 → { error: {code:"not_ready", message, requestId}, issues, providers }
 *
 * Any other /readyz response shape (e.g. the core's 405 for non-GET) passes
 * through unchanged and is handled by the generic error envelope.
 *
 * PROD-004 (additive): when the auth layer is in play (enabled — or enabled
 * but unbuildable), the answer ALSO carries an `auth` status object
 * ({status:"enabled"|"unavailable", mode?, issues?} — names and expectations
 * only, never values). When auth is DISABLED the answer is byte-identical
 * to the pre-auth contract (the additive discipline). An enabled-but-broken
 * auth layer is a real not-ready condition: the 200 becomes the documented
 * 503 envelope with the auth issues merged in.
 */
async function augmentReadiness(
  response: Response,
  env: EnvRecord,
  auth: AuthReadinessStatus | null,
): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return response;
  }
  let body: unknown;
  let text: string;
  try {
    text = await response.text();
    body = JSON.parse(text);
  } catch {
    return response;
  }
  const providers = evaluateOptionalProviders(env);
  // PROD-006 (additive): which artifact backend is actually serving —
  // `artifacts: {backend: "local-fs"|"r2", status}` beside the providers
  // map (statuses only; the local-fs answer is the honest "durable
  // artifacts require the R2 env group in deployment").
  const artifacts = artifactsReadiness(env);
  const authUnavailable = auth !== null && auth.status === "unavailable";
  if (
    (response.status === 200 || authUnavailable) &&
    isRecord(body) &&
    body["ok"] === true
  ) {
    if (authUnavailable) {
      // Enabled but unbuildable: the service cannot serve /v1 honestly —
      // readiness flips to the documented 503 envelope with every issue.
      const requestId = response.headers.get("x-request-id");
      const issues = [...(auth?.issues ?? [])];
      return new Response(
        JSON.stringify({
          error: {
            code: "not_ready",
            message: "Service configuration is not ready.",
            ...(requestId === null ? {} : { requestId }),
          },
          issues,
          providers,
          auth,
          artifacts,
        }),
        { status: 503, statusText: "Service Unavailable", headers: response.headers },
      );
    }
    return new Response(
      JSON.stringify({
        ...body,
        providers,
        artifacts,
        ...(auth === null ? {} : { auth }),
      }),
      {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      },
    );
  }
  if (
    response.status === 503 &&
    isRecord(body) &&
    body["ok"] === false &&
    Array.isArray(body["issues"])
  ) {
    const requestId = response.headers.get("x-request-id");
    const issues = [
      ...(body["issues"] as unknown[]).map((issue) => String(issue)),
      ...(authUnavailable ? (auth?.issues ?? []) : []),
    ];
    return new Response(
      JSON.stringify({
        error: {
          code: "not_ready",
          message: "Service configuration is not ready.",
          ...(requestId === null ? {} : { requestId }),
        },
        issues,
        providers,
        ...(auth === null ? {} : { auth }),
        artifacts,
      }),
      { status: response.status, statusText: response.statusText, headers: response.headers },
    );
  }
  return new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Build the runtime request handler (the pipeline in the module header).
 * Pure construction — no request is served until the returned handler is
 * called; all I/O is the eager capture-store construction documented above.
 */
export function createRuntimeHandler(
  options: RuntimeHandlerOptions = {},
): (request: Request) => Promise<Response> {
  const envSource: EnvSource = options.envSource ?? (() => process.env);
  const version = options.version ?? pkg.version;
  const firstConfig = validateEnv(envSource());
  const logger =
    options.logger ?? createLogger(firstConfig.ok ? firstConfig.config.logLevel : "error");

  // Data-dir resolution (documented rule, single-sourced in lib/config.ts):
  // explicit AISE_DATA_DIR wins; unset → the mode default (tmp-fs when
  // serverless); a MISCONFIGURED value still resolves to the mode default so
  // the function can boot and report the issue through /readyz.
  const dataDir = firstConfig.ok ? firstConfig.config.dataDir : resolveDataDir(envSource());

  // PROD-005 persistence selection: DATABASE_URL present → the Pg store
  // family + a bounded cold-start migration run (see pg/runtime.ts);
  // unset → EXACTLY the file-system behavior below. A present-but-invalid
  // DATABASE_URL is a hard construction failure in BOTH adapters (it would
  // silently persist to the wrong place otherwise) — the message never
  // carries the value.
  const pgBoot: PgBootResult = bootPgPersistence({
    env: envSource(),
    logger,
    dataDir,
    ...(options.pgMigrate === undefined ? {} : { migrate: options.pgMigrate }),
  });

  let capture: CaptureGateway;
  if (pgBoot.mode === "pg") {
    // Pg mode: the capture gateway over the Pg twin replaces the Fs block —
    // the migration `ready` gate below orders every request behind the
    // cold-start schema run before any store operation can execute.
    capture = pgBoot.family.capture;
  } else {
    try {
      const store = new FsCaptureStore(dataDir);
      capture = createCaptureGateway({
        store,
        clock: (): string => new Date().toISOString(),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (options.failFast === true) {
        throw new RuntimeBootError([
          `capture store initialization failed under data dir '${dataDir}': ${reason}`,
        ]);
      }
      // Serverless boot honesty: serve degraded — capture routes fail loudly
      // per request with the reason; /healthz and /readyz stay honest.
      logger.error("capture store initialization failed; serving degraded capture routes", {
        dataDir,
        error: reason,
      });
      capture = createCaptureGateway({
        store: new UnavailableCaptureStore(
          `the configured data directory '${dataDir}' is not writable — set AISE_DATA_DIR to a writable directory (serverless functions: /tmp is the only writable path)`,
        ),
        clock: (): string => new Date().toISOString(),
      });
    }
  }

  // PROD-004 (additive — the auth/tenant-safety layer). Built ONLY when
  // AISE_AUTH=1|true; unset/0/false leaves this block completely inert and
  // the pipeline byte-identical to the pre-auth contract. The layer wraps
  // THE CORE (never server.ts): it owns /v1/auth/** and enforces sessions
  // + the typed tenant predicate on every other /v1 request. The identity
  // service is constructed EAGERLY and shared with the core (the
  // `identity` handler option — the core's own injection seam, no changes
  // to its lazy default when auth is off) so the tenancy registry has ONE
  // instance per process, per the identity store's single-writer
  // assumption. Fail-closed boot honesty, mirroring the capture store:
  // an enabled-but-unbuildable layer (missing AUTH_SECRET, unwritable
  // session dir) refuses to boot under failFast (RuntimeBootError) and
  // otherwise serves the honest degraded mode (every /v1 request 503 with
  // the issues; /healthz and /readyz stay honest).
  const authConfigResult = parseAuthConfig(envSource());
  let auth: AuthLayer | null = null;
  let authReadiness: AuthReadinessStatus | null = null;
  let identityRoutes:
    | { readonly service: IdentityService; readonly logger: Logger }
    | undefined;
  const authWanted =
    (!authConfigResult.ok) ||
    (authConfigResult.ok && authConfigResult.config.enabled);
  if (authWanted) {
    const issues = authConfigResult.ok ? [] : [...authConfigResult.issues];
    if (authConfigResult.ok) {
      try {
        const identityStore = new FsIdentityStore(dataDir);
        const identityService = new IdentityService({
          store: identityStore,
          clock: (): string => new Date().toISOString(),
        });
        const sessionStore = new FsSessionStore(dataDir, logger);
        auth = createAuthLayer({
          config: authConfigResult.config,
          store: sessionStore,
          directory: identityStore,
          identity: identityService,
          clock: (): string => new Date().toISOString(),
          logger,
        });
        identityRoutes = { service: identityService, logger };
        authReadiness = { status: "enabled", mode: authConfigResult.config.mode };
        // The deterministic boot housekeeping (never blocks construction —
        // the sweep and the demo bootstrap are fast, and failures here are
        // logged, never silent):
        void auth
          .sweep()
          .then((report) => {
            if (report.removedSessionIds.length > 0) {
              logger.info("boot session sweep removed expired sessions", {
                considered: report.considered,
                removed: report.removedSessionIds.length,
              });
            }
          })
          .catch((error: unknown) => {
            logger.error("boot session sweep failed", {
              error: error instanceof Error ? error.message : String(error),
            });
          });
        void auth
          .ensureDemo()
          .catch((error: unknown) => {
            logger.error("demo tenant bootstrap failed", {
              error: error instanceof Error ? error.message : String(error),
            });
          });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        issues.push(`auth session store initialization failed: ${reason}`);
      }
    }
    if (auth === null) {
      if (options.failFast === true) {
        throw new RuntimeBootError(issues.length > 0 ? issues : ["auth layer failed to build"]);
      }
      logger.error("auth layer enabled but unbuildable; serving degraded /v1", { issues });
      auth = createDegradedAuthLayer({
        code: authConfigResult.ok ? "auth_store_unavailable" : "auth_not_configured",
        issues,
      });
      authReadiness = { status: "unavailable", issues };
    }
  }
  // PROD-006 (additive): artifact storage wiring. The R2_* env group
  // decides the blob backend:
  //   complete → the R2 adapter over the hand-rolled SigV4 signer
  //              (construction performs NO I/O — no cold-start blocking);
  //   absent   → the honest LOCAL-FS TWIN under the same data dir as every
  //              other Fs store (durable artifacts REQUIRE the R2 group in
  //              deployment — /readyz and /v1/artifacts/status always say
  //              which backend is serving);
  //   partial  → the LOUD unavailable wiring (the operator asked for R2 but
  //              it cannot be constructed — artifact operations fail 503
  //              with the stable envelope instead of silently degrading to
  //              a non-durable local fallback).
  // Metadata rows always live in the Fs metadata store under the data dir
  // (the Pg twin lands with PROD-005 — a documented limitation: on a
  // serverless redeploy the ROWS are tmp-fs-ephemeral even when the BLOBS
  // are durable in R2).
  const r2Resolution = resolveR2StorageConfig(envSource());
  const artifactMaxBytes = maxBytesOrDefault(envSource()["AISE_ARTIFACT_MAX_BYTES"]);
  let artifacts: ArtifactsRouteOptions;
  if (r2Resolution.status === "partial") {
    const reason =
      "the R2_* environment group is partially configured (missing: " +
      r2Resolution.missing.join(", ") +
      ") — set the complete group for durable R2 artifact storage or unset it " +
      "entirely for the local-fs development fallback";
    if (options.failFast === true) {
      throw new RuntimeBootError([`artifact storage initialization failed: ${reason}`]);
    }
    logger.error("artifact storage initialization failed; serving degraded artifact routes", {
      missing: r2Resolution.missing,
    });
    artifacts = {
      service: new ArtifactService({
        storage: new UnavailableArtifactStorage(reason),
        metadata: new UnavailableArtifactMetadataStore(reason),
        limits: { maxBytes: artifactMaxBytes },
        clock: (): string => new Date().toISOString(),
      }),
      logger,
      accessPredicate: allowAllArtifactAccess,
    };
  } else {
    try {
      // Both constructors fail fast on an unwritable data dir (the
      // FsCaptureStore discipline) — INSIDE this try, so a degraded
      // serverless boot stays honest instead of throwing out of the
      // handler construction.
      const storage: ArtifactStorage =
        r2Resolution.status === "complete"
          ? new R2ArtifactStorage(r2Resolution.config)
          : new FsArtifactStorage(dataDir);
      artifacts = {
        service: new ArtifactService({
          storage,
          metadata: new FsArtifactMetadataStore(dataDir),
          limits: { maxBytes: artifactMaxBytes },
          clock: (): string => new Date().toISOString(),
        }),
        logger,
        accessPredicate: allowAllArtifactAccess,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (options.failFast === true) {
        throw new RuntimeBootError([
          `artifact metadata store initialization failed under data dir '${dataDir}': ${reason}`,
        ]);
      }
      // Serverless boot honesty: serve degraded — artifact routes fail
      // loudly per request with the reason; /healthz and /readyz stay honest.
      logger.error("artifact metadata store initialization failed; serving degraded artifact routes", {
        dataDir,
        error: reason,
      });
      artifacts = {
        service: new ArtifactService({
          storage: new UnavailableArtifactStorage(
            `the configured data directory '${dataDir}' is not writable — set AISE_DATA_DIR to a writable directory (serverless functions: /tmp is the only writable path)`,
          ),
          metadata: new UnavailableArtifactMetadataStore(
            `the configured data directory '${dataDir}' is not writable — set AISE_DATA_DIR to a writable directory (serverless functions: /tmp is the only writable path)`,
          ),
          limits: { maxBytes: artifactMaxBytes },
          clock: (): string => new Date().toISOString(),
        }),
        logger,
        accessPredicate: allowAllArtifactAccess,
      };
    }
  }

  const core = createRequestHandler({
    envSource,
    version,
    logger,
    capture,
    // PROD-004: the shared identity service (only when auth built it —
    // additive; the core's lazy default wiring is untouched otherwise).
    ...(identityRoutes === undefined ? {} : { identity: identityRoutes }),
    artifacts,
    // Pg mode: the five lazily-defaulted route surfaces become the Pg twins
    // (explicit construction wins — that IS the injection seam); Fs mode
    // leaves every field unset so the server's lazy defaults are EXACTLY
    // today's behavior.
    ...(pgBoot.mode === "pg"
      ? {
          missions: pgBoot.family.missions,
          evidence: pgBoot.family.evidence,
          boq: pgBoot.family.boq,
          gaps: pgBoot.family.gaps,
          cases: pgBoot.family.cases,
        }
      : {}),
  });

  // The CORS allowlist is resolved once at construction (a cold-start
  // concern — changing AISE_CORS_ORIGINS takes effect on the next boot, like
  // every other deployment setting; /readyz reports a malformed value live).
  const cors = createCorsLayer(
    firstConfig.ok ? firstConfig.config.corsOrigins : resolveCorsFallback(envSource()),
  );

  return async (request: Request): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
      const preflight = cors.handlePreflight(request);
      if (preflight !== null) {
        return preflight;
      }
      // PROD-004: the auth layer sits between CORS and the core (preflights
      // never authenticate; /healthz and /readyz pass through untouched).
      let forwarded = request;
      if (auth !== null) {
        const outcome = await auth.handle(request, requestId);
        if (outcome.kind === "response") {
          return cors.decorate(request, outcome.response);
        }
        forwarded = outcome.request;
      }
      // Pg mode: order every request behind the bounded cold-start
      // migration run (never rejects — failures are logged as status, then
      // store operations fail loudly per request; see pg/runtime.ts).
      if (pgBoot.mode === "pg") {
        await pgBoot.ready;
      }
      let response = await core(forwarded);
      if (new URL(request.url).pathname === "/readyz") {
        response = await augmentReadiness(response, envSource(), authReadiness);
      }
      response = await translateErrorResponse(response);
      return cors.decorate(request, response);
    } catch (error) {
      // The core already maps its own failures to 500; this guard covers the
      // seam itself. The envelope never carries error values (no secrets).
      logger.error("runtime handler error", {
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : String(error),
        service: SERVICE_NAME,
      });
      return errorResponse(
        500,
        "internal_error",
        "An internal error occurred.",
        requestId,
      );
    }
  };
}

/**
 * CORS allowlist for the degraded (invalid-env) boot: re-derive just the
 * origins from the raw env record — a malformed AISE_CORS_ORIGINS yields an
 * EMPTY allowlist (same-origin only, the safe default) and /readyz reports
 * the issue.
 */
function resolveCorsFallback(env: EnvRecord): readonly string[] {
  const result = validateEnv(env);
  return result.ok ? result.config.corsOrigins : [];
}
