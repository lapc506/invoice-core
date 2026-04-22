import { describe, expect, it } from "vitest";
import { ISODate, InvalidISODate } from "./iso-date.js";

describe("ISODate", () => {
  it("parses a valid YYYY-MM-DD", () => {
    expect(ISODate.parse("2026-04-16")).toBe("2026-04-16");
  });
  it("rejects wrong format", () => {
    expect(() => ISODate.parse("2026/04/16")).toThrow(InvalidISODate);
  });
  it("rejects impossible calendar date", () => {
    expect(() => ISODate.parse("2026-02-30")).toThrow(InvalidISODate);
  });
  it("rejects non-string input", () => {
    expect(() => ISODate.parse(null)).toThrow(InvalidISODate);
  });
});
