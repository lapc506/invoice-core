import { z } from "zod";

const schema = z.string().datetime({ offset: true });

export type ISODateTime = string & { readonly __brand: "ISODateTime" };

export const ISODateTime = {
  parse(input: unknown): ISODateTime {
    const r = schema.safeParse(input);
    if (!r.success) throw new InvalidISODateTime(r.error.message);
    return r.data as ISODateTime;
  },
  now(clock: () => Date = () => new Date()): ISODateTime {
    return clock().toISOString() as ISODateTime;
  },
};

export class InvalidISODateTime extends Error {
  constructor(msg: string) {
    super(`Invalid ISO datetime: ${msg}`);
    this.name = "InvalidISODateTime";
  }
}
