/**
 * AISE-037 permissions tests: the frozen scope vocabulary, the granted-
 * subset model (request N, get ≤N, deny-by-default, escalation refused) and
 * the class↔scope↔capability pairing the sync engine relies on.
 */

import { describe, expect, test } from "bun:test";
import { CLASS_CAPABILITIES, SYSTEM_CLASSES } from "./model";
import {
  CLASS_IMPORT_SCOPE,
  CLASS_SCOPES,
  PERMISSION_SCOPES,
  capabilityForScope,
  checkScope,
  createGrantedScopes,
  grantedScopesHas,
  requiredScopeForDirection,
  scopeForCapability,
} from "./permissions";
import { fullGrant, grantOf } from "./testkit";

describe("permissions: frozen vocabulary", () => {
  test("PERMISSION_SCOPES is frozen, unique and exactly the four least-privilege scopes", () => {
    expect(Object.isFrozen(PERMISSION_SCOPES)).toBe(true);
    expect([...PERMISSION_SCOPES]).toEqual([
      "read:entities",
      "read:documents",
      "write:derived-export",
      "query:status",
    ]);
    expect(new Set(PERMISSION_SCOPES).size).toBe(4);
  });

  test("CLASS_SCOPES: every class stays inside the vocabulary and can always write exports + query status", () => {
    for (const systemClass of SYSTEM_CLASSES) {
      for (const scope of CLASS_SCOPES[systemClass]) {
        expect((PERMISSION_SCOPES as readonly string[]).includes(scope)).toBe(true);
      }
      expect(CLASS_SCOPES[systemClass]).toContain("write:derived-export");
      expect(CLASS_SCOPES[systemClass]).toContain("query:status");
    }
  });

  test("CLASS_SCOPES: entity classes never get read:documents; document classes never get read:entities; project-management gets both", () => {
    for (const systemClass of ["bim-ifc", "cad-dxf", "erp-procurement"] as const) {
      expect(CLASS_SCOPES[systemClass]).not.toContain("read:documents");
      expect(CLASS_SCOPES[systemClass]).toContain("read:entities");
    }
    for (const systemClass of ["boq-document", "storage-document"] as const) {
      expect(CLASS_SCOPES[systemClass]).not.toContain("read:entities");
      expect(CLASS_SCOPES[systemClass]).toContain("read:documents");
    }
    expect(CLASS_SCOPES["project-management"]).toContain("read:entities");
    expect(CLASS_SCOPES["project-management"]).toContain("read:documents");
  });

  test("CLASS_IMPORT_SCOPE pairs 1:1 with the class's declared import capability", () => {
    for (const systemClass of SYSTEM_CLASSES) {
      const importScope = CLASS_IMPORT_SCOPE[systemClass];
      expect(CLASS_SCOPES[systemClass]).toContain(importScope);
      const expectedCapability =
        importScope === "read:entities" ? "import-entities" : "import-documents";
      expect(CLASS_CAPABILITIES[systemClass]).toContain(expectedCapability);
    }
  });
});

describe("permissions: capability ↔ scope pairing", () => {
  test("scopeForCapability and capabilityForScope are inverse over the full vocabulary", () => {
    for (const scope of PERMISSION_SCOPES) {
      expect(scopeForCapability(capabilityForScope(scope))).toBe(scope);
    }
    for (const capability of ["import-entities", "import-documents", "export-derived", "query-status"] as const) {
      expect(capabilityForScope(scopeForCapability(capability))).toBe(capability);
    }
  });

  test("requiredScopeForDirection: import uses the class import scope, export always requires write:derived-export", () => {
    for (const systemClass of SYSTEM_CLASSES) {
      expect(requiredScopeForDirection(systemClass, "import")).toBe(
        CLASS_IMPORT_SCOPE[systemClass],
      );
      expect(requiredScopeForDirection(systemClass, "export")).toBe("write:derived-export");
    }
  });
});

describe("permissions: the granted-subset model", () => {
  test("request N, receive fewer: only the received scopes are granted (sorted, deduped)", () => {
    const result = createGrantedScopes(
      "project-management",
      ["read:entities", "read:documents", "write:derived-export", "query:status"],
      ["read:documents", "read:entities", "read:entities"],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.granted.systemClass).toBe("project-management");
      expect(result.granted.scopes).toEqual(["read:documents", "read:entities"]);
      expect(grantedScopesHas(result.granted, "read:entities")).toBe(true);
      expect(grantedScopesHas(result.granted, "write:derived-export")).toBe(false);
    }
  });

  test("request N, receive N: the full grant is usable", () => {
    const granted = fullGrant("boq-document");
    expect(granted.scopes).toEqual(["query:status", "read:documents", "write:derived-export"]);
    expect(grantedScopesHas(granted, "read:documents")).toBe(true);
    expect(grantedScopesHas(granted, "write:derived-export")).toBe(true);
  });

  test("empty grant is valid and denies everything (deny-by-default baseline)", () => {
    const result = createGrantedScopes("boq-document", ["read:documents"], []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.granted.scopes).toEqual([]);
      expect(grantedScopesHas(result.granted, "read:documents")).toBe(false);
    }
  });

  test("unknown system class is a typed refusal", () => {
    const result = createGrantedScopes("mainframe", ["read:entities"], []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_scope_grant");
      expect(result.issues.join(" ")).toContain("unknown system class 'mainframe'");
    }
  });

  test("unknown scope in the request is a typed issue naming it", () => {
    const result = createGrantedScopes("boq-document", ["read:everything"], []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(" ")).toContain("'read:everything'");
    }
  });

  test("out-of-class scope is a typed issue (least privilege starts at the vocabulary)", () => {
    const result = createGrantedScopes("boq-document", ["read:entities"], ["read:entities"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(" ")).toContain(
        "requested scope 'read:entities' is not applicable to system class 'boq-document'",
      );
    }
  });

  test("receiving a scope that was NOT requested (escalation) refuses the whole grant", () => {
    const result = createGrantedScopes(
      "boq-document",
      ["read:documents"],
      ["read:documents", "write:derived-export"],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(" ")).toContain(
        "received scope 'write:derived-export' was not requested",
      );
    }
  });

  test("received-but-unknown scope is a typed issue", () => {
    const result = createGrantedScopes("bim-ifc", ["read:entities"], ["read:minds"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(" ")).toContain("'read:minds'");
    }
  });
});

describe("permissions: scope checks (deny-by-default)", () => {
  test("a granted scope passes", () => {
    const granted = fullGrant("boq-document");
    const check = checkScope(granted, "read:documents");
    expect(check.ok).toBe(true);
  });

  test("an ungranted scope is refused with the typed SCOPE_DENIED shape", () => {
    const granted = grantOf("boq-document", ["query:status"]);
    const check = checkScope(granted, "read:documents");
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.code).toBe("SCOPE_DENIED");
      expect(check.requiredScope).toBe("read:documents");
      expect(check.grantedScopes).toEqual(["query:status"]);
      expect(check.detail).toContain("read:documents");
      expect(check.detail).toContain("deny-by-default");
    }
  });

  test("an empty grant denies every scope", () => {
    const granted = grantOf("boq-document", []);
    for (const scope of PERMISSION_SCOPES) {
      expect(checkScope(granted, scope).ok).toBe(false);
    }
  });
});
