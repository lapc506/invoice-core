import { describe, expect, it } from "vitest";
import { Decimal } from "./decimal.js";
import { InvalidMoney, Money } from "./money.js";

describe("Money", () => {
  it("creates with ISO 4217 currency", () => {
    const m = Money.of(Decimal.fromString("100.00"), "CRC");
    expect(m.currency).toBe("CRC");
    expect(m.amount.toString()).toBe("100.00");
  });
  it("rejects unknown currency", () => {
    expect(() => Money.of(Decimal.fromString("1"), "ZZZ")).toThrow(InvalidMoney);
  });
  it("refuses add across currencies", () => {
    const crc = Money.of(Decimal.fromString("1"), "CRC");
    const usd = Money.of(Decimal.fromString("1"), "USD");
    expect(() => crc.add(usd)).toThrow(/currency mismatch/);
  });
  it("refuses sub across currencies", () => {
    const crc = Money.of(Decimal.fromString("1"), "CRC");
    const usd = Money.of(Decimal.fromString("1"), "USD");
    expect(() => crc.sub(usd)).toThrow(/currency mismatch/);
  });
  it("add in same currency sums amounts", () => {
    const a = Money.of(Decimal.fromString("1.50"), "USD");
    const b = Money.of(Decimal.fromString("0.25"), "USD");
    expect(a.add(b).amount.toString()).toBe("1.75");
  });
  it("sub in same currency subtracts amounts", () => {
    const a = Money.of(Decimal.fromString("2.00"), "MXN");
    const b = Money.of(Decimal.fromString("0.50"), "MXN");
    expect(a.sub(b).amount.toString()).toBe("1.50");
  });
  it("toString contains amount and currency", () => {
    expect(Money.of(Decimal.fromString("100.00"), "COP").toString()).toBe("100.00 COP");
  });
});
