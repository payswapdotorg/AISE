/**
 * Adapter context contracts (PROD-016) — family `context`.
 *
 * `ProjectContext` is the "current context" object of the task-first
 * interaction model (spec/client-adapter-contract.md): the server-provided
 * project identity and the requesting user's role inside it. It is an
 * authoritative statement the adapter renders read-only — the adapter may
 * not invent, extend or reinterpret project identity or the user's role.
 *
 * `TaskIntent` is the ONE semantic object an adapter legitimately AUTHORS:
 * the user's task intent (what they need to do), expressed as a typed intent
 * with an open task-type vocabulary, natural-language statement, target
 * references and inspectable parameters. Authoring an intent is NOT
 * authority: the server validates, plans and answers it; the adapter never
 * decides readiness, sufficiency or authorization from an intent.
 */

import { z } from "zod";
import {
  contractVersionSchema,
  isoTimestampSchema,
  shortTextSchema,
  stableIdSchema,
  textSchema,
} from "@aise/shared-contracts";
import { createAdapterWireCodec } from "./codec";

/* ------------------------------------------------------------------ */
/* ProjectContext                                                       */
/* ------------------------------------------------------------------ */

/**
 * Advisory well-known user roles (open vocabulary, server-stated). The
 * server owns role semantics; the adapter renders the string verbatim.
 */
export const PROJECT_USER_ROLES = [
  "owner",
  "admin",
  "engineer",
  "reviewer",
  "field-operator",
  "observer",
] as const;

export const ProjectContextSchema = z
  .object({
    contractVersion: contractVersionSchema,
    projectId: stableIdSchema.describe(
      "Stable id of the project the user is working in (server-assigned).",
    ),
    projectName: shortTextSchema.describe("Project display name (server-stated)."),
    userRole: shortTextSchema.describe(
      "The requesting user's role in this project (server-stated, open " +
        "vocabulary; advisory well-known values: owner, admin, engineer, " +
        "reviewer, field-operator, observer). Carried verbatim; never " +
        "reinterpreted by the adapter.",
    ),
    sourceSystem: shortTextSchema
      .optional()
      .describe(
        "Source-of-record identity for the project context when it is " +
          "synchronized from an external system (e.g. `bim-ifc`, `erp`); " +
          "absent for AISE-native contexts.",
      ),
    updatedAt: isoTimestampSchema.describe(
      "Instant the server produced this context snapshot.",
    ),
  })
  .passthrough();
export type ProjectContext = z.infer<typeof ProjectContextSchema>;

/* ------------------------------------------------------------------ */
/* TaskIntent                                                           */
/* ------------------------------------------------------------------ */

/**
 * Advisory well-known task types (open vocabulary, lower-kebab-case) seeded
 * from the shared product capabilities of ACR-004. The server's task
 * catalogue is authoritative; this list documents the values the reference
 * fixtures use and is not closed.
 */
export const TASK_TYPES = [
  "field-capture",
  "evidence-review",
  "boq-inspection",
  "engineering-case-review",
  "intervention-review",
  "outcome-comparison",
  "solution-authoring",
  "project-administration",
] as const;

export const TaskIntentSchema = z
  .object({
    contractVersion: contractVersionSchema,
    taskId: stableIdSchema.describe(
      "Stable id of this task intent (client- or server-assigned).",
    ),
    taskType: shortTextSchema.describe(
      "Task type (open vocabulary; advisory well-known values: field-capture, " +
        "evidence-review, boq-inspection, engineering-case-review, " +
        "intervention-review, outcome-comparison, solution-authoring, " +
        "project-administration).",
    ),
    intent: textSchema.describe(
      "Natural-language statement of what the user needs to do.",
    ),
    projectRef: stableIdSchema.describe("Project this task is performed in."),
    targetRefs: z
      .array(stableIdSchema)
      .describe(
        "Stable ids of the entities the task concerns (objects, cases, BOQ " +
          "imports, scenarios…); may be empty for project-wide tasks.",
      ),
    parameters: z
      .record(z.string(), z.string())
      .describe(
        "Inspectable task parameters as an open string map (units, filters, " +
          "options). Unknown keys are data and must be preserved.",
      ),
    createdAt: isoTimestampSchema.describe("Instant the intent was authored."),
  })
  .passthrough();
export type TaskIntent = z.infer<typeof TaskIntentSchema>;

/* Codecs ------------------------------------------------------------------ */

export const ProjectContextCodec = createAdapterWireCodec<ProjectContext>({
  name: "ProjectContext",
  family: "context",
  schema: ProjectContextSchema,
});
export const decodeProjectContext = ProjectContextCodec.decode;
export const decodeProjectContextStrict = ProjectContextCodec.decodeStrict;
export const encodeProjectContext = ProjectContextCodec.encode;

export const TaskIntentCodec = createAdapterWireCodec<TaskIntent>({
  name: "TaskIntent",
  family: "context",
  schema: TaskIntentSchema,
});
export const decodeTaskIntent = TaskIntentCodec.decode;
export const decodeTaskIntentStrict = TaskIntentCodec.decodeStrict;
export const encodeTaskIntent = TaskIntentCodec.encode;
