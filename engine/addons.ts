import { guidelines } from './guidelines/2025-07-01';
import { Decimal, ZERO, dec, max } from './money';
import { other, type ExpenseInput, type ParentId } from './types';

export interface ExpenseShare {
  kind: 'childCare' | 'healthInsurance';
  paidBy: ParentId;
  monthly: Decimal;
  /** Each parent's pro rata share of the expense. */
  share: Record<ParentId, Decimal>;
  inSupport: boolean;
  /** The non-paying parent owes this to the paying parent. */
  owedBy: ParentId;
  owed: Decimal;
  /** Contribution to support when inSupport (positive: A pays B); zero when paid directly. */
  signed: Decimal;
}

/**
 * I.R.F.L.P. 120(g)(1) child care and 120(g)(4)(A) health insurance premiums:
 * shared in proportion to Guidelines Income. Paid directly between the parents
 * by default; optionally computed inside support as a credit or addition
 * (Form 6 lines 6a-6b, "+/-").
 */
export function expenseShare(
  kind: ExpenseShare['kind'],
  e: ExpenseInput,
  shares: Record<ParentId, Decimal>,
): ExpenseShare {
  const monthly = dec(e.monthly);
  const share = { A: monthly.times(shares.A), B: monthly.times(shares.B) };
  const owedBy = other(e.paidBy);
  const owed = share[owedBy];
  const inSupport = e.inSupport === true;
  const signed = !inSupport || owed.isZero() ? ZERO : owedBy === 'A' ? owed : owed.negated();
  return { kind, paidBy: e.paidBy, monthly, share, inSupport, owedBy, owed, signed };
}

export interface ExtendedVisit {
  days: number;
  /** Support while the visit lasts (50% abatement). */
  abatedMonthlyRate: Decimal;
  /** Total reduction over the year for those days. */
  annualReduction: Decimal;
}

/**
 * I.R.F.L.P. 120(i)(5): in primary custody, support may be reduced while the
 * paying parent has the children for 14 or more consecutive days; 50% for the
 * duration is a reasonable reduction. Returned as information; the monthly
 * order amount is not changed. Null when not applicable.
 */
export function extendedVisit(baseSupport: Decimal, days: number | undefined, isPrimary: boolean): ExtendedVisit | null {
  if (!isPrimary || days === undefined || days < guidelines.extendedVisit.minConsecutiveDays) return null;
  const reduction = new Decimal(guidelines.extendedVisit.reduction);
  return {
    days,
    abatedMonthlyRate: baseSupport.times(new Decimal(1).minus(reduction)),
    annualReduction: baseSupport.times(12).div(guidelines.daysPerYear).times(days).times(reduction),
  };
}

/**
 * I.R.F.L.P. 120(g)(5): dependency benefits paid to the recipient because of
 * the payer's disability or retirement reduce support, but never below zero.
 */
export function applyDependencyBenefit(payerAmount: Decimal, benefitMonthly: Decimal) {
  const after = max(payerAmount.minus(benefitMonthly), ZERO);
  return { credit: payerAmount.minus(after), after };
}
