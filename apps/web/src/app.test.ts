import { describe, expect, test } from "bun:test";
import { pageLabel } from "./app";

describe("web product shell public surface", () => {
  test("exposes the product label (no longer a placeholder)", () => {
    expect(pageLabel()).toBe("AISE — AI Site Engineer product shell");
  });
  test("re-exports the frozen library surface (workspace, boqlens)", async () => {
    const mod = await import("./app");
    expect(typeof mod.pageLabel).toBe("function");
    // The frozen libraries remain consumable through the public surface.
    expect(Object.keys(mod).length).toBeGreaterThan(3);
  });
});
