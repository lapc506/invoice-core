import { describe, expect, it } from "vitest";
import { ISODateTime, InvalidISODateTime } from "./iso-datetime.js";

describe("ISODateTime", () => {
  it("parses RFC3339 with offset", () => {
    expect(ISODateTime.parse("2026-04-16T12:00:00-06:00")).toBe("2026-04-16T12:00:00-06:00");
  });
  it("parses RFC3339 with Z suffix", () => {
    expect(ISODateTime.parse("2026-04-16T00:00:00.000Z")).toBe("2026-04-16T00:00:00.000Z");
  });
  it("rejects naive datetime", () => {
    expect(() => ISODateTime.parse("2026-04-16 12:00:00")).toThrow(InvalidISODateTime);
  });
  it("rejects non-string input", () => {
    expect(() => ISODateTime.parse(42)).toThrow(InvalidISODateTime);
  });
  it("clock-injected now() produces deterministic output", () => {
    const clock = () => new Date("2026-04-16T00:00:00.000Z");
    expect(ISODateTime.now(clock)).toBe("2026-04-16T00:00:00.000Z");
  });
  it("default now() returns a parseable ISO string", () => {
    const output = ISODateTime.now();
    // Round-trip through the parser to prove the default clock emits valid RFC3339.
    expect(ISODateTime.parse(output)).toBe(output);
  });
});
