import { inspect } from "node:util";

/**
 * Tax identifier kinds for the jurisdictions supported in Fase 1:
 *
 *   CR  FISICA     cédula física, 9 digits
 *   CR  JURIDICA   cédula jurídica, 10 digits
 *   CR  DIMEX      Documento de Identidad Migratorio, 11-12 digits
 *   CR  NITE       Número de Identificación Tributario Especial, 10 digits
 *   MX  RFC        Registro Federal de Contribuyentes, 12 or 13 alnum
 *   CO  NIT        Número de Identificación Tributaria, 6-10 digits
 *   PASSPORT       generic fallback — no structured validation
 */
export type TaxIdKind = "FISICA" | "JURIDICA" | "DIMEX" | "NITE" | "RFC" | "NIT" | "PASSPORT";

export type TaxIdCountry = "CR" | "MX" | "CO";

export interface TaxIdInput {
  country: TaxIdCountry;
  kind: TaxIdKind;
  value: string;
}

const RULES: Record<string, RegExp> = {
  "CR:FISICA": /^\d{9}$/,
  "CR:JURIDICA": /^\d{10}$/,
  "CR:DIMEX": /^\d{11,12}$/,
  "CR:NITE": /^\d{10}$/,
  "MX:RFC": /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/,
  "CO:NIT": /^\d{6,10}$/,
};

/**
 * TaxId VO — redacted by default. Stringification / JSON / util.inspect
 * all emit only the last four characters. The raw value must be obtained
 * via the explicit unsafeReveal() method; that name is the grep anchor
 * for security audits (every call must be an intentional adapter
 * boundary writing to Hacienda / a signed XML / etc.).
 */
export class TaxId {
  private constructor(
    public readonly country: TaxIdCountry,
    public readonly kind: TaxIdKind,
    private readonly _value: string,
  ) {}

  static parse(input: TaxIdInput): TaxId {
    const key = `${input.country}:${input.kind}`;
    const rule = RULES[key];
    if (!rule) throw new InvalidTaxId(`unsupported ${key}`);
    if (!rule.test(input.value)) {
      throw new InvalidTaxId(`format ${key}: ${mask(input.value)}`);
    }
    return new TaxId(input.country, input.kind, input.value);
  }

  get value(): string {
    return this._value;
  }

  redacted(): string {
    return mask(this._value);
  }

  unsafeReveal(): string {
    return this._value;
  }

  toString(): string {
    return this.redacted();
  }

  toJSON(): string {
    return this.redacted();
  }

  [inspect.custom](): string {
    return `TaxId(${this.country}:${this.kind}:${this.redacted()})`;
  }
}

function mask(v: string): string {
  if (v.length <= 4) return "****";
  return `${"*".repeat(v.length - 4)}${v.slice(-4)}`;
}

export class InvalidTaxId extends Error {
  constructor(msg: string) {
    super(`Invalid TaxId: ${msg}`);
    this.name = "InvalidTaxId";
  }
}
