import { describe, expect, it } from "vitest";
import { UnitCode } from "./unit-code.js";

describe("UnitCode", () => {
  it.each(["Sp", "Unid", "kg", "m", "kWh"] as const)("accepts subset code %s", (u) => {
    expect(UnitCode.parse(u)).toBe(u);
  });
  it("rejects unknown code", () => {
    expect(() => UnitCode.parse("parsec")).toThrow();
  });
});
