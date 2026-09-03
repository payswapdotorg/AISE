/**
 * Unit tests for the capture upload multipart parser.
 *
 * The parser is the byte-transfer normalization for single-shot
 * uploads (envelope JSON part + raw payload part). These tests prove
 * well-formed bodies parse, binary data survives round-trips, and
 * every framing ambiguity fails closed with a structured error.
 */
import { describe, expect, it } from "vitest";
import { extractBoundary, parseMultipart } from "./multipart.js";

const BOUNDARY = "test-boundary-a1b2c3d4e5";

function buildBody(parts: ReadonlyArray<{ name: string; contentType?: string; data: Buffer }>): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"\r\n` +
          (part.contentType !== undefined ? `Content-Type: ${part.contentType}\r\n` : "") +
          "\r\n",
        "utf8",
      ),
    );
    chunks.push(part.data);
    chunks.push(Buffer.from("\r\n", "utf8"));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`, "utf8"));
  return Buffer.concat(chunks);
}

function contentTypeHeader(): string {
  return `multipart/form-data; boundary=${BOUNDARY}`;
}

describe("extractBoundary", () => {
  it("extracts a token boundary", () => {
    expect(extractBoundary("multipart/form-data; boundary=abc123")).toBe("abc123");
  });

  it("extracts a quoted boundary", () => {
    expect(extractBoundary('multipart/form-data; boundary="abc 123"')).toBe("abc 123");
  });

  it("returns undefined for non-multipart media types", () => {
    expect(extractBoundary("application/json")).toBeUndefined();
    expect(extractBoundary("multipart/mixed; boundary=abc")).toBeUndefined();
  });

  it("returns undefined when the boundary parameter is absent", () => {
    expect(extractBoundary("multipart/form-data")).toBeUndefined();
  });
});

describe("parseMultipart", () => {
  it("parses two named parts with binary-safe data", () => {
    const envelope = Buffer.from(
      JSON.stringify({ contractVersion: "1.0", assetId: "x" }),
      "utf8",
    );
    const payload = Buffer.from([0x00, 0x01, 0x0d, 0x0a, 0x0a, 0x2d, 0x2d, 0xff, 0xfe]);
    const body = buildBody([
      { name: "request", contentType: "application/json", data: envelope },
      { name: "payload", contentType: "application/octet-stream", data: payload },
    ]);

    const result = parseMultipart(body, contentTypeHeader());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parts).toHaveLength(2);
      const request = result.parts.find((part) => part.name === "request");
      const payloadPart = result.parts.find((part) => part.name === "payload");
      expect(request?.contentType).toBe("application/json");
      expect(Buffer.compare(request?.data ?? Buffer.alloc(0), envelope)).toBe(0);
      expect(payloadPart?.name).toBe("payload");
      expect(Buffer.compare(payloadPart?.data ?? Buffer.alloc(0), payload)).toBe(0);
    }
  });

  it("tolerates LF-only line endings", () => {
    const body = Buffer.concat([
      Buffer.from(`--${BOUNDARY}\nContent-Disposition: form-data; name="request"\n\nhello\n--${BOUNDARY}--\n`, "utf8"),
    ]);
    const result = parseMultipart(body, contentTypeHeader());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parts[0]?.data.toString("utf8")).toBe("hello");
    }
  });

  it("tolerates a preamble before the first delimiter", () => {
    const body = Buffer.concat([
      Buffer.from("this is a preamble\r\n", "utf8"),
      buildBody([{ name: "request", data: Buffer.from("{}") }]),
    ]);
    const result = parseMultipart(body, contentTypeHeader());
    expect(result.ok).toBe(true);
  });

  it("rejects a body missing the declared boundary", () => {
    const result = parseMultipart(Buffer.from("garbage"), contentTypeHeader());
    expect(result.ok).toBe(false);
  });

  it("rejects a missing boundary parameter", () => {
    const result = parseMultipart(buildBody([{ name: "request", data: Buffer.alloc(0) }]), "multipart/form-data");
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid boundary value", () => {
    const result = parseMultipart(
      buildBody([{ name: "request", data: Buffer.alloc(0) }]),
      `multipart/form-data; boundary=${"x".repeat(71)}`,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a part without content-disposition", () => {
    const body = Buffer.from(`--${BOUNDARY}\r\n\r\ndata\r\n--${BOUNDARY}--\r\n`, "utf8");
    const result = parseMultipart(body, contentTypeHeader());
    expect(result.ok).toBe(false);
  });

  it("rejects a content-disposition without a usable name", () => {
    const body = Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; filename="a.bin"\r\n\r\ndata\r\n--${BOUNDARY}--\r\n`,
      "utf8",
    );
    const result = parseMultipart(body, contentTypeHeader());
    expect(result.ok).toBe(false);
  });

  it("rejects unterminated part headers", () => {
    const body = Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="request"\r\n--${BOUNDARY}--\r\n`,
      "utf8",
    );
    const result = parseMultipart(body, contentTypeHeader());
    expect(result.ok).toBe(false);
  });

  it("rejects a body without the closing delimiter", () => {
    const body = Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="request"\r\n\r\ndata\r\n`,
      "utf8",
    );
    const result = parseMultipart(body, contentTypeHeader());
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed delimiter position", () => {
    const body = Buffer.from(
      `--${BOUNDARY}XYZ\r\nContent-Disposition: form-data; name="request"\r\n\r\ndata\r\n--${BOUNDARY}--\r\n`,
      "utf8",
    );
    const result = parseMultipart(body, contentTypeHeader());
    expect(result.ok).toBe(false);
  });

  it("splits on a boundary that appears inside part content (client boundary discipline)", () => {
    // A payload that itself contains a line starting with the
    // delimiter: per multipart semantics the split happens there, so
    // the parts no longer match the expected shape — downstream
    // validation fails closed (never a silent misparse).
    const payload = Buffer.from(
      `bytes\r\n--${BOUNDARY}\r\nContent-Disposition: form-data; name="evil"\r\n\r\nmore\r\n--${BOUNDARY}--\r\n`,
      "utf8",
    );
    const body = buildBody([{ name: "payload", data: payload }]);
    const result = parseMultipart(body, contentTypeHeader());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The crafted content parsed into additional parts; the router
      // rejects bodies without exactly one request+payload pair.
      expect(result.parts.length).toBeGreaterThan(1);
      expect(result.parts.some((part) => part.name === "evil")).toBe(true);
    }
  });
});
