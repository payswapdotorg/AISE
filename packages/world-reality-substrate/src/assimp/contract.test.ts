/**
 * WORLD-P0-A tests — the Assimp ingest port against the in-memory
 * double: REAL minimal OBJ parsing, the provider-ID quarantine law,
 * honest unsupported-family refusals and declared lossiness.
 */

import { describe, expect, test } from "bun:test";
import { InMemoryAssimpIngestDouble } from "./double";
import type { AssimpIngestSource } from "./contract";

const enc = new TextEncoder();

function objSource(text: string, sourceId = "src-1"): AssimpIngestSource {
  return { sourceId, declaredFamily: "obj", bytes: enc.encode(text), unitScaleToMetre: 1 };
}

describe("REAL minimal OBJ ingest", () => {
  test("a two-object OBJ extracts two meshes with quarantined labels", () => {
    const ing = new InMemoryAssimpIngestDouble();
    const res = ing.ingest(
      objSource(
        [
          "# fixture",
          "o WallNorth",
          "v 0 0 0",
          "v 1 0 0",
          "v 1 1 0",
          "f 1 2 3",
          "o WallSouth",
          "v 0 0 5",
          "v 1 0 5",
          "f 1 2 3",
        ].join("\n"),
      ),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.meshes).toHaveLength(2);
    expect(res.value.meshes[0]?.quarantinedLabel).toBe("ext:obj:WallNorth");
    expect(res.value.meshes[0]?.vertexCount).toBe(3);
    expect(res.value.meshes[0]?.faceCount).toBe(1);
    expect(res.value.meshes[1]?.quarantinedLabel).toBe("ext:obj:WallSouth");
    expect(res.value.meshes[1]?.vertexCount).toBe(2);
  });

  test("usemtl references become quarantined material labels", () => {
    const ing = new InMemoryAssimpIngestDouble();
    const res = ing.ingest(
      objSource(["o A", "v 0 0 0", "v 1 0 0", "v 0 1 0", "f 1 2 3", "usemtl Concrete-C25"].join("\n")),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.meshes[0]?.materialLabels).toContain("ext:obj:Concrete-C25");
    const mtl = res.value.sceneLabels.find((l) => l.kind === "material");
    expect(mtl?.quarantinedLabel).toBe("ext:obj:Concrete-C25");
    expect(mtl?.sourceName).toBe("Concrete-C25");
  });

  test("mtllib is declared missing, never approximated (honest lossiness)", () => {
    const ing = new InMemoryAssimpIngestDouble();
    const res = ing.ingest(objSource(["mtllib site.mtl", "o A", "v 0 0 0", "f 1 1 1"].join("\n")));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const gap = res.value.formatLimitations.find((l) => l.includes("material-library"));
    expect(gap).toBeDefined();
    // no material was fabricated from the absent library
    expect(res.value.materials).toHaveLength(0);
  });

  test("empty/garbage OBJ content is refused asset_malformed", () => {
    const ing = new InMemoryAssimpIngestDouble();
    const res = ing.ingest(objSource("# just a comment\n"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.code).toBe("asset_malformed");
  });

  test("non-UTF8 bytes are refused asset_unreadable", () => {
    const ing = new InMemoryAssimpIngestDouble();
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x41]);
    const res = ing.ingest({ sourceId: "s", declaredFamily: "obj", bytes, unitScaleToMetre: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.code).toBe("asset_unreadable");
  });
});

describe("the quarantine law (provider identity never becomes canonical)", () => {
  test("every extracted label carries the ext:obj: namespace — structural proof", () => {
    const ing = new InMemoryAssimpIngestDouble();
    const res = ing.ingest(
      objSource(["o FloorSlab", "v 0 0 0", "v 1 0 0", "v 1 1 0", "f 1 2 3", "usemtl Steel-S355"].join("\n")),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    for (const mesh of res.value.meshes) {
      expect(mesh.quarantinedLabel.startsWith("ext:obj:")).toBe(true);
    }
    for (const label of res.value.sceneLabels) {
      expect(label.quarantinedLabel.startsWith("ext:obj:")).toBe(true);
      expect(label.quarantinedLabel).toBe(`ext:obj:${label.sourceName}`);
    }
    // and NO mesh/material label may leak as a bare provider name
    for (const mesh of res.value.meshes) {
      expect(mesh.quarantinedLabel).not.toMatch(/^[A-Za-z0-9_-]+$/); // never un-namespaced
    }
  });

  test("provider names with hostile characters are sanitized inside the namespace", () => {
    const ing = new InMemoryAssimpIngestDouble();
    const res = ing.ingest(
      objSource(["o ../evil/path", "v 0 0 0", "v 1 0 0", "v 0 1 0", "f 1 2 3"].join("\n")),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const label = res.value.meshes[0]?.quarantinedLabel ?? "";
    expect(label.startsWith("ext:obj:")).toBe(true);
    expect(label).not.toContain("/");
  });
});

describe("honest capability refusals (substitution law 3)", () => {
  test("unsupported families are refused with unsupported_format + the reason", () => {
    const ing = new InMemoryAssimpIngestDouble();
    for (const family of ["fbx", "collada", "stl", "ply", "gltf2-assimp"] as const) {
      const res = ing.ingest({
        sourceId: "s",
        declaredFamily: family,
        bytes: enc.encode("anything"),
        unitScaleToMetre: 1,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.failure.code).toBe("unsupported_format");
        expect(res.failure.detail.length).toBeGreaterThan(0);
      }
    }
  });

  test("glTF is explicitly owned by the glTF port, not Assimp", () => {
    const ing = new InMemoryAssimpIngestDouble();
    const res = ing.ingest({
      sourceId: "s",
      declaredFamily: "gltf2-assimp",
      bytes: enc.encode("{}"),
      unitScaleToMetre: 1,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.detail).toContain("gltf.runtime-asset/1");
  });

  test("an invalid unit scale is refused (units are declared, never guessed)", () => {
    const ing = new InMemoryAssimpIngestDouble();
    const res = ing.ingest({
      sourceId: "s",
      declaredFamily: "obj",
      bytes: enc.encode("o A\nv 0 0 0\nf 1 1 1"),
      unitScaleToMetre: 0,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.code).toBe("request_invalid");
  });
});
