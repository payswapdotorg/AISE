/**
 * Minimal, strict multipart/form-data parser for the capture upload
 * endpoint (AISE-004).
 *
 * One logical upload is a single request carrying exactly two named
 * parts: `request` (the AISE-003 upload-request JSON envelope) and
 * `payload` (the raw asset bytes). This is the capture gateway's
 * normalization of "single-shot transfer" onto HTTP
 * (architecture §4.2); the contract governs the envelope semantics.
 *
 * Fail-closed discipline: any framing ambiguity (bad boundary, part
 * without a name, unterminated headers, missing closing delimiter)
 * produces a parse error which the router rejects with a structured
 * 400 — never a silent partial parse. The parser is binary-safe and
 * bounded: callers cap the request body before parsing.
 */

/** One parsed multipart part. */
export interface MultipartPart {
  /** `name` parameter from Content-Disposition. */
  readonly name: string;
  /** Part Content-Type, when declared. */
  readonly contentType: string | undefined;
  /** Raw part content (binary-safe). */
  readonly data: Buffer;
}

export type MultipartResult =
  | { ok: true; parts: MultipartPart[] }
  | { ok: false; error: string };

const MAX_PART_HEADERS = 32;
const MAX_PART_HEADER_BYTES = 8192;
const MAX_BOUNDARY_BYTES = 70;

/** Allowed boundary characters per RFC 2046 (bcharsnospace plus space). */
const BOUNDARY_CHAR = /^[A-Za-z0-9'()+_,.\-/:=?]$/;

const NAME_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * Extracts and validates the `boundary` parameter from a
 * `multipart/form-data` content-type header value.
 */
export function extractBoundary(contentType: string): string | undefined {
  const segments = contentType.split(";");
  const mediaType = (segments[0] ?? "").trim().toLowerCase();
  if (mediaType !== "multipart/form-data") {
    return undefined;
  }
  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = segment.slice(0, eq).trim().toLowerCase();
    if (key !== "boundary") {
      continue;
    }
    let value = segment.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

function isValidBoundary(boundary: string): boolean {
  if (boundary.length === 0 || boundary.length > MAX_BOUNDARY_BYTES) {
    return false;
  }
  if (boundary.startsWith(" ") || boundary.endsWith(" ")) {
    return false;
  }
  for (const char of boundary) {
    if (!BOUNDARY_CHAR.test(char)) {
      return false;
    }
  }
  return true;
}

/**
 * Finds the next occurrence of `delimiter` that starts at the
 * beginning of a line (position 0 or immediately after a line feed),
 * starting the search at `from`.
 */
function findDelimiter(body: Buffer, delimiter: Buffer, from: number): number {
  let position = body.indexOf(delimiter, from);
  while (position !== -1) {
    if (position === 0 || body[position - 1] === 0x0a) {
      return position;
    }
    position = body.indexOf(delimiter, position + 1);
  }
  return -1;
}

/**
 * Extracts the `name` parameter from a Content-Disposition value of
 * the shape `form-data; name="request"` (quoted or token form).
 * Returns undefined when the value does not carry a usable name.
 */
function parseDispositionName(value: string): string | undefined {
  const segments = value.split(";");
  const dispositionType = (segments[0] ?? "").trim().toLowerCase();
  if (dispositionType !== "form-data") {
    return undefined;
  }
  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = segment.slice(0, eq).trim().toLowerCase();
    if (key !== "name") {
      continue;
    }
    let nameValue = segment.slice(eq + 1).trim();
    if (nameValue.length >= 2 && nameValue.startsWith('"') && nameValue.endsWith('"')) {
      nameValue = nameValue.slice(1, -1);
    }
    if (NAME_PATTERN.test(nameValue)) {
      return nameValue;
    }
    return undefined;
  }
  return undefined;
}

function parsePart(region: Buffer): { ok: true; part: MultipartPart } | { ok: false; error: string } {
  const crlf = region.indexOf(Buffer.from("\r\n\r\n"));
  const lf = region.indexOf(Buffer.from("\n\n"));
  let headerEnd: number;
  let dataStart: number;
  if (crlf !== -1 && (lf === -1 || crlf <= lf - 2)) {
    headerEnd = crlf;
    dataStart = crlf + 4;
  } else if (lf !== -1) {
    headerEnd = lf;
    dataStart = lf + 2;
  } else {
    return { ok: false, error: "multipart part is missing the header/content separator" };
  }

  const headerText = region.subarray(0, headerEnd).toString("utf8");
  const data = region.subarray(dataStart);

  const lines = headerText.split(/\r?\n/);
  if (lines.length > MAX_PART_HEADERS) {
    return { ok: false, error: "multipart part declares too many headers" };
  }

  let name: string | undefined;
  let contentType: string | undefined;
  for (const line of lines) {
    if (line.length > MAX_PART_HEADER_BYTES) {
      return { ok: false, error: "multipart part header is too long" };
    }
    const colon = line.indexOf(":");
    if (colon === -1) {
      return { ok: false, error: "malformed multipart part header" };
    }
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "content-disposition") {
      const parsedName = parseDispositionName(value);
      if (parsedName === undefined) {
        return { ok: false, error: "content-disposition must be form-data with a valid name parameter" };
      }
      name = parsedName;
    } else if (key === "content-type") {
      contentType = value;
    }
    // Other part headers (e.g. Content-Transfer-Encoding) are ignored.
  }

  if (name === undefined) {
    return { ok: false, error: "multipart part is missing content-disposition" };
  }

  return { ok: true, part: { name, contentType, data } };
}

/**
 * Parses a complete (already size-capped) multipart/form-data body
 * against the boundary declared in the content-type header.
 */
export function parseMultipart(body: Buffer, contentType: string): MultipartResult {
  const boundary = extractBoundary(contentType);
  if (boundary === undefined) {
    return { ok: false, error: "content type must be multipart/form-data with a boundary parameter" };
  }
  if (!isValidBoundary(boundary)) {
    return { ok: false, error: "invalid multipart boundary" };
  }

  const delimiter = Buffer.from(`--${boundary}`);
  const parts: MultipartPart[] = [];

  let position = findDelimiter(body, delimiter, 0);
  if (position === -1) {
    return { ok: false, error: "multipart body does not contain the declared boundary" };
  }

  while (position !== -1) {
    let cursor = position + delimiter.length;
    if (body[cursor] === 0x2d && body[cursor + 1] === 0x2d) {
      // Closing delimiter; any epilogue is ignored.
      break;
    }
    if (body[cursor] === 0x0d && body[cursor + 1] === 0x0a) {
      cursor += 2;
    } else if (body[cursor] === 0x0a) {
      cursor += 1;
    } else {
      return { ok: false, error: "malformed multipart delimiter" };
    }

    const next = findDelimiter(body, delimiter, cursor);
    if (next === -1) {
      return { ok: false, error: "multipart body is not terminated by a closing boundary" };
    }

    // The delimiter is preceded by a CRLF/LF that belongs to the
    // boundary, not to the part content.
    let end = next;
    if (end > cursor && body[end - 1] === 0x0a) {
      end -= 1;
      if (end > cursor && body[end - 1] === 0x0d) {
        end -= 1;
      }
    }

    const partResult = parsePart(body.subarray(cursor, end));
    if (!partResult.ok) {
      return partResult;
    }
    parts.push(partResult.part);

    position = next;
  }

  return { ok: true, parts };
}
