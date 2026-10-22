import type { Decimal, EngineOptions } from '../../engine';

type Dec = { toFixed(n: number): string; isNegative(): boolean; isZero(): boolean; abs(): Dec };

const withCommas = (fixed: string) => {
  const [int, frac] = fixed.split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === undefined ? grouped : `${grouped}.${frac}`;
};

/** "$1,234.56", or whole dollars under the rule-example convention. */
export function usd(d: Dec | Decimal, rounding: EngineOptions['rounding'] = 'exact', opts: { sign?: boolean } = {}): string {
  const places = rounding === 'rule-example' ? 0 : 2;
  const neg = d.isNegative() && !d.isZero();
  const body = `$${withCommas(d.abs().toFixed(places))}`;
  if (opts.sign) return d.isZero() ? body : `${neg ? '−' : '+'}${body}`;
  return neg ? `−${body}` : body;
}

/** Plain number with commas, for PDF blanks ("1,234.56" or "1,235"). */
export function plain(d: Dec | Decimal, places: number): string {
  const neg = d.isNegative() && !d.isZero();
  return `${neg ? '-' : ''}${withCommas(d.abs().toFixed(places))}`;
}

export const pct = (share: Dec | Decimal) =>
  `${(share as Decimal).times(100).toFixed(2)}%`;

export function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}/${y}`;
}

export function ageOn(birthDate: string, on: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = on.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Engine messages say "Parent A" or "(A)"; swap in the parents' names for display. */
export function personalize(message: string, names: { A: string; B: string }): string {
  return message
    .replace(/\b[Pp]arent ([AB])\b/g, (_, p: 'A' | 'B') => names[p])
    .replace(/\(([AB])\)/g, (_, p: 'A' | 'B') => `(${names[p]})`);
}
