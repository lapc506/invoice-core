import { z } from "zod";

const schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type ISODate = string & { readonly __brand: "ISODate" };

export const ISODate = {
  parse(input: unknown): ISODate {
    const r = schema.safeParse(input);
    if (!r.success) throw new InvalidISODate(r.error?.message ?? "format");
    // Verify it is a real calendar date — parse + round-trip the YYYY-MM-DD.
    const [y, m, d] = r.data.split("-").map(Number) as [number, number, number];
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (
      Number.isNaN(probe.getTime()) ||
      probe.getUTCFullYear() !== y ||
      probe.getUTCMonth() !== m - 1 ||
      probe.getUTCDate() !== d
    ) {
      throw new InvalidISODate(`not a real date: ${r.data}`);
    }
    return r.data as ISODate;
  },
};

export class InvalidISODate extends Error {
  constructor(msg: string) {
    super(`Invalid ISO date: ${msg}`);
    this.name = "InvalidISODate";
  }
}
