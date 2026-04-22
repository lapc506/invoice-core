import { z } from "zod";

const schema = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/);

export type CountryCode = string & { readonly __brand: "CountryCode" };

export const CountryCode = {
  parse(input: unknown): CountryCode {
    return schema.parse(input) as CountryCode;
  },
};
