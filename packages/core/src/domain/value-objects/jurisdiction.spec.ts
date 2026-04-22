import { describe, expect, it } from "vitest";
import { Jurisdiction } from "./jurisdiction.js";

describe("Jurisdiction", () => {
  it.each(["CR", "MX", "CO", "US", "GLOBAL"] as const)("accepts %s", (j) => {
    expect(Jurisdiction.parse(j)).toBe(j);
  });
  it("rejects unknown jurisdiction", () => {
    expect(() => Jurisdiction.parse("BR")).toThrow();
  });
});
