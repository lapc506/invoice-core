import { describe, expect, it } from "vitest";
import { CountryCode } from "./country-code.js";

describe("CountryCode", () => {
  it.each(["CR", "MX", "CO", "US", "DE", "JP"])("accepts ISO 3166-1 alpha-2 %s", (c) => {
    expect(CountryCode.parse(c)).toBe(c);
  });
  it("rejects lowercase", () => {
    expect(() => CountryCode.parse("cr")).toThrow();
  });
  it("rejects wrong length", () => {
    expect(() => CountryCode.parse("CRI")).toThrow();
    expect(() => CountryCode.parse("C")).toThrow();
  });
  it("rejects non-letters", () => {
    expect(() => CountryCode.parse("C1")).toThrow();
  });
});
