import { z } from "zod";

export const JURISDICTIONS = ["CR", "MX", "CO", "US", "GLOBAL"] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

const schema = z.enum(JURISDICTIONS);

export const Jurisdiction = {
  parse(input: unknown): Jurisdiction {
    return schema.parse(input);
  },
};
