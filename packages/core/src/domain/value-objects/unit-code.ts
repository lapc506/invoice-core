import { z } from "zod";

/**
 * Subset of the Hacienda v4.4 unit-of-measure catalog used in Fase 1.
 * The full catalog lands via ingester in a later phase (Fase 3 — see
 * Task 37 in the implementation plan).
 */
export const UNIT_CODES = [
  "Sp",
  "Unid",
  "kg",
  "g",
  "m",
  "cm",
  "mm",
  "l",
  "ml",
  "m2",
  "m3",
  "h",
  "d",
  "kWh",
  "Al",
  "Alc",
  "I",
  "St",
  "Os",
] as const;
export type UnitCode = (typeof UNIT_CODES)[number];

const schema = z.enum(UNIT_CODES);

export const UnitCode = {
  parse(input: unknown): UnitCode {
    return schema.parse(input);
  },
};
