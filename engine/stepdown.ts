import { calculate, emancipationDate, type CalculationResult } from './calculate';
import type { Decimal } from './money';
import { ZERO } from './money';
import type { CaseInput, ParentId } from './types';

export interface StepDownRow {
  /** First date this amount is due. */
  effectiveDate: string;
  childIds: string[];
  payer: ParentId | null;
  totalMonthly: Decimal;
  /** Full calculation for this step; null once no children remain. */
  calculation: CalculationResult | null;
}

/**
 * I.R.F.L.P. 120(j): the judgment states total support and the support due for
 * the remaining children as each child is no longer entitled. Each step is a
 * full recalculation from the schedule for the remaining number of children
 * (not a pro rata reduction), as of the step's effective date so the
 * 120(g)(3) age-17 tax exclusion reflects that year.
 */
export function stepDownSchedule(input: CaseInput): StepDownRow[] {
  const dated = input.children.map((child) => ({ child, until: emancipationDate(child) }));
  const remainingOn = (date: string) => dated.filter((d) => d.until > date).map((d) => d.child);

  const dates = [
    input.calculationDate,
    ...[...new Set(dated.map((d) => d.until))].filter((d) => d > input.calculationDate).sort(),
  ];

  return dates.map((effectiveDate) => {
    const children = remainingOn(effectiveDate);
    if (children.length === 0) {
      return { effectiveDate, childIds: [], payer: null, totalMonthly: ZERO, calculation: null };
    }
    const calculation = calculate({ ...input, calculationDate: effectiveDate, children });
    return {
      effectiveDate,
      childIds: children.map((c) => c.id),
      payer: calculation.result.payer,
      totalMonthly: calculation.result.totalMonthly,
      calculation,
    };
  });
}
