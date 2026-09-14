/**
 * Tiny namespace-tolerant XML reader for XLSX parsing (AISE-011).
 *
 * NO XML library — a single-pass tokenizer producing a lightweight element
 * tree, exactly enough for SpreadsheetML:
 *  - XML declaration `<?xml …?>`, comments `<!--…-->`, `<!DOCTYPE …>` and
 *    CDATA sections are handled; only CDATA contributes text;
 *  - attributes with single or double quotes; `xml:space` and any other
 *    attribute is captured under its RAW name (namespace prefixes are NOT
 *    resolved — `localName()` strips them at query time);
 *  - character entities `&amp; &lt; &gt; &quot; &apos;` plus numeric
 *    `&#NNN;` / `&#xHH;` are decoded in text and attribute values; unknown
 *    entities are preserved verbatim (tolerant, never a silent drop);
 *  - malformed input raises a typed `BoqParseError` whose `part` is
 *    `xml:<partName>` — the failing part is always named.
 */

import { BoqParseError } from "./model";

/** One parsed element. `text` is the concatenated decoded character data. */
export interface XmlNode {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
  readonly text: string;
}

/** Strip an optional namespace prefix: "r:id" -> "id", "t" -> "t". */
export function localName(name: string): string {
  const colon = name.indexOf(":");
  return colon === -1 ? name : (name.slice(colon + 1) ?? name);
}

/** Direct children of `el` whose local name matches. */
export function childElements(el: XmlNode, local: string): XmlNode[] {
  return el.children.filter((child) => localName(child.name) === local);
}

/** First descendant with matching local name, document order (DFS). */
export function findDescendant(el: XmlNode, local: string): XmlNode | null {
  for (const child of el.children) {
    if (localName(child.name) === local) {
      return child;
    }
    const found = findDescendant(child, local);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/** Attribute lookup by RAW name (prefixes kept, e.g. "r:id"). */
export function attr(el: XmlNode, rawName: string): string | undefined {
  return el.attrs[rawName];
}

/** First attribute whose LOCAL name matches (prefix-agnostic lookup). */
export function attrByLocal(el: XmlNode, local: string): string | undefined {
  for (const [key, value] of Object.entries(el.attrs)) {
    if (localName(key) === local) {
      return value;
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[A-Za-z0-9._:-]/;

function decodeEntities(input: string, part: string): string {
  if (!input.includes("&")) {
    return input;
  }
  return input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    switch (body) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default: {
        if (body.startsWith("#x") || body.startsWith("#X")) {
          const code = Number.parseInt(body.slice(2), 16);
          if (Number.isInteger(code) && code >= 0 && code <= 0x10ffff) {
            return String.fromCodePoint(code);
          }
          throw new BoqParseError(part, `invalid character reference '&${body};'`);
        }
        if (body.startsWith("#")) {
          const code = Number.parseInt(body.slice(1), 10);
          if (Number.isInteger(code) && code >= 0 && code <= 0x10ffff) {
            return String.fromCodePoint(code);
          }
          throw new BoqParseError(part, `invalid character reference '&${body};'`);
        }
        return whole; // unknown entity: preserve verbatim (tolerant)
      }
    }
  });
}

/**
 * Parse one XML document and return its ROOT element. Throws
 * `BoqParseError` with part `xml:${part}` on any structural malformation,
 * naming the unclosed/mismatched element.
 */
/** Throw the typed parse error for `part` (control-flow "never"). */
function fail(part: string, detail: string): never {
  throw new BoqParseError(`xml:${part}`, detail);
}

export function parseXml(text: string, part: string): XmlNode {
  let i = 0;
  const len = text.length;
  const stack: MutableNode[] = [];
  let root: XmlNode | null = null;

  interface MutableNode {
    name: string;
    attrs: Record<string, string>;
    children: XmlNode[];
    text: string;
  }

  const appendText = (chunk: string): void => {
    const top = stack[stack.length - 1];
    if (top !== undefined) {
      top.text += chunk;
    } else if (chunk.trim() !== "") {
      fail(part, `character data '${chunk.slice(0, 20)}' before the root element`);
    }
  };

  while (i < len) {
    const ch = text[i] ?? "";
    if (ch === "<") {
      if (text.startsWith("<?", i)) {
        const end = text.indexOf("?>", i + 2);
        if (end === -1) {
          fail(part, "unterminated processing instruction (<?xml…)");
        }
        i = end + 2;
      } else if (text.startsWith("<!--", i)) {
        const end = text.indexOf("-->", i + 4);
        if (end === -1) {
          fail(part, "unterminated comment");
        }
        i = end + 3;
      } else if (text.startsWith("<![CDATA[", i)) {
        const end = text.indexOf("]]>", i + 9);
        if (end === -1) {
          fail(part, "unterminated CDATA section");
        }
        appendText(text.slice(i + 9, end));
        i = end + 3;
      } else if (text.startsWith("<!", i)) {
        // DOCTYPE and other <!...> declarations: skip to the matching '>'.
        const end = text.indexOf(">", i + 2);
        if (end === -1) {
          fail(part, "unterminated <! declaration");
        }
        i = end + 1;
      } else if (text.startsWith("</", i)) {
        // Closing tag.
        let j = i + 2;
        while (j < len && (text[j] ?? "") !== ">") {
          j += 1;
        }
        if (j >= len) {
          fail(part, "unterminated closing tag");
        }
        const name = text.slice(i + 2, j).trim();
        const top = stack.pop();
        if (top === undefined) {
          fail(part, `closing tag </${name}> with no open element`);
        }
        if (top.name !== name) {
          fail(part, `mismatched closing tag </${name}> — expected </${top.name}>`);
        }
        const closed: XmlNode = top;
        if (stack.length === 0) {
          root = closed;
          // Anything but whitespace after the root element is malformed.
          if (text.slice(j + 1).trim() !== "") {
            fail(part, "non-whitespace content after the root element");
          }
        }
        i = j + 1;
      } else {
        // Opening tag (possibly self-closing).
        let j = i + 1;
        if (!NAME_START.test(text[j] ?? "")) {
          fail(part, `unexpected character '${text.slice(i, i + 10)}' where an element name was expected`);
        }
        while (j < len && NAME_CHAR.test(text[j] ?? "")) {
          j += 1;
        }
        const name = text.slice(i + 1, j);
        const node: MutableNode = { name, attrs: {}, children: [], text: "" };
        // Attributes.
        let selfClosing = false;
        for (;;) {
          while (j < len && /\s/.test(text[j] ?? "")) {
            j += 1;
          }
          if (j >= len) {
            fail(part, `unterminated start tag <${name}>`);
          }
          const lookahead = text[j] ?? "";
          if (lookahead === ">") {
            j += 1;
            break;
          }
          if (lookahead === "/" && text[j + 1] === ">") {
            selfClosing = true;
            j += 2;
            break;
          }
          let k = j;
          while (k < len && NAME_CHAR.test(text[k] ?? "")) {
            k += 1;
          }
          const attrName = text.slice(j, k);
          if (attrName === "") {
            fail(part, `malformed attribute in <${name}>`);
          }
          while (k < len && /\s/.test(text[k] ?? "")) {
            k += 1;
          }
          if ((text[k] ?? "") !== "=") {
            fail(part, `attribute '${attrName}' in <${name}> has no value`);
          }
          k += 1;
          while (k < len && /\s/.test(text[k] ?? "")) {
            k += 1;
          }
          const quote = text[k] ?? "";
          if (quote !== '"' && quote !== "'") {
            fail(part, `attribute '${attrName}' in <${name}> is not quoted`);
          }
          const close = text.indexOf(quote, k + 1);
          if (close === -1) {
            fail(part, `unterminated value of attribute '${attrName}' in <${name}>`);
          }
          node.attrs[attrName] = decodeEntities(text.slice(k + 1, close), part);
          j = close + 1;
        }
        if (selfClosing) {
          const closed: XmlNode = node;
          const parent = stack[stack.length - 1];
          if (parent === undefined) {
            root = closed;
            if (text.slice(j).trim() !== "") {
              fail(part, "non-whitespace content after the root element");
            }
          } else {
            parent.children.push(closed);
          }
        } else {
          const parent = stack[stack.length - 1];
          if (parent !== undefined) {
            parent.children.push(node);
          } else if (root !== null) {
            fail(part, "multiple root elements");
          }
          stack.push(node);
        }
        i = j;
      }
    } else {
      // Character data up to the next '<'.
      const next = text.indexOf("<", i);
      const chunk = next === -1 ? text.slice(i) : text.slice(i, next);
      appendText(decodeEntities(chunk, part));
      i = next === -1 ? len : next;
    }
  }
  if (stack.length > 0) {
    fail(part, `unclosed element <${stack[0]?.name ?? "?"}> (and ${stack.length - 1} more)`);
  }
  if (root === null) {
    fail(part, "no root element found");
  }
  return root;
}
