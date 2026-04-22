import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { PIIString } from "./pii-string.js";

describe("PIIString", () => {
  it("toString redacts", () => {
    expect(String(PIIString.from("Luis Andres"))).toBe("[REDACTED]");
  });
  it("toJSON redacts", () => {
    expect(JSON.stringify({ name: PIIString.from("Luis") })).toBe('{"name":"[REDACTED]"}');
  });
  it("util.inspect redacts", () => {
    expect(inspect(PIIString.from("secret"))).toContain("[REDACTED]");
  });
  it("unsafeReveal returns original", () => {
    expect(PIIString.from("raw").unsafeReveal()).toBe("raw");
  });
  it("template literal interpolation redacts", () => {
    expect(`name=${PIIString.from("Luis")}`).toBe("name=[REDACTED]");
  });
  it("nested in JSON array redacts", () => {
    expect(JSON.stringify([PIIString.from("a"), PIIString.from("b")])).toBe(
      '["[REDACTED]","[REDACTED]"]',
    );
  });
});
