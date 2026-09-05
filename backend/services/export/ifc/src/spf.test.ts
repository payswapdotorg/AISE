/**
 * STEP physical file serialization primitive tests (AISE-018).
 *
 * The byte-stability of the whole IFC export rests on these
 * primitives: canonical real literals (integers carry a decimal
 * point, `-0` normalizes, exponent forms are uppercase with a
 * dotted mantissa), fail-closed printable-ASCII string escaping
 * (embedded quotes doubled, raw backslash rejected), typed
 * argument rendering, and the sequential entity writer with the
 * fixed file wrapper.
 */
import { describe, expect, it } from "vitest";
import {
  formatReal,
  formatString,
  renderValue,
  SpfWriter,
  UNSET,
  DERIVED,
  bool,
  en,
  int,
  list,
  real,
  ref,
  str,
} from "./spf.js";

describe("formatReal", () => {
  it("renders integers with a decimal point", () => {
    expect(formatReal(4)).toBe("4.");
    expect(formatReal(-4)).toBe("-4.");
    expect(formatReal(0)).toBe("0.");
    expect(formatReal(12)).toBe("12.");
  });

  it("normalizes negative zero to canonical zero (byte-stable output)", () => {
    expect(formatReal(-0)).toBe("0.");
  });

  it("renders decimals verbatim", () => {
    expect(formatReal(0.85)).toBe("0.85");
    expect(formatReal(0.00001)).toBe("0.00001");
    expect(formatReal(2.7)).toBe("2.7");
    expect(formatReal(0.8499999999999999)).toBe("0.8499999999999999");
  });

  it("renders exponent forms with uppercase E and a dotted mantissa", () => {
    expect(formatReal(1.5e-7)).toBe("1.5E-7");
    expect(formatReal(1e21)).toBe("1.E+21");
    expect(formatReal(-2.5e-9)).toBe("-2.5E-9");
  });

  it("fails closed on non-finite values", () => {
    expect(() => formatReal(Number.NaN)).toThrow();
    expect(() => formatReal(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => formatReal(Number.NEGATIVE_INFINITY)).toThrow();
  });
});

describe("formatString", () => {
  it("wraps in single quotes", () => {
    expect(formatString("AISE")).toBe("'AISE'");
  });

  it("doubles embedded single quotes", () => {
    expect(formatString("bob's")).toBe("'bob''s'");
    expect(formatString("'")).toBe("''''");
    // Two embedded quotes double to four, plus the wrapping pair.
    expect(formatString("''")).toBe("''''''");
  });

  it("rejects raw backslash (the STEP control-character introducer)", () => {
    expect(() => formatString("a\\b")).toThrow();
  });

  it("rejects non-printable-ASCII characters", () => {
    expect(() => formatString("naïve")).toThrow();
    expect(() => formatString("line\nbreak")).toThrow();
    expect(() => formatString("tab\tchar")).toThrow();
  });
});

describe("renderValue", () => {
  it("renders each typed value deterministically", () => {
    expect(renderValue(ref(5))).toBe("#5");
    expect(renderValue(str("x'y"))).toBe("'x''y'");
    expect(renderValue(en("SOLIDWALL"))).toBe(".SOLIDWALL.");
    expect(renderValue(real(4))).toBe("4.");
    expect(renderValue(int(0))).toBe("0");
    expect(renderValue(bool(true))).toBe(".T.");
    expect(renderValue(bool(false))).toBe(".F.");
    expect(renderValue(UNSET)).toBe("$");
    expect(renderValue(DERIVED)).toBe("*");
    expect(renderValue(list([ref(1), ref(2)]))).toBe("(#1,#2)");
    expect(renderValue(list([]))).toBe("()");
    expect(renderValue(list([list([real(0)]), UNSET]))).toBe("((0.),$)");
  });

  it("fails closed on invalid enumeration tokens", () => {
    expect(() => renderValue(en("solidwall"))).toThrow();
    expect(() => renderValue(en("SOLID WALL"))).toThrow();
  });

  it("fails closed on non-integer integer literals", () => {
    expect(() => renderValue(int(1.5))).toThrow();
  });
});

describe("SpfWriter", () => {
  it("assigns sequential entity ids from 1 in emission order", () => {
    const writer = new SpfWriter();
    expect(writer.add("IFCPERSON", [UNSET, str("x")])).toBe(1);
    expect(writer.add("IFCORGANIZATION", [UNSET, str("y")])).toBe(2);
    expect(writer.count).toBe(2);
  });

  it("fails closed on invalid entity names", () => {
    const writer = new SpfWriter();
    expect(() => writer.add("ifcwall", [])).toThrow();
    expect(() => writer.add("IFC WALL", [])).toThrow();
  });

  it("assembles the complete file wrapper around the header and data entities", () => {
    const writer = new SpfWriter();
    writer.add("IFCPERSON", [str("AISE"), UNSET, UNSET, UNSET, UNSET, UNSET, UNSET, UNSET]);
    const file = writer.toFile(["FILE_SCHEMA(('IFC4X3_ADD2'));"]);
    const lines = file.split("\n");
    expect(lines[0]).toBe("ISO-10303-21;");
    expect(lines[1]).toBe("HEADER;");
    expect(lines[2]).toBe("FILE_SCHEMA(('IFC4X3_ADD2'));");
    expect(lines[3]).toBe("ENDSEC;");
    expect(lines[4]).toBe("DATA;");
    expect(lines[5]).toBe("#1=IFCPERSON('AISE',$,$,$,$,$,$,$);");
    expect(lines[6]).toBe("ENDSEC;");
    expect(lines[7]).toBe("END-ISO-10303-21;");
    expect(file.endsWith("\n")).toBe(true);
  });
});
