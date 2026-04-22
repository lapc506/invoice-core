import { z } from "zod";

const schema = z.string().uuid();

export type UUID = string & { readonly __brand: "UUID" };

export const UUID = {
  parse(input: unknown): UUID {
    const r = schema.safeParse(input);
    if (!r.success) throw new InvalidUuid(r.error.message);
    return r.data as UUID;
  },
  isUuid(input: unknown): input is UUID {
    return schema.safeParse(input).success;
  },
};

export class InvalidUuid extends Error {
  constructor(msg: string) {
    super(`Invalid UUID: ${msg}`);
    this.name = "InvalidUuid";
  }
}
