/**
 * QA-007 — the definition-list structural proofs (axe "definition-list" +
 * "dlitem", both SERIOUS), failing-first.
 *
 * The defect (the live deployed-check accessibility gate caught it): the
 * semantic-objects audit rendered its dt/dd groups wrapped in
 * `<span className="field">` inside `<dl>` elements — HTML permits only
 * `<div>` (plus script-supporting elements) as dt/dd group wrappers in a
 * dl, so every field group of every rendered contract object was a
 * definition-list violation and every dt/dd an orphaned dlitem.
 *
 * The three proofs, all against the static render (the house convention:
 * bun:test + renderToStaticMarkup — the workspace carries NO DOM library,
 * so this suite proves the DOM contract by WALKING the well-formed markup
 * React emits; the selector semantics `dl > span.field` / `dl > div.field`
 * below are the literal direct-child queries):
 *
 *  T1 — SemanticObjectsAudit (the audit card path): every element with
 *    class "field" that is a direct child of a `dl` is a DIV — zero
 *    `dl > span.field`, non-zero `dl > div.field`;
 *  T2 — ContractObjectFields (the registry renderer path): the same
 *    zero-span contract on the top-level dl[data-contract-object], every
 *    registry field wrapped in a div.field, and the dt/dd pair DIRECT
 *    children of that div (the group's only permitted content);
 *  T3 — nested objects (NestedObject, the recursion): a payload with a
 *    nested object value renders dl[data-field-kind="object"] (here two
 *    levels deep — a nested dl inside a nested dl) — zero span wrappers
 *    inside ALL dl elements in the container.
 *
 * Element change is layout-neutral: `.field` is a class-based flex rule
 * (apps/web/src/styles/app.css) and every other surface already wraps its
 * dt/dd groups in `<div className="field">` — contract-objects.tsx was the
 * one span outlier.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CONTRACT_PRESENTED_FIELDS,
  ContractObjectFields,
  SemanticObjectsAudit,
} from "./contract-objects";

/* ------------------------------------------------------------------ */
/* A minimal DOM over the static markup (the querySelectorAll proofs)   */
/* ------------------------------------------------------------------ */

/** One element of the walked markup: tag, raw attribute text, children. */
interface MarkupElement {
  readonly tag: string;
  readonly attributes: string;
  readonly children: readonly MarkupElement[];
}

/**
 * The void elements of HTML (self-closing in React's static markup —
 * `<br/>`, `<img .../>`; listed anyway so a bare void never opens a stack
 * frame it never closes).
 */
const VOID_TAGS: ReadonlySet<string> = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Walk well-formed static markup into a tree. Only tags are tokens:
 * renderToStaticMarkup never emits comments (those separators belong to
 * renderToString) and its text nodes can never contain `<` (React escapes
 * it), so an open tag / closing tag / self-closing tag scan is a complete
 * parse. Unbalanced markup throws — the walkers below never guess.
 */
function parseMarkup(html: string): readonly MarkupElement[] {
  const roots: MarkupElement[] = [];
  const stack: { tag: string; attributes: string; children: MarkupElement[] }[] = [];
  const tags = /<(\/?)([a-z][a-z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  for (const match of html.matchAll(tags)) {
    const closing = match[1] ?? "";
    const tag = match[2] ?? "";
    const attributes = match[3] ?? "";
    const selfClosing = match[4] ?? "";
    if (closing !== "") {
      const open = stack.pop();
      if (open === undefined || open.tag !== tag) {
        throw new Error(`unbalanced markup: </${tag}> closes nothing`);
      }
      continue;
    }
    if (selfClosing === "/" || VOID_TAGS.has(tag)) {
      const leaf: MarkupElement = { tag, attributes, children: [] };
      const parent = stack[stack.length - 1];
      if (parent === undefined) {
        roots.push(leaf);
      } else {
        parent.children.push(leaf);
      }
      continue;
    }
    const entry = { tag, attributes, children: [] as MarkupElement[] };
    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      roots.push(entry);
    } else {
      parent.children.push(entry);
    }
    stack.push(entry);
  }
  if (stack.length !== 0) {
    throw new Error(`unbalanced markup: <${stack[stack.length - 1]?.tag}> never closes`);
  }
  return roots;
}

/** One attribute's value (React always double-quotes), or null. */
function attributeOf(element: MarkupElement, name: string): string | null {
  const pattern = new RegExp(`(?:^|\\s)${name}="([^"]*)"`);
  return pattern.exec(element.attributes)?.[1] ?? null;
}

/** The element's class list (className.split — the has-class check). */
function classListOf(element: MarkupElement): readonly string[] {
  const value = attributeOf(element, "class");
  return value === null ? [] : value.split(/\s+/).filter((token) => token !== "");
}

/** `querySelectorAll(tag.class)` in document order, recursively. */
function queryAll(
  roots: readonly MarkupElement[],
  tag: string,
  className?: string,
): readonly MarkupElement[] {
  const found: MarkupElement[] = [];
  const walk = (elements: readonly MarkupElement[]): void => {
    for (const element of elements) {
      if (
        element.tag === tag &&
        (className === undefined || classListOf(element).includes(className))
      ) {
        found.push(element);
      }
      walk(element.children);
    }
  };
  walk(roots);
  return found;
}

/** `parent > tag.class` — the DIRECT-child combinator, the QA-007 proof. */
function directChildren(
  parent: MarkupElement,
  tag: string,
  className: string,
): readonly MarkupElement[] {
  return parent.children.filter(
    (child) => child.tag === tag && classListOf(child).includes(className),
  );
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/**
 * A small valid ClientCapabilityProfile-shaped record — every registry
 * field present, every capability domain a small nested record (so the
 * render exercises both the top-level dl AND the nested-object dls).
 */
const PROFILE_PAYLOAD = {
  contractVersion: "2.1.0",
  profileId: "profile-qa007-browser",
  adapterKind: "browser",
  capturedAt: "2026-09-29T12:00:00.000Z",
  screen: { sizeClass: "expanded", multiWindow: false },
  input: { modes: ["keyboard", "pointer"] },
  sensors: { kinds: [] },
  camera: { captureKinds: ["still"] },
  offlineStorage: { mode: "session-cache" },
  notifications: { mode: "in-app" },
  deepLinks: { mode: "universal" },
};

/**
 * The nested-object recursion fixture: `screen` carries the reference
 * profile's descriptor shape — a nested object INSIDE a nested object — so
 * NestedObject renders a dl[data-field-kind="object"] that itself contains
 * another dl[data-field-kind="object"].
 */
const NESTED_PAYLOAD = {
  ...PROFILE_PAYLOAD,
  screen: {
    descriptor: {
      domain: "screen",
      status: "supported",
      details: { layout: "responsive" },
      limitations: [],
    },
    sizeClass: "expanded",
    multiWindow: false,
  },
};

/* ------------------------------------------------------------------ */
/* T1 — the SemanticObjectsAudit path                                  */
/* ------------------------------------------------------------------ */

describe("QA-007 — dt/dd groups in dl are wrapped in div, never span (axe definition-list/dlitem serious)", () => {
  test("T1 — SemanticObjectsAudit: every .field direct child of every dl is a DIV (dl > span.field = 0, dl > div.field > 0)", () => {
    const html = renderToStaticMarkup(
      <SemanticObjectsAudit
        objects={[
          {
            label: "Browser capability profile",
            objectName: "ClientCapabilityProfile",
            payload: PROFILE_PAYLOAD,
          },
        ]}
      />,
    );
    const document = parseMarkup(html);
    const dls = queryAll(document, "dl");
    // The audit card renders the registry dl PLUS one nested dl per
    // capability-domain record in the payload.
    expect(dls.length).toBeGreaterThan(0);

    // The QA-007 defect: dl > span.field (the pre-fix wrapper) — ZERO.
    const spanFields = dls.flatMap((dl) => directChildren(dl, "span", "field"));
    expect(spanFields).toEqual([]);

    // The fix: dl > div.field exists…
    const divFields = dls.flatMap((dl) => directChildren(dl, "div", "field"));
    expect(divFields.length).toBeGreaterThan(0);

    // …and EVERY element with class "field" that is a direct child of a dl
    // is a DIV (the static-markup equivalent of tagName === "DIV").
    for (const dl of dls) {
      const fields = dl.children.filter((child) => classListOf(child).includes("field"));
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        expect(field.tag).toBe("div");
      }
    }
  });

  /* ---------------------------------------------------------------- */
  /* T2 — the ContractObjectFields path                                */
  /* ---------------------------------------------------------------- */

  test("T2 — ContractObjectFields: zero dl > span.field; every registry field is a div.field whose DIRECT children are the dt/dd pair", () => {
    const html = renderToStaticMarkup(
      <ContractObjectFields objectName="ClientCapabilityProfile" payload={PROFILE_PAYLOAD} />,
    );
    const document = parseMarkup(html);
    const dls = queryAll(document, "dl");
    expect(dls.length).toBeGreaterThan(0);

    // The same zero-span contract over every dl in the render.
    expect(dls.flatMap((dl) => directChildren(dl, "span", "field"))).toEqual([]);
    const divFields = dls.flatMap((dl) => directChildren(dl, "div", "field"));
    expect(divFields.length).toBeGreaterThan(0);

    // The registry dl itself (data-contract-object="ClientCapabilityProfile").
    const registry = dls.find(
      (dl) => attributeOf(dl, "data-contract-object") === "ClientCapabilityProfile",
    );
    expect(registry).toBeDefined();
    if (registry === undefined) {
      return;
    }

    // Every registry field renders, each wrapped in a div.field…
    const registryFields = CONTRACT_PRESENTED_FIELDS.ClientCapabilityProfile;
    expect(registry.children.length).toBe(registryFields.length);
    for (const wrapper of registry.children) {
      expect(wrapper.tag).toBe("div");
      expect(classListOf(wrapper).includes("field")).toBe(true);
      // …whose DIRECT children are exactly the dt/dd pair — the group's
      // only permitted content model inside the dl.
      expect(wrapper.children.map((child) => child.tag)).toEqual(["dt", "dd"]);
    }
  });

  /* ---------------------------------------------------------------- */
  /* T3 — the nested-object recursion                                  */
  /* ---------------------------------------------------------------- */

  test("T3 — nested objects: dl[data-field-kind=object] renders (recursively) and NO dl in the container carries a span wrapper", () => {
    const html = renderToStaticMarkup(
      <ContractObjectFields objectName="ClientCapabilityProfile" payload={NESTED_PAYLOAD} />,
    );
    const document = parseMarkup(html);
    const dls = queryAll(document, "dl");

    // NestedObject rendered: at least two levels of nested-object dl
    // (screen → its own fields, screen.descriptor.details → deeper still).
    const nested = dls.filter((dl) => attributeOf(dl, "data-field-kind") === "object");
    expect(nested.length).toBeGreaterThanOrEqual(2);

    // Zero span wrappers inside ALL dl elements in the container — and the
    // honest structure everywhere: every .field wrapper is a div whose
    // direct children are the dt/dd pair.
    for (const dl of dls) {
      expect(directChildren(dl, "span", "field")).toEqual([]);
      for (const wrapper of dl.children) {
        if (classListOf(wrapper).includes("field")) {
          expect(wrapper.tag).toBe("div");
          expect(wrapper.children.map((child) => child.tag)).toEqual(["dt", "dd"]);
        }
      }
    }
  });
});
