/**
 * ANCHOR-002 — the concrete wire codec instances.
 *
 * The two codecs of this contract (the request the AISE side authors; the
 * response the provider answers): decode (open, unknown keys preserved),
 * decodeStrict (unknown keys refused at any nesting level with the key
 * named — the canonical-validation mode), encode (canonical JSON, family
 * version stamped).
 */

import { createAnchoringWireCodec } from "./codec";
import { anchoringRequestSchema } from "./request";
import { anchoringResponseSchema } from "./response";

/** The AnchoringRequest codec (family "request"). */
export const anchoringRequestCodec = createAnchoringWireCodec({
  name: "AnchoringRequest",
  family: "request",
  schema: anchoringRequestSchema,
});

/** The AnchoringResponse codec (family "response"). */
export const anchoringResponseCodec = createAnchoringWireCodec({
  name: "AnchoringResponse",
  family: "response",
  schema: anchoringResponseSchema,
});
