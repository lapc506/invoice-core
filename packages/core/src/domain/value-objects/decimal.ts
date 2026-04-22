/**
 * Fixed-scale decimal backed by bigint — float-safe arithmetic for money /
 * totals / tax breakdowns. Never loses precision on +, -, * or equals.
 * Scale is capped at 12 to keep bigint arithmetic bounded.
 */
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

export class Decimal {
  private constructor(
    public readonly value: bigint,
    public readonly scale: number,
  ) {}

  static of(value: bigint, scale: number): Decimal {
    if (!Number.isInteger(scale) || scale < 0 || scale > 12) {
      throw new RangeError("scale must be an integer in [0,12]");
    }
    return new Decimal(value, scale);
  }

  static fromString(s: string): Decimal {
    const match = DECIMAL_PATTERN.exec(s);
    if (!match) throw new InvalidDecimal(s);
    const sign = match[1] === "-" ? -1n : 1n;
    const whole = BigInt(match[2] ?? "0");
    const frac = match[3] ?? "";
    const scale = frac.length;
    const value = sign * (whole * 10n ** BigInt(scale) + (frac === "" ? 0n : BigInt(frac)));
    return new Decimal(value, scale);
  }

  add(other: Decimal): Decimal {
    const [a, b, s] = align(this, other);
    return new Decimal(a + b, s);
  }

  sub(other: Decimal): Decimal {
    const [a, b, s] = align(this, other);
    return new Decimal(a - b, s);
  }

  mul(other: Decimal): Decimal {
    return new Decimal(this.value * other.value, this.scale + other.scale);
  }

  equals(other: Decimal): boolean {
    const [a, b] = align(this, other);
    return a === b;
  }

  toString(): string {
    const abs = this.value < 0n ? -this.value : this.value;
    const sign = this.value < 0n ? "-" : "";
    const s = abs.toString();
    if (this.scale === 0) return `${sign}${s}`;
    const pad = s.padStart(this.scale + 1, "0");
    return `${sign}${pad.slice(0, -this.scale)}.${pad.slice(-this.scale)}`;
  }
}

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const s = Math.max(a.scale, b.scale);
  return [a.value * 10n ** BigInt(s - a.scale), b.value * 10n ** BigInt(s - b.scale), s];
}

export class InvalidDecimal extends Error {
  constructor(v: string) {
    super(`Invalid decimal: ${v}`);
    this.name = "InvalidDecimal";
  }
}
