import { describe, expect, it } from "vitest";
import { InvalidUuid, UUID } from "./uuid.js";

describe("UUID", () => {
  it("parses a valid v4 UUID", () => {
    const v = UUID.parse("550e8400-e29b-41d4-a716-446655440000");
    expect(v).toBe("550e8400-e29b-41d4-a716-446655440000");
  });
  it("rejects a non-UUID", () => {
    expect(() => UUID.parse("not-a-uuid")).toThrow(InvalidUuid);
  });
  it("exposes isUuid type guard", () => {
    expect(UUID.isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(UUID.isUuid("no")).toBe(false);
  });
});
