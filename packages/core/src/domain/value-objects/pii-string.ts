import { inspect } from "node:util";

/**
 * Safe-by-default wrapper for Personally Identifiable Information.
 *
 * Redacts on every accidental stringification path:
 *   - toString() and implicit String() coercion / template literals
 *   - JSON.stringify() (via toJSON)
 *   - util.inspect() / console.log (via inspect.custom)
 *
 * The only way to get the raw value back is the explicitly-named
 * unsafeReveal(). That function name is the grep anchor for security
 * audits — every call site should be documented and intentional
 * (adapter boundary writing to a signed XML, a TLS socket, etc.).
 */
const VALUE = Symbol("pii.value");

export class PIIString {
  private readonly [VALUE]: string;

  private constructor(v: string) {
    this[VALUE] = v;
  }

  static from(v: string): PIIString {
    return new PIIString(v);
  }

  unsafeReveal(): string {
    return this[VALUE];
  }

  toString(): string {
    return "[REDACTED]";
  }

  toJSON(): string {
    return "[REDACTED]";
  }

  [inspect.custom](): string {
    return "[REDACTED]";
  }
}
