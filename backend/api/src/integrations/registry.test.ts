/**
 * AISE-037 registry tests: typed registration conflicts, unknown lookup,
 * deterministic (adapterId-ordered) listing and selection by system class +
 * capability + granted scopes.
 */

import { describe, expect, test } from "bun:test";
import { createAdapterRegistry } from "./registry";
import {
  BoqDocumentReferenceAdapter,
  ProjectManagementReferenceAdapter,
} from "./reference";
import { fullGrant, grantOf, makeIncumbentBoqSystem, makeIncumbentPmSystem, makeSnapshot, OmniFakeAdapter, snapshotReaderOf } from "./testkit";

describe("registry: registration and lookup", () => {
  test("register + lookup round-trips the adapter instance", () => {
    const registry = createAdapterRegistry();
    const adapter = new OmniFakeAdapter({ systemClass: "boq-document", adapterId: "acme-boq" });
    const registered = registry.register(adapter);
    expect(registered.ok).toBe(true);
    const lookup = registry.lookup("acme-boq");
    expect(lookup.ok).toBe(true);
    if (lookup.ok) {
      expect(lookup.adapter).toBe(adapter);
    }
  });

  test("duplicate adapter id (same or different class) is a typed conflict", () => {
    const registry = createAdapterRegistry();
    registry.register(new OmniFakeAdapter({ systemClass: "boq-document", adapterId: "acme" }));
    const sameClass = registry.register(
      new OmniFakeAdapter({ systemClass: "boq-document", adapterId: "acme" }),
    );
    expect(sameClass.ok).toBe(false);
    if (!sameClass.ok) {
      expect(sameClass.code).toBe("adapter_id_conflict");
      expect(sameClass.detail).toContain("'acme'");
    }
    const otherClass = registry.register(
      new OmniFakeAdapter({ systemClass: "project-management", adapterId: "acme" }),
    );
    expect(otherClass.ok).toBe(false);
    if (!otherClass.ok) {
      expect(otherClass.code).toBe("adapter_id_conflict");
      expect(otherClass.detail).toContain("project-management");
    }
  });

  test("an invalid descriptor is refused at registration (typed issues)", () => {
    const registry = createAdapterRegistry();
    const result = registry.register(
      new OmniFakeAdapter({
        systemClass: "boq-document",
        adapterId: "bad-adapter",
        capabilities: ["import-entities"],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_adapter_descriptor");
      expect(result.issues?.join(" ")).toContain("not applicable to system class");
    }
  });

  test("lookup of an unknown id is a typed not-found", () => {
    const registry = createAdapterRegistry();
    const lookup = registry.lookup("ghost");
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) {
      expect(lookup.code).toBe("adapter_not_found");
      expect(lookup.detail).toContain("'ghost'");
    }
  });
});

describe("registry: deterministic listing and selection", () => {
  test("listBySystemClass/listAll are ordered by adapterId — registration order never leaks", () => {
    const registry = createAdapterRegistry();
    registry.register(new OmniFakeAdapter({ systemClass: "boq-document", adapterId: "zulu" }));
    registry.register(new OmniFakeAdapter({ systemClass: "boq-document", adapterId: "alpha" }));
    registry.register(new OmniFakeAdapter({ systemClass: "boq-document", adapterId: "mid" }));
    registry.register(new OmniFakeAdapter({ systemClass: "project-management", adapterId: "pm-1" }));
    expect(
      registry.listBySystemClass("boq-document").map((adapter) => adapter.descriptor.adapterId),
    ).toEqual(["alpha", "mid", "zulu"]);
    expect(registry.listAll().map((adapter) => adapter.descriptor.adapterId)).toEqual([
      "alpha",
      "mid",
      "pm-1",
      "zulu",
    ]);
    expect(registry.listBySystemClass("erp-procurement")).toEqual([]);
  });

  test("select by system class + capability picks the first matching adapter in adapterId order", () => {
    const registry = createAdapterRegistry();
    registry.register(new OmniFakeAdapter({ systemClass: "boq-document", adapterId: "z-boq" }));
    registry.register(new OmniFakeAdapter({ systemClass: "boq-document", adapterId: "a-boq" }));
    const selected = registry.select({
      systemClass: "boq-document",
      capability: "import-documents",
    });
    expect(selected.ok).toBe(true);
    if (selected.ok) {
      expect(selected.adapter.descriptor.adapterId).toBe("a-boq");
    }
  });

  test("select with granted scopes: only usable when the capability's scope is granted", () => {
    const registry = createAdapterRegistry();
    registry.register(new OmniFakeAdapter({ systemClass: "boq-document", adapterId: "a-boq" }));
    const grantedImport = registry.select({
      systemClass: "boq-document",
      capability: "import-documents",
      grantedScopes: fullGrant("boq-document"),
    });
    expect(grantedImport.ok).toBe(true);
    const deniedImport = registry.select({
      systemClass: "boq-document",
      capability: "import-documents",
      grantedScopes: grantOf("boq-document", ["query:status"]),
    });
    expect(deniedImport.ok).toBe(false);
    if (!deniedImport.ok) {
      expect(deniedImport.code).toBe("no_matching_adapter");
      expect(deniedImport.detail).toContain("read:documents");
    }
    const deniedClass = registry.select({
      systemClass: "boq-document",
      capability: "import-documents",
      grantedScopes: fullGrant("bim-ifc"),
    });
    expect(deniedClass.ok).toBe(false);
  });

  test("select filters by declared capability and unknown classes find nothing", () => {
    const registry = createAdapterRegistry();
    registry.register(new OmniFakeAdapter({ systemClass: "boq-document", adapterId: "a-boq" }));
    const noCapability = registry.select({
      systemClass: "boq-document",
      capability: "import-entities",
    });
    expect(noCapability.ok).toBe(false);
    if (!noCapability.ok) {
      expect(noCapability.detail).toContain("import-entities");
    }
    const emptyClass = registry.select({
      systemClass: "erp-procurement",
      capability: "import-entities",
    });
    expect(emptyClass.ok).toBe(false);
  });

  test("selection is stable across repeated calls (deterministic helper)", () => {
    const registry = createAdapterRegistry();
    registry.register(new OmniFakeAdapter({ systemClass: "boq-document", adapterId: "b" }));
    registry.register(new OmniFakeAdapter({ systemClass: "boq-document", adapterId: "a" }));
    const first = registry.select({ systemClass: "boq-document", capability: "export-derived" });
    const second = registry.select({ systemClass: "boq-document", capability: "export-derived" });
    expect(
      first.ok && second.ok && first.adapter.descriptor.adapterId === second.adapter.descriptor.adapterId,
    ).toBe(true);
  });
});

describe("registry: the two reference adapters route through the same paths", () => {
  test("both reference adapters register, list under their own classes and are selectable", () => {
    const registry = createAdapterRegistry();
    const snapshot = makeSnapshot();
    const boq = new BoqDocumentReferenceAdapter({
      incumbent: makeIncumbentBoqSystem(),
      snapshotReader: snapshotReaderOf(snapshot),
    });
    const pm = new ProjectManagementReferenceAdapter({
      incumbent: makeIncumbentPmSystem(),
      snapshotReader: snapshotReaderOf(snapshot),
    });
    expect(registry.register(boq).ok).toBe(true);
    expect(registry.register(pm).ok).toBe(true);
    expect(
      registry.listBySystemClass("boq-document").map((adapter) => adapter.descriptor.adapterId),
    ).toEqual(["reference-boq-document"]);
    expect(
      registry
        .listBySystemClass("project-management")
        .map((adapter) => adapter.descriptor.adapterId),
    ).toEqual(["reference-project-management"]);
    const boqSelected = registry.select({
      systemClass: "boq-document",
      capability: "import-documents",
    });
    const pmSelected = registry.select({
      systemClass: "project-management",
      capability: "import-entities",
    });
    expect(
      boqSelected.ok && boqSelected.adapter.descriptor.adapterId === "reference-boq-document",
    ).toBe(true);
    expect(
      pmSelected.ok && pmSelected.adapter.descriptor.adapterId === "reference-project-management",
    ).toBe(true);
  });
});
