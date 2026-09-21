/**
 * AuthorizationContext contract (PROD-016) — family `authorization`.
 *
 * The server-provided authorization context of the task-first flow.
 * AUTHORITATIVE and read-only for adapters: "no client may decide whether a
 * user is authorized beyond server-provided authorization results"
 * (spec/client-adapter-contract.md "No client authority").
 *
 * The adapter renders granted actions and — with equal prominence — every
 * typed denial with its stable reason code (client conformance suite item
 * 10: authorization denial). Denials are never swallowed, never summarized
 * into a generic failure, and never locally overridden.
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

/**
 * Advisory well-known denial reason codes (open vocabulary, stable strings
 * the adapter renders verbatim). Mirrors the AISE identity refusal
 * vocabulary in spirit (`cross_tenant`, `missing_permission`, …) — the
 * server's own codes remain authoritative on the wire.
 */
export const AUTHORIZATION_DENIAL_REASON_CODES = [
  "not-authenticated",
  "forbidden-role",
  "missing-permission",
  "cross-tenant",
  "revoked",
  "expired",
] as const;

/** One typed denial the adapter must surface. */
const AuthorizationDenialSchema = z
  .object({
    action: shortTextSchema.describe(
      "The denied action scope (open vocabulary, e.g. `reality:write`, " +
        "`evidence:submit`).",
    ),
    reasonCode: shortTextSchema.describe(
      "Stable denial reason code (open vocabulary; advisory well-known " +
        "values: not-authenticated, forbidden-role, missing-permission, " +
        "cross-tenant, revoked, expired). Rendered verbatim.",
    ),
    reasonDetail: textSchema.optional().describe(
      "Human-readable supplement; never replaces the stable reason code.",
    ),
  })
  .passthrough();
export type AuthorizationDenial = z.infer<typeof AuthorizationDenialSchema>;

export const AuthorizationContextSchema = z
  .object({
    contractVersion: contractVersionSchema,
    subjectRef: stableIdSchema.describe(
      "The principal/session this authorization context is about.",
    ),
    grantedActions: z
      .array(shortTextSchema)
      .describe(
        "Action scopes the server grants (open vocabulary; e.g. " +
          "`reality:read`, `evidence:submit`). Server-decided; the client " +
          "never extends this list.",
      ),
    denials: z
      .array(AuthorizationDenialSchema)
      .describe(
        "Typed denials the adapter MUST surface with their reason codes — " +
          "every denial is explicit, never silent.",
      ),
    validUntil: isoTimestampSchema
      .optional()
      .describe("When the server's authorization answer expires, when stated."),
  })
  .passthrough();
export type AuthorizationContext = z.infer<typeof AuthorizationContextSchema>;

/* Codecs ------------------------------------------------------------------ */

export const AuthorizationContextCodec = createAdapterWireCodec<AuthorizationContext>({
  name: "AuthorizationContext",
  family: "authorization",
  schema: AuthorizationContextSchema,
});
export const decodeAuthorizationContext = AuthorizationContextCodec.decode;
export const decodeAuthorizationContextStrict = AuthorizationContextCodec.decodeStrict;
export const encodeAuthorizationContext = AuthorizationContextCodec.encode;
