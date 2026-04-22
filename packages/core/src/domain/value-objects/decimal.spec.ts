import { describe, expect, it } from "vitest";
import { Decimal, InvalidDecimal } from "./decimal.js";

describe("Decimal", () => {
  it("parses, adds, preserves scale", () => {
    const a = Decimal.fromString("1234.56");
    const b = Decimal.fromString("0.044");
    expect(a.add(b).toString()).toBe("1234.604");
  });
  it("mul adds scales", () => {
    expect(Decimal.fromString("2.50").mul(Decimal.fromString("0.13")).toString()).toBe("0.3250");
  });
  it("no float rounding on 0.1+0.2", () => {
    expect(Decimal.fromString("0.1").add(Decimal.fromString("0.2")).toString()).toBe("0.3");
  });
  it("sub aligns scales", () => {
    expect(Decimal.fromString("1.5").sub(Decimal.fromString("0.25")).toString()).toBe("1.25");
  });
  it("handles negative values", () => {
    expect(Decimal.fromString("-1.5").add(Decimal.fromString("0.5")).toString()).toBe("-1.0");
  });
  it("equals compares across scales", () => {
    expect(Decimal.fromString("1.50").equals(Decimal.fromString("1.5"))).toBe(true);
  });
  it("Decimal.of rejects out-of-range scale", () => {
    expect(() => Decimal.of(1n, -1)).toThrow(RangeError);
    expect(() => Decimal.of(1n, 13)).toThrow(RangeError);
    expect(() => Decimal.of(1n, 1.5)).toThrow(RangeError);
  });
  it("Decimal.of constructs with valid scale", () => {
    const d = Decimal.of(12345n, 2);
    expect(d.toString()).toBe("123.45");
  });
  it("fromString rejects malformed input", () => {
    expect(() => Decimal.fromString("1.2.3")).toThrow(InvalidDecimal);
    expect(() => Decimal.fromString("abc")).toThrow(InvalidDecimal);
  });
  it("integer-only input parses with scale 0", () => {
    const d = Decimal.fromString("42");
    expect(d.scale).toBe(0);
    expect(d.toString()).toBe("42");
  });
});
