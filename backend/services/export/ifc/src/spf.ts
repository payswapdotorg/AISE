/**
 * STEP physical file (ISO 10303-21) serialization primitives
 * (AISE-018).
 *
 * The IFC 4.3 exchange format is a STEP physical file (SPF): a
 * HEADER section (file identity), a DATA section of typed entity
 * instances `#N=ENTITY_NAME(arg,…);`, and strict closing markers.
 * This module provides the deterministic primitives the IFC export
 * emits files with:
 *
 * - **canonical real literals** — STEP REAL requires a decimal
 *   point; integers serialize as `4.`, decimals verbatim (`0.85`),
 *   exponent forms as `1.E-7` (uppercase E, mantissa always carries
 *   a point), and negative zero is normalized to `0.` (byte-stable
 *   documents — the AISE-017 canonical-number discipline);
 * - **canonical string literals** — single-quoted, embedded quotes
 *   doubled (`''`), restricted to printable ASCII (fail-closed on
 *   anything else: raw backslash is the STEP control-character
 *   introducer and cannot appear unescaped);
 * - **typed argument values** — entity references, enumerations,
 *   booleans, lists, the unset marker `$` and the derived marker
 *   `*` — rendered through one deterministic renderer;
 * - **the writer** — assigns sequential entity ids `#1, #2, …` in
 *   emission order (canonical order = deterministic order).
 *
 * Determinism: no clock, no randomness, no environment reads —
 * two exports of the same graph emit byte-identical files
 * (regression-scanned and tested).
 */

/** One typed STEP argument value. */
export type SpfValue =
  | { readonly t: "ref"; readonly id: number }
  | { readonly t: "str"; readonly v: string }
  | { readonly t: "enum"; readonly v: string }
  | { readonly t: "real"; readonly v: number }
  | { readonly t: "int"; readonly v: number }
  | { readonly t: "bool"; readonly v: boolean }
  | { readonly t: "list"; readonly v: readonly SpfValue[] }
  | { readonly t: "unset" }
  | { readonly t: "derived" };

/** Constructs a reference argument (`#N`). */
export function ref(id: number): SpfValue {
  return { t: "ref", id };
}

/** Constructs a string argument (escaped on render). */
export function str(v: string): SpfValue {
  return { t: "str", v };
}

/** Constructs an enumeration argument (`.VALUE.`). */
export function en(v: string): SpfValue {
  return { t: "enum", v };
}

/** Constructs a real argument (canonical literal). */
export function real(v: number): SpfValue {
  return { t: "real", v };
}

/** Constructs an integer argument. */
export function int(v: number): SpfValue {
  return { t: "int", v };
}

/** Constructs a boolean argument (`.T.` / `.F.`). */
export function bool(v: boolean): SpfValue {
  return { t: "bool", v };
}

/** Constructs a list argument. */
export function list(v: readonly SpfValue[]): SpfValue {
  return { t: "list", v };
}

/** The unset marker `$` (an absent optional attribute). */
export const UNSET: SpfValue = { t: "unset" };

/** The derived marker `*` (a derived attribute's self-value). */
export const DERIVED: SpfValue = { t: "derived" };

/** Enumeration token shape (upper-case identifier). */
const ENUM_PATTERN = /^[A-Z0-9_]+$/;

/** Renders one canonical STEP real literal. */
export function formatReal(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`STEP real literal must be finite: ${String(value)}`);
  }
  // Canonical zero: -0 normalizes to "0." (byte-stable output).
  if (value === 0) {
    return "0.";
  }
  if (Number.isInteger(value) && Math.abs(value) < 1e21) {
    return `${value}.`;
  }
  let text = String(value);
  const eIndex = text.indexOf("e");
  if (eIndex >= 0) {
    // Exponent form: uppercase E, mantissa must carry a decimal point.
    let mantissa = text.slice(0, eIndex);
    const exponent = text.slice(eIndex + 1);
    if (!mantissa.includes(".")) {
      mantissa = `${mantissa}.`;
    }
    text = `${mantissa}E${exponent}`;
  } else if (!text.includes(".")) {
    text = `${text}.`;
  }
  return text;
}

/** Renders one canonical STEP string literal (fail-closed escaping). */
export function formatString(value: string): string {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code < 32 || code > 126) {
      throw new Error(
        `STEP string literals are restricted to printable ASCII; found U+${code.toString(16).toUpperCase().padStart(4, "0")} in ${value.slice(0, 40)}`,
      );
    }
    if (character === "\\") {
      // Backslash introduces STEP control directives (\X2\ etc.) and
      // cannot appear unescaped; our model vocabulary never needs it.
      throw new Error(`STEP string literals cannot contain a raw backslash: ${value.slice(0, 40)}`);
    }
  }
  return `'${value.replaceAll("'", "''")}'`;
}

/** Renders one typed argument value. */
export function renderValue(value: SpfValue): string {
  switch (value.t) {
    case "ref":
      return `#${value.id}`;
    case "str":
      return formatString(value.v);
    case "enum":
      if (!ENUM_PATTERN.test(value.v)) {
        throw new Error(`STEP enumeration token must be upper-case alphanumeric: ${value.v}`);
      }
      return `.${value.v}.`;
    case "real":
      return formatReal(value.v);
    case "int":
      if (!Number.isInteger(value.v)) {
        throw new Error(`STEP integer literal must be an integer: ${String(value.v)}`);
      }
      return String(value.v);
    case "bool":
      return value.v ? ".T." : ".F.";
    case "list":
      return `(${value.v.map(renderValue).join(",")})`;
    case "unset":
      return "$";
    case "derived":
      return "*";
  }
}

/**
 * The deterministic STEP physical file writer.
 *
 * Entity ids are assigned sequentially from 1 in emission order
 * (the emission order is the canonical, content-derived order —
 * never insertion-timing). The final document is assembled from
 * the fixed header (supplied by the caller — the IFC core owns
 * the header content) and the emitted data entities.
 */
export class SpfWriter {
  private nextId = 0;
  private readonly lines: string[] = [];

  /** The id the next entity will receive (observability). */
  get count(): number {
    return this.nextId;
  }

  /** Appends one entity instance; returns its assigned id. */
  add(name: string, args: readonly SpfValue[]): number {
    if (!/^[A-Z0-9_]+$/.test(name)) {
      throw new Error(`STEP entity name must be upper-case alphanumeric: ${name}`);
    }
    this.nextId += 1;
    const id = this.nextId;
    this.lines.push(`#${id}=${name}(${args.map(renderValue).join(",")});`);
    return id;
  }

  /** Assembles the complete file around the given header entities. */
  toFile(header: readonly string[]): string {
    return [
      "ISO-10303-21;",
      "HEADER;",
      ...header,
      "ENDSEC;",
      "DATA;",
      ...this.lines,
      "ENDSEC;",
      "END-ISO-10303-21;",
      "",
    ].join("\n");
  }
}
