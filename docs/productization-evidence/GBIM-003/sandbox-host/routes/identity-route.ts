import { SPIKE_SOLUTION_ID, currentWorkspace, deriveOperationIdOfIntent } from "@spike/server/workspace";

/**
 * GBIM-003 — deterministic identity derivation service (PROD-031 law: the
 * browser cannot derive identities — it asks the server). Used by the
 * sandbox's live direct⇄agent equivalence widget.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as {
    intents?: readonly { intent?: unknown; operationIndex?: number }[];
  };
  const version = currentWorkspace().version;
  const ids: string[] = [];
  const errors: string[] = [];
  for (const entry of body.intents ?? []) {
    try {
      ids.push(
        deriveOperationIdOfIntent(entry.intent, {
          solutionId: SPIKE_SOLUTION_ID,
          versionNumber: version.versionNumber,
          operationIndex: typeof entry.operationIndex === "number" ? entry.operationIndex : version.operations.length,
        }),
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return Response.json({ ids, errors });
}
