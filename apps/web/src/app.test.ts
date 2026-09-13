import { describe, expect, test } from "bun:test";
import { pageLabel } from "./app";

describe("web workspace placeholder", () => {
  test("renders the foundation label", () => {
    expect(pageLabel()).toBe("AISE web workspace — foundation");
  });
});
