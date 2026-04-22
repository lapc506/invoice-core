import type { Decimal } from "./decimal.js";

/**
 * ISO 4217 currencies supported in Fase 1. Extended per phase in the roadmap.
 * CRC = Costa Rican colón, MXN = Mexican peso, COP = Colombian peso.
 */
const ALLOWED = new Set(["CRC", "USD", "EUR", "MXN", "COP"]);

export class Money {
  private constructor(
    public readonly amount: Decimal,
    public readonly currency: string,
  ) {}

  static of(amount: Decimal, currency: string): Money {
    if (!ALLOWED.has(currency)) throw new InvalidMoney(`currency ${currency}`);
    return new Money(amount, currency);
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new InvalidMoney(`currency mismatch: ${this.currency} vs ${other.currency}`);
    }
    return new Money(this.amount.add(other.amount), this.currency);
  }

  sub(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new InvalidMoney(`currency mismatch: ${this.currency} vs ${other.currency}`);
    }
    return new Money(this.amount.sub(other.amount), this.currency);
  }

  toString(): string {
    return `${this.amount.toString()} ${this.currency}`;
  }
}

export class InvalidMoney extends Error {
  constructor(msg: string) {
    super(`Invalid money: ${msg}`);
    this.name = "InvalidMoney";
  }
}
