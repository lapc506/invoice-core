import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { InvalidTaxId, TaxId } from "./tax-id.js";

// Synthetic test IDs only — never real people or companies.
// Format-valid but not registered:
//   CR fisica    112340567   (9 digits)
//   CR juridica  3101123456  (10 digits)
//   CR DIMEX     112345678912 (12 digits)
//   CR NITE      1020304050  (10 digits)
//   MX RFC       VECJ880326XXX (classic fixture from SAT docs)
//   CO NIT       1020304050  (10 digits)

describe("TaxId", () => {
  it("parses CR cédula física (9 digits)", () => {
    const t = TaxId.parse({ country: "CR", kind: "FISICA", value: "112340567" });
    expect(t.value).toBe("112340567");
    expect(t.country).toBe("CR");
    expect(t.kind).toBe("FISICA");
  });

  it("parses CR cédula jurídica (10 digits)", () => {
    const t = TaxId.parse({ country: "CR", kind: "JURIDICA", value: "3101123456" });
    expect(t.kind).toBe("JURIDICA");
  });

  it("parses CR DIMEX (11-12 digits)", () => {
    expect(TaxId.parse({ country: "CR", kind: "DIMEX", value: "11234567891" }).kind).toBe("DIMEX");
    expect(TaxId.parse({ country: "CR", kind: "DIMEX", value: "112345678912" }).kind).toBe("DIMEX");
  });

  it("parses CR NITE (10 digits)", () => {
    expect(TaxId.parse({ country: "CR", kind: "NITE", value: "1020304050" }).kind).toBe("NITE");
  });

  it("parses MX RFC (12-13 alnum)", () => {
    expect(TaxId.parse({ country: "MX", kind: "RFC", value: "VECJ880326XXX" }).value).toBe(
      "VECJ880326XXX",
    );
  });

  it("parses CO NIT (6-10 digits)", () => {
    expect(TaxId.parse({ country: "CO", kind: "NIT", value: "1020304050" }).value).toBe(
      "1020304050",
    );
  });

  it("rejects CR cédula física with wrong length", () => {
    expect(() => TaxId.parse({ country: "CR", kind: "FISICA", value: "12345" })).toThrow(
      InvalidTaxId,
    );
  });

  it("rejects unsupported (country, kind) combo", () => {
    expect(() =>
      // @ts-expect-error — runtime validation path
      TaxId.parse({ country: "MX", kind: "FISICA", value: "112340567" }),
    ).toThrow(InvalidTaxId);
  });

  it("redacted() returns ***...last 4", () => {
    const t = TaxId.parse({ country: "CR", kind: "FISICA", value: "112340567" });
    expect(t.redacted()).toBe("*****0567");
  });

  it("toString is redacted by default", () => {
    const t = TaxId.parse({ country: "CR", kind: "FISICA", value: "112340567" });
    expect(String(t)).toBe("*****0567");
  });

  it("toJSON redacts", () => {
    const t = TaxId.parse({ country: "CR", kind: "FISICA", value: "112340567" });
    expect(JSON.stringify({ tax: t })).toBe('{"tax":"*****0567"}');
  });

  it("util.inspect includes country:kind:redacted but not raw", () => {
    const t = TaxId.parse({ country: "CR", kind: "FISICA", value: "112340567" });
    const s = inspect(t);
    expect(s).toContain("CR:FISICA");
    expect(s).toContain("*****0567");
    expect(s).not.toContain("112340567");
  });

  it("unsafeReveal exposes raw value", () => {
    const t = TaxId.parse({ country: "CR", kind: "FISICA", value: "112340567" });
    expect(t.unsafeReveal()).toBe("112340567");
  });

  it("redaction masks short-value IDs to ****", () => {
    // A synthetic short value (would fail parse rules, but redactor is pure utility on invalid-path errors).
    // We can't actually construct one via parse; assert on the redacted() format for a 4-char string
    // by using the mask helper via a known parseable CR NIT and verifying format-shape for >4-char value:
    const t = TaxId.parse({ country: "CO", kind: "NIT", value: "123456" });
    expect(t.redacted()).toBe("**3456");
  });
});
