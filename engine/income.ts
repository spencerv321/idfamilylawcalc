import { basicObligation } from './schedule';
import { Decimal, ZERO, dec, sum } from './money';
import { DEFAULT_OPTIONS, type EngineOptions, type ParentInput } from './types';

export interface AnnualMonthly {
  annual: Decimal;
  monthly: Decimal;
}

const am = (annual: Decimal): AnnualMonthly => ({ annual, monthly: annual.div(12) });

export interface GuidelinesIncomeResult {
  /** 120(e)(1): gross income components (Form 5 section A, B1-B2, D, E). */
  wages: Decimal;
  overtimeOrSecondJob: Decimal;
  overtimeExcluded: boolean;
  businessNet: Decimal;
  businessDetail: {
    grossReceipts: Decimal;
    ordinaryAndNecessaryExpenses: Decimal;
    straightLineDepreciation: Decimal;
    halfSelfEmploymentTax: Decimal;
  };
  otherIncome: Decimal;
  employmentBenefits: Decimal;
  potentialIncome: Decimal;
  grossIncome: AnnualMonthly;
  /** 120(f): adjustments. */
  otherCourtOrders: Decimal;
  spousalMaintenanceThisCase: Decimal;
  supportWithoutOrder: Decimal;
  otherChildrenInHome: number;
  otherChildrenDeduction: AnnualMonthly;
  totalAdjustments: Decimal;
  /** Gross minus adjustments, floored at zero. */
  guidelinesIncome: AnnualMonthly;
  /** True if adjustments exceeded gross and Guidelines Income was floored at zero. */
  flooredAtZero: boolean;
}

/**
 * I.R.F.L.P. 120(e)(1)(A)-(C): gross income from all sources. Business income is
 * receipts minus ordinary and necessary expenses, straight-line depreciation and
 * one-half of self-employment tax. 120(e)(1)(B) overtime/second-job income is
 * excluded only on the court's finding. 120(e)(2) employment benefits and
 * 120(e)(3) potential income are included.
 *
 * I.R.F.L.P. 120(f)(1)-(4): Guidelines Income is gross income less other orders,
 * spousal maintenance in this case, a shown pattern of unordered support, and
 * the guideline support for each other child living in the home computed from
 * this parent's gross income alone (endnote 3: $1,800/month -> $312 -> $1,488).
 */
export function guidelinesIncome(
  parent: Pick<ParentInput, 'income' | 'deductions'>,
  options: Partial<Pick<EngineOptions, 'rounding' | 'otherChildrenTable'>> = {},
): GuidelinesIncomeResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const inc = parent.income;
  const biz = inc.business ?? {};

  const wages = dec(inc.wages);
  const overtimeExcluded = inc.excludeOvertimeOrSecondJob === true;
  const overtimeOrSecondJob = dec(inc.overtimeOrSecondJob);
  const businessDetail = {
    grossReceipts: dec(biz.grossReceipts),
    ordinaryAndNecessaryExpenses: dec(biz.ordinaryAndNecessaryExpenses),
    straightLineDepreciation: dec(biz.straightLineDepreciation),
    halfSelfEmploymentTax: dec(biz.selfEmploymentTax).div(2),
  };
  const businessNet = businessDetail.grossReceipts
    .minus(businessDetail.ordinaryAndNecessaryExpenses)
    .minus(businessDetail.straightLineDepreciation)
    .minus(businessDetail.halfSelfEmploymentTax);
  const otherIncome = dec(inc.otherIncome);
  const employmentBenefits = dec(inc.employmentBenefits);
  const potentialIncome = dec(inc.potentialIncome);

  const grossAnnual = sum([
    wages,
    overtimeExcluded ? ZERO : overtimeOrSecondJob,
    businessNet,
    otherIncome,
    employmentBenefits,
    potentialIncome,
  ]);

  const d = parent.deductions ?? {};
  const otherCourtOrders = dec(d.otherCourtOrders);
  const spousalMaintenanceThisCase = dec(d.spousalMaintenanceThisCase);
  const supportWithoutOrder = dec(d.supportWithoutOrder);
  const otherChildrenInHome = d.otherChildrenInHome ?? 0;
  if (!Number.isInteger(otherChildrenInHome) || otherChildrenInHome < 0) {
    throw new Error(`otherChildrenInHome must be a non-negative integer, got ${otherChildrenInHome}`);
  }

  let otherChildrenMonthly = ZERO;
  if (otherChildrenInHome > 0) {
    otherChildrenMonthly =
      opts.otherChildrenTable === 'one-child-each'
        ? basicObligation(grossAnnual, 1, opts).monthly.times(otherChildrenInHome)
        : basicObligation(grossAnnual, otherChildrenInHome, opts).monthly;
  }
  const otherChildrenDeduction = { annual: otherChildrenMonthly.times(12), monthly: otherChildrenMonthly };

  const totalAdjustments = sum([
    otherCourtOrders,
    spousalMaintenanceThisCase,
    supportWithoutOrder,
    otherChildrenDeduction.annual,
  ]);
  const raw = grossAnnual.minus(totalAdjustments);
  const flooredAtZero = raw.isNegative();

  return {
    wages,
    overtimeOrSecondJob,
    overtimeExcluded,
    businessNet,
    businessDetail,
    otherIncome,
    employmentBenefits,
    potentialIncome,
    grossIncome: am(grossAnnual),
    otherCourtOrders,
    spousalMaintenanceThisCase,
    supportWithoutOrder,
    otherChildrenInHome,
    otherChildrenDeduction,
    totalAdjustments,
    guidelinesIncome: am(flooredAtZero ? ZERO : raw),
    flooredAtZero,
  };
}

export interface IncomeShares {
  combinedAnnual: Decimal;
  A: Decimal;
  B: Decimal;
  /** True when combined income is zero and shares defaulted to 50/50. */
  zeroCombined: boolean;
}

/**
 * I.R.F.L.P. 120(c)(1), Form 6 line 2: each parent's share is their Guidelines
 * Income divided by combined Guidelines Income (uncapped, per 120(i)(7)).
 */
export function incomeShares(
  a: Decimal,
  b: Decimal,
  opts: Pick<EngineOptions, 'sharePrecision'>,
): IncomeShares {
  const combinedAnnual = a.plus(b);
  if (combinedAnnual.isZero()) {
    const half = new Decimal('0.5');
    return { combinedAnnual, A: half, B: half, zeroCombined: true };
  }
  if (opts.sharePrecision === 'percent-2dp') {
    // Form 6 prints shares to 0.01% summing to 100.00%.
    const A = a.div(combinedAnnual).toDecimalPlaces(4);
    return { combinedAnnual, A, B: new Decimal(1).minus(A), zeroCombined: false };
  }
  // Each share from its own division (not 1 - A), so swapping the parents
  // gives bit-identical intermediates and a result that never depends on
  // which parent is labelled A.
  return { combinedAnnual, A: a.div(combinedAnnual), B: b.div(combinedAnnual), zeroCombined: false };
}
