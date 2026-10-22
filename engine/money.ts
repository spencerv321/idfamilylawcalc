import DecimalBase from 'decimal.js';

/**
 * Engine-private Decimal constructor. All money and ratios in the engine are
 * Decimals; floats never enter a calculation. Half-up rounding matches how the
 * rule's own tables round (e.g. $108.33 -> $108, $216.67 -> $217).
 */
export const Decimal = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

/** Dollar amounts may be given as numbers or strings ("1234.56"). */
export type MoneyInput = number | string;

export const ZERO = new Decimal(0);

export const dec = (v: MoneyInput | Decimal | undefined): Decimal =>
  v === undefined || v === '' ? ZERO : new Decimal(v);

export const toDollars = (d: Decimal): Decimal => d.toDecimalPlaces(0);
export const toCents = (d: Decimal): Decimal => d.toDecimalPlaces(2);

export const sum = (xs: Decimal[]): Decimal => xs.reduce((a, b) => a.plus(b), ZERO);
export const min = (a: Decimal, b: Decimal): Decimal => (a.lessThan(b) ? a : b);
export const max = (a: Decimal, b: Decimal): Decimal => (a.greaterThan(b) ? a : b);
