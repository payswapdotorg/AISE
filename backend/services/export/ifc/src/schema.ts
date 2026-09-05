/**
 * IFC 4.3 schema conformance validation for the emitted subset
 * (AISE-018 — the `schema-valid` acceptance core).
 *
 * The full IFC4X3_ADD2 EXPRESS schema comprises thousands of
 * entities and rule constraints; validating it requires external
 * tooling (IfcOpenShell / IDS / bSI validation service). What THIS
 * module provides is the honest, machine-checked conformance proof
 * for the exact entity subset this exporter emits, at the
 * structural level the STEP physical file carries:
 *
 * 1. **ISO 10303-21 syntax** — section structure
 *    (`ISO-10303-21; HEADER; … ENDSEC; DATA; … ENDSEC;
 *    END-ISO-10303-21;`), entity instances, typed argument tokens
 *    (references, quoted strings, enumerations, reals, integers,
 *    booleans, lists, `$` unset, `*` derived);
 * 2. **entity signatures** — every emitted entity must be in the
 *    frozen IFC4X3 subset vocabulary with the exact flattened
 *    attribute count and per-attribute kinds declared in
 *    `IFC4X3_ENTITY_SIGNATURES` (mirroring the IFC4X3_ADD2
 *    attribute lists, including optionality);
 * 3. **referential integrity** — every `#N` reference resolves to
 *    a defined entity; entity ids are unique and canonical
 *    (sequential from 1 — the writer's discipline);
 * 4. **identifier discipline** — every `IfcGloballyUniqueId` is
 *    22 characters over the IFC GUID alphabet with the 2-bit head
 *    (alphabet index < 4), and globally unique across the file;
 * 5. **unit discipline** — `IFCSIUNIT` carries exactly the unit
 *    tokens this exporter declares (LENGTHUNIT/METRE,
 *    AREAUNIT/SQUARE_METRE, PLANEANGLEUNIT/RADIAN);
 * 6. **string discipline** — printable ASCII, no raw backslash
 *    (parity with the writer).
 *
 * The export runtime runs this validator on its OWN output and
 * fails closed (`EXPORT_INVALID`) — the service never returns a
 * file that does not pass. The full-schema external validation
 * requirement is declared inside the export document's
 * limitations, never silently implied.
 */
import { isWellFormedIfcGuid } from "./guid.js";

/** The STEP schema identifier this exporter declares (IFC 4.3 ADD2). */
export const IFC4X3_SCHEMA_NAME = "IFC4X3_ADD2";

// ---------------------------------------------------------------------------
// Parsed representation
// ---------------------------------------------------------------------------

/** One parsed STEP argument value (mirrors the writer's `SpfValue`). */
export type ParsedArg =
  | { readonly t: "ref"; readonly id: number }
  | { readonly t: "str"; readonly v: string }
  | { readonly t: "enum"; readonly v: string }
  | { readonly t: "real"; readonly v: number }
  | { readonly t: "int"; readonly v: number }
  | { readonly t: "bool"; readonly v: boolean }
  | { readonly t: "list"; readonly v: readonly ParsedArg[] }
  | { readonly t: "unset" }
  | { readonly t: "derived" };

/** One parsed data entity instance. */
export interface ParsedSpfEntity {
  readonly id: number;
  readonly name: string;
  readonly args: readonly ParsedArg[];
}

/** One parsed header entity (no instance id). */
export interface ParsedHeaderEntity {
  readonly name: string;
  readonly args: readonly ParsedArg[];
}

/** Successful validation result. */
export interface SpfValidationOk {
  readonly ok: true;
  readonly schema: string;
  readonly entityCount: number;
  readonly entities: readonly ParsedSpfEntity[];
}

/** Failed validation result — the COMPLETE error list, never just the first. */
export interface SpfValidationFailure {
  readonly ok: false;
  readonly errors: readonly string[];
}

export type SpfValidationResult = SpfValidationOk | SpfValidationFailure;

// ---------------------------------------------------------------------------
// Entity signature table (the frozen emitted subset, IFC4X3_ADD2)
// ---------------------------------------------------------------------------

/** Argument kinds recognized by the signature table. */
export type AttributeKind =
  | "guid"
  | "string"
  | "enum"
  | "integer"
  | "real"
  | "boolean"
  | "ref"
  | "select"
  | "derived"
  | "list-of-ref"
  | "list-of-real";

/** One declared attribute of an emitted entity. */
export interface AttributeSpec {
  readonly kind: AttributeKind;
  /** The STEP unset marker `$` satisfies the attribute. */
  readonly optional?: boolean;
  /** List cardinality bounds (inclusive), for list kinds. */
  readonly min?: number;
  readonly max?: number;
}

/** Declares one required attribute of the given kind. */
function a(kind: AttributeKind, spec: Omit<AttributeSpec, "kind"> = {}): AttributeSpec {
  return { kind, ...spec };
}

/** Declares one optional attribute of the given kind. */
function o(kind: AttributeKind, spec: Omit<AttributeSpec, "kind" | "optional"> = {}): AttributeSpec {
  return { kind, optional: true, ...spec };
}

/**
 * The flattened SPF attribute signatures of the exact entity
 * subset this exporter emits, per IFC4X3_ADD2. Attribute counts
 * include inherited attributes as they appear in the physical
 * file (e.g. `IFCDOOR` = 11: GlobalId, OwnerHistory, Name,
 * Description, ObjectType, ObjectPlacement, Representation, Tag,
 * OverallHeight, OverallWidth, PredefinedType).
 */
export const IFC4X3_ENTITY_SIGNATURES: Readonly<Record<string, readonly AttributeSpec[]>> =
  Object.freeze({
    IFCPROJECT: [a("guid"), o("ref"), o("string"), o("string"), o("string"), o("string"), o("string"), a("list-of-ref", { min: 1 }), a("ref")],
    IFCSITE: [a("guid"), o("ref"), o("string"), o("string"), o("string"), o("string"), o("ref"), o("ref"), o("string"), o("ref")],
    IFCBUILDING: [a("guid"), o("ref"), o("string"), o("string"), o("string"), o("string"), o("ref"), o("ref"), o("real"), o("real"), o("ref")],
    IFCSTOREY: [a("guid"), o("ref"), o("string"), o("string"), o("string"), o("string"), o("ref"), o("ref"), o("real")],
    IFCSPACE: [a("guid"), o("ref"), o("string"), o("string"), o("string"), o("ref"), o("ref"), o("string"), o("enum")],
    IFCWALL: [a("guid"), o("ref"), o("string"), o("string"), o("string"), o("ref"), o("ref"), o("string"), a("enum")],
    IFCSLAB: [a("guid"), o("ref"), o("string"), o("string"), o("string"), o("ref"), o("ref"), o("string"), a("enum")],
    IFCCOVERING: [a("guid"), o("ref"), o("string"), o("string"), o("string"), o("ref"), o("ref"), o("string"), a("enum")],
    IFCOPENINGELEMENT: [a("guid"), o("ref"), o("string"), o("string"), o("string"), o("ref"), o("ref"), o("string")],
    IFCDOOR: [a("guid"), o("ref"), o("string"), o("string"), o("string"), o("ref"), o("ref"), o("string"), o("real"), o("real"), a("enum")],
    IFCWINDOW: [a("guid"), o("ref"), o("string"), o("string"), o("string"), o("ref"), o("ref"), o("string"), o("real"), o("real"), a("enum")],
    IFCRELAGGREGATES: [a("guid"), o("ref"), o("string"), o("string"), a("ref"), a("list-of-ref", { min: 1 })],
    IFCRELCONTAINEDINSPATIALSTRUCTURE: [a("guid"), o("ref"), o("string"), o("string"), a("list-of-ref", { min: 1 }), a("ref")],
    IFCRELVOIDSELEMENT: [a("guid"), o("ref"), o("string"), o("string"), a("ref"), a("ref")],
    IFCRELFILLSELEMENT: [a("guid"), o("ref"), o("string"), o("string"), a("ref"), a("ref")],
    IFCRELDEFINESBYPROPERTIES: [a("guid"), o("ref"), o("string"), o("string"), a("list-of-ref", { min: 1 }), a("ref")],
    IFCPROPERTYSET: [a("guid"), o("ref"), a("string"), o("string"), a("list-of-ref", { min: 1 })],
    IFCPROPERTYSINGLEVALUE: [a("string"), o("string"), o("select"), o("ref")],
    IFCELEMENTQUANTITY: [a("guid"), o("ref"), a("string"), o("string"), o("string"), a("list-of-ref", { min: 1 })],
    IFCQUANTITYLENGTH: [a("string"), o("string"), o("ref"), a("real"), o("string")],
    IFCQUANTITYAREA: [a("string"), o("string"), o("ref"), a("real"), o("string")],
    IFCPERSON: [o("string"), o("string"), o("string"), o("string"), o("string"), o("string"), o("list-of-ref"), o("list-of-ref")],
    IFCORGANIZATION: [o("string"), a("string"), o("string"), o("list-of-ref"), o("list-of-ref")],
    IFCPERSONANDORGANIZATION: [a("ref"), a("ref"), o("list-of-ref")],
    IFCAPPLICATION: [a("ref"), a("string"), a("string"), a("string")],
    IFCOWNERHISTORY: [a("ref"), a("ref"), o("enum"), o("integer"), o("ref"), o("ref"), a("integer")],
    IFCUNITASSIGNMENT: [a("list-of-ref", { min: 1 })],
    IFCSIUNIT: [a("derived"), a("enum"), o("enum"), a("enum")],
    IFCCARTESIANPOINT: [a("list-of-real", { min: 1, max: 3 })],
    IFCDIRECTION: [a("list-of-real", { min: 2, max: 3 })],
    IFCAXIS2PLACEMENT3D: [a("ref"), o("ref"), o("ref")],
    IFCLOCALPLACEMENT: [o("ref"), a("ref")],
    IFCGEOMETRICREPRESENTATIONCONTEXT: [o("string"), o("string"), a("integer"), o("real"), a("ref"), o("ref")],
    IFCSHAPEREPRESENTATION: [a("ref"), a("string"), o("string"), a("list-of-ref", { min: 1 })],
    IFCPRODUCTDEFINITIONSHAPE: [o("string"), o("string"), a("list-of-ref", { min: 1 })],
    IFCPOLYLINE: [a("list-of-ref", { min: 2 })],
    IFCGEOMETRICCURVESET: [a("list-of-ref", { min: 1 })],
  });

/** The exact SI unit tokens this exporter declares. */
const SI_UNIT_TOKENS = {
  unitType: ["LENGTHUNIT", "AREAUNIT", "PLANEANGLEUNIT"],
  name: ["METRE", "SQUARE_METRE", "RADIAN"],
} as const;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([Ee][+-]?\d+)?$/;
const INTEGER_PATTERN = /^[+-]?\d+$/;
const ENTITY_NAME_PATTERN = /^[A-Z0-9_]+$/;
const PRINTABLE_ASCII = /^[\x20-\x7E]*$/;

/** Thrown on the first structural/syntax failure (semantic errors accumulate). */
class ParserError extends Error {}

/** A cursor-based STEP physical file parser (canonical serialization). */
class SpfParser {
  private position = 0;

  constructor(private readonly text: string) {}

  // --- low-level cursor ---------------------------------------------------

  private eof(): boolean {
    return this.position >= this.text.length;
  }

  private peek(): string {
    return this.text[this.position] ?? "";
  }

  private advance(): string {
    const character = this.text[this.position] ?? "";
    this.position += 1;
    return character;
  }

  private skipWhitespace(): void {
    while (!this.eof() && /\s/.test(this.peek())) {
      this.advance();
    }
  }

  private expect(literal: string): void {
    this.skipWhitespace();
    if (!this.text.startsWith(literal, this.position)) {
      throw new ParserError(`expected ${JSON.stringify(literal)} at offset ${this.position}`);
    }
    this.position += literal.length;
  }

  private atKeyword(literal: string): boolean {
    this.skipWhitespace();
    return this.text.startsWith(literal, this.position);
  }

  // --- top-level walk -----------------------------------------------------

  /**
   * Walks `ISO-10303-21; HEADER; <header entities> ENDSEC; DATA;
   * <data entities> ENDSEC; END-ISO-10303-21;` exactly.
   */
  parseTopLevel(callbacks: {
    onHeaderEntity: (entity: ParsedHeaderEntity) => void;
    onDataEntity: (entity: ParsedSpfEntity) => void;
  }): void {
    this.expect("ISO-10303-21;");
    this.expect("HEADER;");
    for (;;) {
      if (this.atKeyword("ENDSEC;")) {
        break;
      }
      const parsed = this.parseEntity();
      if (parsed.id !== null) {
        throw new ParserError(`header entity must not carry an instance id: ${parsed.name}`);
      }
      callbacks.onHeaderEntity({ name: parsed.name, args: parsed.args });
    }
    this.expect("ENDSEC;");
    this.expect("DATA;");
    for (;;) {
      if (this.atKeyword("ENDSEC;")) {
        break;
      }
      const parsed = this.parseEntity();
      if (parsed.id === null) {
        throw new ParserError(`data entity must carry an instance id: ${parsed.name}`);
      }
      callbacks.onDataEntity({ id: parsed.id, name: parsed.name, args: parsed.args });
    }
    this.expect("ENDSEC;");
    this.expect("END-ISO-10303-21;");
    this.skipWhitespace();
    if (!this.eof()) {
      throw new ParserError(`unexpected trailing content at offset ${this.position}`);
    }
  }

  // --- entity/argument grammar ---------------------------------------------

  /** Parses `[#N=]NAME(args);`. */
  private parseEntity(): { id: number | null; name: string; args: readonly ParsedArg[] } {
    this.skipWhitespace();
    let id: number | null = null;
    if (this.peek() === "#") {
      this.advance();
      const digits = this.readNumberToken();
      if (!INTEGER_PATTERN.test(digits)) {
        throw new ParserError(`entity id must be an integer: ${digits}`);
      }
      this.expect("=");
      id = Number.parseInt(digits, 10);
    }
    const name = this.readEntityName();
    this.expect("(");
    const args = this.parseArgs();
    this.expect(")");
    this.expect(";");
    return { id, name, args };
  }

  private readEntityName(): string {
    this.skipWhitespace();
    const start = this.position;
    while (!this.eof() && /[A-Za-z0-9_]/.test(this.peek())) {
      this.advance();
    }
    const name = this.text.slice(start, this.position);
    if (name.length === 0) {
      throw new ParserError(`expected an entity name at offset ${start}`);
    }
    return name.toUpperCase();
  }

  /** Parses comma-separated arguments (the caller consumed `(`). */
  private parseArgs(): ParsedArg[] {
    const args: ParsedArg[] = [];
    this.skipWhitespace();
    if (this.peek() === ")") {
      return args;
    }
    for (;;) {
      args.push(this.parseArg());
      this.skipWhitespace();
      if (this.peek() === ",") {
        this.advance();
        continue;
      }
      return args;
    }
  }

  private parseArg(): ParsedArg {
    this.skipWhitespace();
    const character = this.peek();
    if (character === "#") {
      this.advance();
      const digits = this.readNumberToken();
      if (!INTEGER_PATTERN.test(digits)) {
        throw new ParserError(`entity reference must be an integer id: ${digits}`);
      }
      return { t: "ref", id: Number.parseInt(digits, 10) };
    }
    if (character === "'") {
      return { t: "str", v: this.parseString() };
    }
    if (character === ".") {
      this.advance();
      const token = this.readUntil(".");
      if (token === "T") {
        return { t: "bool", v: true };
      }
      if (token === "F") {
        return { t: "bool", v: false };
      }
      if (!ENTITY_NAME_PATTERN.test(token)) {
        throw new ParserError(`invalid enumeration token: .${token}.`);
      }
      return { t: "enum", v: token };
    }
    if (character === "$") {
      this.advance();
      return { t: "unset" };
    }
    if (character === "*") {
      this.advance();
      return { t: "derived" };
    }
    if (character === "(") {
      this.advance();
      const items = this.parseArgs();
      this.expect(")");
      return { t: "list", v: items };
    }
    const token = this.readNumberToken();
    if (token.length === 0) {
      throw new ParserError(`unrecognized argument token at offset ${this.position}`);
    }
    if (INTEGER_PATTERN.test(token)) {
      return { t: "int", v: Number.parseInt(token, 10) };
    }
    if (NUMBER_PATTERN.test(token)) {
      return { t: "real", v: Number(token) };
    }
    throw new ParserError(`unrecognized argument token at offset ${this.position}: ${token}`);
  }

  private readNumberToken(): string {
    this.skipWhitespace();
    const start = this.position;
    while (!this.eof() && /[0-9+\-.Ee]/.test(this.peek())) {
      this.advance();
    }
    return this.text.slice(start, this.position);
  }

  /** Parses a quoted STEP string (doubled quotes unescaped). */
  private parseString(): string {
    if (this.peek() !== "'") {
      throw new ParserError(`expected a quoted string at offset ${this.position}`);
    }
    this.advance();
    let value = "";
    for (;;) {
      if (this.eof()) {
        throw new ParserError("unterminated string literal");
      }
      const character = this.advance();
      if (character === "'") {
        if (this.peek() === "'") {
          this.advance();
          value += "'";
          continue;
        }
        return value;
      }
      value += character;
    }
  }

  private readUntil(delimiter: string): string {
    const start = this.position;
    const index = this.text.indexOf(delimiter, this.position);
    if (index < 0) {
      throw new ParserError(`expected ${JSON.stringify(delimiter)} after offset ${start}`);
    }
    this.position = index + delimiter.length;
    return this.text.slice(start, index);
  }
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/** Validates an emitted STEP physical file (complete error list). */
export function validateIfcSpf(
  text: string,
  options: { readonly expectedSchema?: string } = {},
): SpfValidationResult {
  const expectedSchema = options.expectedSchema ?? IFC4X3_SCHEMA_NAME;
  const errors: string[] = [];
  if (typeof text !== "string" || text.length === 0) {
    return { ok: false, errors: ["the STEP physical file is empty"] };
  }

  const parser = new SpfParser(text);
  let header: ParsedHeaderEntity[] = [];
  const entities: ParsedSpfEntity[] = [];
  let declaredSchema = "";
  try {
    parser.parseTopLevel({
      onHeaderEntity: (entity) => {
        header = [...header, entity];
        if (entity.name === "FILE_SCHEMA") {
          const schemaArg = entity.args[0];
          if (schemaArg === undefined || schemaArg.t !== "list" || schemaArg.v.length < 1) {
            errors.push("FILE_SCHEMA must carry a non-empty list of schema names");
          } else {
            const first = schemaArg.v[0]!;
            if (first.t !== "str") {
              errors.push("FILE_SCHEMA schema name must be a string");
            } else {
              declaredSchema = first.v;
            }
          }
        }
      },
      onDataEntity: (entity) => {
        entities.push(entity);
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [...errors, `syntax: ${message}`] };
  }

  // --- header structure ---------------------------------------------------
  const headerNames = header.map((entity) => entity.name);
  for (const required of ["FILE_DESCRIPTION", "FILE_NAME", "FILE_SCHEMA"]) {
    if (!headerNames.includes(required)) {
      errors.push(`header entity ${required} is missing`);
    }
  }
  if (declaredSchema !== expectedSchema) {
    errors.push(
      `FILE_SCHEMA must declare ${expectedSchema} (the exporter's schema); found: ${declaredSchema || "(none)"}`,
    );
  }
  const fileName = header.find((entity) => entity.name === "FILE_NAME");
  if (fileName !== undefined && fileName.args.length !== 7) {
    errors.push(`FILE_NAME must carry 7 attributes; found ${fileName.args.length}`);
  }
  // String parity with the writer applies to the header too (printable
  // ASCII, no raw backslash) — the header is emitted by the same
  // fail-closed formatting path.
  for (const entity of header) {
    for (const arg of entity.args) {
      checkHeaderStrings(entity.name, arg, errors);
    }
  }

  // --- data entity semantics ---------------------------------------------
  const ids = new Set<number>();
  const guids = new Map<string, number>();
  for (const entity of entities) {
    if (ids.has(entity.id)) {
      errors.push(`duplicate entity id #${entity.id} (${entity.name})`);
    }
    ids.add(entity.id);
    if (entity.id < 1) {
      errors.push(`entity id must be positive: #${entity.id} (${entity.name})`);
    }
    const signature = IFC4X3_ENTITY_SIGNATURES[entity.name];
    if (signature === undefined) {
      errors.push(`entity ${entity.name} is outside the emitted IFC4X3 subset vocabulary`);
      continue;
    }
    if (entity.args.length !== signature.length) {
      errors.push(
        `${entity.name} #${entity.id} must carry ${signature.length} attributes; found ${entity.args.length}`,
      );
      continue;
    }
    for (const [index, arg] of entity.args.entries()) {
      checkArg(entity, index, arg, signature[index]!, errors);
    }
    if (signature[0]?.kind === "guid") {
      const guidArg = entity.args[0]!;
      if (guidArg.t === "str") {
        const existing = guids.get(guidArg.v);
        if (existing !== undefined) {
          errors.push(`duplicate IfcGloballyUniqueId ${guidArg.v} on #${existing} and #${entity.id}`);
        } else {
          guids.set(guidArg.v, entity.id);
        }
      }
    }
    if (entity.name === "IFCSIUNIT") {
      checkSiUnit(entity, errors);
    }
  }

  // Canonical writer discipline: sequential ids from 1.
  for (let expected = 1; expected <= entities.length; expected += 1) {
    if (!ids.has(expected)) {
      errors.push(`entity ids are not the canonical sequence: #${expected} is missing`);
      break;
    }
  }

  // Referential integrity (after the full pass).
  for (const entity of entities) {
    for (const arg of entity.args) {
      checkReferences(entity, arg, ids, errors);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, schema: declaredSchema, entityCount: entities.length, entities };
}

// --- per-argument checks -----------------------------------------------------

function checkArg(
  entity: ParsedSpfEntity,
  index: number,
  arg: ParsedArg,
  spec: AttributeSpec,
  errors: string[],
): void {
  if (arg.t === "unset") {
    if (!spec.optional) {
      errors.push(`${entity.name} #${entity.id} attribute ${index + 1} is required (unset not allowed)`);
    }
    return;
  }
  switch (spec.kind) {
    case "guid":
      if (arg.t !== "str" || !isWellFormedIfcGuid(arg.v)) {
        errors.push(
          `${entity.name} #${entity.id} attribute ${index + 1} must be a 22-character IfcGloballyUniqueId`,
        );
      }
      return;
    case "string":
      if (arg.t !== "str") {
        errors.push(`${entity.name} #${entity.id} attribute ${index + 1} must be a string`);
      } else {
        checkString(entity, index, arg.v, errors);
      }
      return;
    case "enum":
      if (arg.t !== "enum") {
        errors.push(`${entity.name} #${entity.id} attribute ${index + 1} must be an enumeration`);
      }
      return;
    case "integer":
      if (arg.t !== "int") {
        errors.push(`${entity.name} #${entity.id} attribute ${index + 1} must be an integer`);
      }
      return;
    case "real":
      if (arg.t !== "real" || !Number.isFinite(arg.v)) {
        errors.push(`${entity.name} #${entity.id} attribute ${index + 1} must be a finite real`);
      }
      return;
    case "boolean":
      if (arg.t !== "bool") {
        errors.push(`${entity.name} #${entity.id} attribute ${index + 1} must be a boolean`);
      }
      return;
    case "ref":
      if (arg.t !== "ref") {
        errors.push(`${entity.name} #${entity.id} attribute ${index + 1} must be an entity reference`);
      }
      return;
    case "derived":
      if (arg.t !== "derived") {
        errors.push(`${entity.name} #${entity.id} attribute ${index + 1} must be the derived marker *`);
      }
      return;
    case "select":
      if (arg.t === "str") {
        checkString(entity, index, arg.v, errors);
      } else if (arg.t === "real") {
        if (!Number.isFinite(arg.v)) {
          errors.push(`${entity.name} #${entity.id} attribute ${index + 1} must be a finite real`);
        }
      } else if (arg.t !== "enum" && arg.t !== "bool") {
        errors.push(
          `${entity.name} #${entity.id} attribute ${index + 1} must be a select value (string/real/enum/boolean)`,
        );
      }
      return;
    case "list-of-ref":
      if (arg.t !== "list") {
        errors.push(`${entity.name} #${entity.id} attribute ${index + 1} must be a list`);
        return;
      }
      checkCardinality(entity, index, arg.v.length, spec, errors);
      for (const item of arg.v) {
        if (item.t !== "ref") {
          errors.push(`${entity.name} #${entity.id} attribute ${index + 1} must be a list of entity references`);
        }
      }
      return;
    case "list-of-real":
      if (arg.t !== "list") {
        errors.push(`${entity.name} #${entity.id} attribute ${index + 1} must be a list`);
        return;
      }
      checkCardinality(entity, index, arg.v.length, spec, errors);
      for (const item of arg.v) {
        if (item.t !== "real" || !Number.isFinite(item.v)) {
          errors.push(`${entity.name} #${entity.id} attribute ${index + 1} must be a list of finite reals`);
        }
      }
      return;
  }
}

function checkCardinality(
  entity: ParsedSpfEntity,
  index: number,
  length: number,
  spec: AttributeSpec,
  errors: string[],
): void {
  if (spec.min !== undefined && length < spec.min) {
    errors.push(
      `${entity.name} #${entity.id} attribute ${index + 1} list must carry at least ${spec.min} item(s); found ${length}`,
    );
  }
  if (spec.max !== undefined && length > spec.max) {
    errors.push(
      `${entity.name} #${entity.id} attribute ${index + 1} list must carry at most ${spec.max} item(s); found ${length}`,
    );
  }
}

function checkString(entity: ParsedSpfEntity, index: number, value: string, errors: string[]): void {
  if (!PRINTABLE_ASCII.test(value) || value.includes("\\")) {
    errors.push(
      `${entity.name} #${entity.id} attribute ${index + 1} string is not printable ASCII or contains a raw backslash`,
    );
  }
}

function checkHeaderStrings(name: string, arg: ParsedArg, errors: string[]): void {
  if (arg.t === "str") {
    if (!PRINTABLE_ASCII.test(arg.v) || arg.v.includes("\\")) {
      errors.push(`header entity ${name} string is not printable ASCII or contains a raw backslash`);
    }
    return;
  }
  if (arg.t === "list") {
    for (const item of arg.v) {
      checkHeaderStrings(name, item, errors);
    }
  }
}

function checkReferences(
  entity: ParsedSpfEntity,
  arg: ParsedArg,
  ids: ReadonlySet<number>,
  errors: string[],
): void {
  if (arg.t === "ref") {
    if (!ids.has(arg.id)) {
      errors.push(`${entity.name} #${entity.id} references undefined entity #${arg.id}`);
    }
    return;
  }
  if (arg.t === "list") {
    for (const item of arg.v) {
      checkReferences(entity, item, ids, errors);
    }
  }
}

function checkSiUnit(entity: ParsedSpfEntity, errors: string[]): void {
  const unitType = entity.args[1];
  const prefix = entity.args[2];
  const name = entity.args[3];
  if (
    unitType !== undefined &&
    unitType.t === "enum" &&
    !(SI_UNIT_TOKENS.unitType as readonly string[]).includes(unitType.v)
  ) {
    errors.push(`IFCSIUNIT #${entity.id} carries an unsupported unit type: .${unitType.v}.`);
  }
  if (
    name !== undefined &&
    name.t === "enum" &&
    !(SI_UNIT_TOKENS.name as readonly string[]).includes(name.v)
  ) {
    errors.push(`IFCSIUNIT #${entity.id} carries an unsupported unit name: .${name.v}.`);
  }
  if (prefix !== undefined && prefix.t !== "unset") {
    errors.push(`IFCSIUNIT #${entity.id} must not carry a prefix (SI base units only)`);
  }
}
