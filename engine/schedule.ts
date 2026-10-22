import { guidelines, type ChildCount } from './guidelines/2025-07-01';
import { Decimal, ZERO, max, min, sum, toDollars } from './money';
import type { EngineOptions } from './types';

export interface Bracket {
  from: number;
  to: number;
  rate: Decimal;
  /** Portion of combined income falling in this bracket. */
  income: Decimal;
  annual: Decimal;
  /** Rounded to the dollar under 'rule-example'; exact otherwise. */
  monthly: Decimal;
}

export interface BasicObligation {
  combinedAnnual: Decimal;
  /** Combined income actually run through the schedule (capped at $440,000). */
  scheduleIncome: Decimal;
  /** Children requested, and the schedule column used (at most 5). */
  children: number;
  scheduleChildren: ChildCount;
  brackets: Bracket[];
  annual: Decimal;
  monthly: Decimal;
}

/**
 * I.R.F.L.P. 120(i)(1), (i)(2), (i)(7): basic child support obligation.
 * Marginal brackets applied like tax brackets to combined annual Guidelines
 * Income, capped at $440,000. Under 'rule-example' rounding each bracket's
 * monthly amount is rounded to the dollar and summed, as in the 120(i)(3)
 * example ($217 + $208 + $192 + $92 = $709). More than five children uses the
 * five-child column; the caller flags it.
 */
export function basicObligation(
  combinedAnnual: Decimal,
  children: number,
  opts: Pick<EngineOptions, 'rounding'>,
): BasicObligation {
  if (!Number.isInteger(children) || children < 1) throw new Error(`children must be a positive integer, got ${children}`);
  const scheduleChildren = Math.min(children, guidelines.maxScheduledChildren) as ChildCount;
  const rates = guidelines.rates[scheduleChildren];
  const scheduleIncome = min(max(combinedAnnual, ZERO), new Decimal(guidelines.combinedIncomeCap));

  const brackets: Bracket[] = [];
  let from = 0;
  for (const [i, width] of guidelines.bracketWidths.entries()) {
    const income = min(max(scheduleIncome.minus(from), ZERO), new Decimal(width));
    if (income.isZero()) break;
    const rate = new Decimal(rates[i]!);
    const annual = income.times(rate);
    const monthly = opts.rounding === 'rule-example' ? toDollars(annual.div(12)) : annual.div(12);
    brackets.push({ from, to: from + width, rate, income, annual, monthly });
    from += width;
  }

  const annual = sum(brackets.map((b) => b.annual));
  const monthly = opts.rounding === 'rule-example' ? sum(brackets.map((b) => b.monthly)) : annual.div(12);
  return { combinedAnnual, scheduleIncome, children, scheduleChildren, brackets, annual, monthly };
}
