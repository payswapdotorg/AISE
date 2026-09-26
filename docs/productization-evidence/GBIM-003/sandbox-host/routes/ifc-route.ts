import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GBIM-003 — serves the spike-authored IFC4 projection of the fixture
 * (docs/productization-evidence/GBIM-003/ifc/fixture-room.ifc in the AISE
 * clone) for the web-ifc (That Open) browser lane.
 */
const IFC_PATH = join(
  process.cwd(),
  "AISE",
  "docs",
  "productization-evidence",
  "GBIM-003",
  "ifc",
  "fixture-room.ifc",
);

export async function GET(): Promise<Response> {
  try {
    const raw = readFileSync(IFC_PATH, "utf8");
    return new Response(raw, {
      headers: { "content-type": "model/ifc", "content-disposition": 'inline; filename="fixture-room.ifc"' },
    });
  } catch {
    return new Response("IFC fixture not found — see docs/productization-evidence/GBIM-003/ifc/", { status: 404 });
  }
}
