/**
 * GBIM-003 — the sandbox's HTTP client (the ONLY transport to canonical
 * state; mirrors apps/web's service-http seam: same-origin POST only).
 *
 * Spike-only code (NOT production engine code).
 */

import type {
  AgentCompileDto,
  ApplyResultDto,
  IdentityRequestIntent,
  IdentityResultDto,
  PreviewDto,
  WorkspaceDto,
} from "../types";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${path} -> HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  return (await response.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${path} -> HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  return (await response.json()) as T;
}

export function fetchWorkspace(): Promise<{ workspace: WorkspaceDto }> {
  return getJson("/api/spike/open");
}

export function resetWorkspace(): Promise<{ workspace: WorkspaceDto }> {
  return postJson("/api/spike/reset", {});
}

export function previewIntent(intent: unknown): Promise<PreviewDto> {
  return postJson("/api/spike/preview", { intent });
}

export function applyIntent(intent: unknown, origin: string): Promise<ApplyResultDto> {
  return postJson("/api/spike/apply", { intent, origin });
}

export function reviseOpening(widthM: number, heightM: number): Promise<ApplyResultDto> {
  return postJson("/api/spike/revise-opening", { widthM, heightM });
}

export function compileAgentUtterance(utterance: string): Promise<AgentCompileDto> {
  return postJson("/api/spike/agent-compile", { utterance });
}

export function deriveOperationIds(intents: readonly IdentityRequestIntent[]): Promise<IdentityResultDto> {
  return postJson("/api/spike/identity", { intents });
}

export function fetchEvidence(): Promise<unknown> {
  return getJson("/api/spike/evidence");
}
