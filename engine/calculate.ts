import { guidelines } from './guidelines/2025-07-01';
import { applyDependencyBenefit, expenseShare, extendedVisit, type ExpenseShare, type ExtendedVisit } from './addons';
import { custodyAdjustment, type CustodyResult } from './custody';
import { guidelinesIncome, incomeShares, type GuidelinesIncomeResult, type IncomeShares } from './income';
import { Decimal, ZERO, dec, sum, toCents, toDollars } from './money';
import { basicObligation, type BasicObligation } from './schedule';
import { taxBenefit, type TaxBenefitResult } from './tax';
import {
  DEFAULT_OPTIONS,
  other,
  type CaseInput,
  type ChildInput,
  type EngineOptions,
  type Flag,
  type FlagCode,
  type ParentId,
} from './types';

export interface CalculationResult {
  guidelinesId: string;
  calculationDate: string;
  options: EngineOptions;
  children: { included: ChildInput[]; excluded: { child: ChildInput; emancipation: string }[] };
  income: Record<ParentId, GuidelinesIncomeResult>;
  shares: IncomeShares;
  basic: BasicObligation;
  custody: CustodyResult;
  adjustments: {
    childCare: ExpenseShare[];
    healthInsurance: ExpenseShare[];
    taxBenefit: TaxBenefitResult | null;
    dependencyBenefit: { onAccountOf: ParentId; monthly: Decimal; credit: Decimal; applied: boolean } | null;
  };
  /** Expenses paid directly between the parents, outside the support amount. */
  directPayments: ExpenseShare[];
  extendedVisit: ExtendedVisit | null;
  result: {
    payer: ParentId | null;
    recipient: ParentId | null;
    /** Worksheet line 5 (Form 6) / line 10 (Form 7), rounded per options. */
    baseSupport: Decimal;
    /** Total amount to be ordered, rounded per options. */
    totalMonthly: Decimal;
    /** Total with sign: positive A pays B. */
    signedTotal: Decimal;
  };
  flags: Flag[];
  /** Flat map of every printed figure, keyed for fixtures and form filling. See fixtures/README.md. */
  lines: Record<string, Decimal>;
}

// ---------------------------------------------------------------------------
// Dates and emancipation
// ---------------------------------------------------------------------------

/** The date a child reaches `years` years old. A Feb 29 birthday falls on Mar 1 in common years. */
export function anniversary(birthDate: string, years: number): string {
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
  const year = y + years;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (m === 2 && d === 29 && !leap) return `${year}-03-01`;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * I.R.F.L.P. 120(a): support runs until 18, or until high school ends if the
 * child is still pursuing it, but not past 19. Returns the first date the
 * child is no longer due support.
 */
export function emancipationDate(child: ChildInput): string {
  const eighteen = anniversary(child.birthDate, guidelines.emancipation.age);
  const nineteen = anniversary(child.birthDate, guidelines.emancipation.highSchoolAge);
  const grad = child.highSchoolGraduation;
  if (!grad || grad <= eighteen) return eighteen;
  return grad < nineteen ? grad : nineteen;
}

// ---------------------------------------------------------------------------
// Floors and flags
// ---------------------------------------------------------------------------

const flag = (code: FlagCode, rule: string, message: string): Flag => ({ code, rule, message });

/**
 * I.R.F.L.P. 120(c)(4): the $50 per child per month rebuttable minimum and the
 * review when the paying parent's monthly income is under $800.
 * I.R.F.L.P. 120(i)(7): combined income above $440,000 may support more.
 * I.R.F.L.P. 120(i)(2): more than five children is not limited by the schedule.
 */
export function floorsAndFlags(args: {
  payer: ParentId | null;
  amount: Decimal;
  children: number;
  payerGuidelinesMonthly: Decimal | null;
  combinedAnnual: Decimal;
  options: EngineOptions;
}): { amount: Decimal; flags: Flag[] } {
  const flags: Flag[] = [];
  let amount = args.amount;

  const minimum = new Decimal(guidelines.minimumMonthlyPerChild).times(args.children);
  if (amount.lessThan(minimum)) {
    if (args.options.minimumSupport === 'apply' && args.payer) {
      flags.push(flag('MINIMUM_APPLIED', '120(c)(4)', `Support raised from $${amount.toFixed(2)} to the $${minimum.toFixed(0)} presumptive minimum ($50 per child).`));
      amount = minimum;
    } else {
      flags.push(flag('BELOW_MINIMUM', '120(c)(4)', `Support is below the rebuttable $50-per-child minimum of $${minimum.toFixed(0)} per month.`));
    }
  }
  if (args.payerGuidelinesMonthly && args.payerGuidelinesMonthly.lessThan(guidelines.lowIncomeReviewMonthly)) {
    flags.push(flag('LOW_INCOME_REVIEW', '120(c)(4)', `Paying parent's monthly income is under $${guidelines.lowIncomeReviewMonthly}; the court should review incomes and living expenses.`));
  }
  if (args.combinedAnnual.greaterThan(guidelines.combinedIncomeCap)) {
    flags.push(flag('INCOME_OVER_CAP', '120(i)(7)', `Combined Guidelines Income exceeds $${guidelines.combinedIncomeCap.toLocaleString('en-US')}; support is computed on the first $440,000 and the court may award more under the (i)(7) factors.`));
  }
  if (args.children > guidelines.maxScheduledChildren) {
    flags.push(flag('MORE_THAN_FIVE_CHILDREN', '120(i)(2)', 'More than five children: computed with the five-child schedule, which is not a limit. Handle manually.'));
  }
  return { amount, flags };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

const PARENTS: ParentId[] = ['A', 'B'];

/** Full Rule 120 calculation, in SPEC.md pipeline order. Pure; no I/O. */
export function calculate(input: CaseInput): CalculationResult {
  const options = { ...DEFAULT_OPTIONS, ...input.options };
  const dep = input.addOns?.dependencyBenefit;
  if (dep && options.dependencyBenefitAsIncome) {
    const withIncome = run(input, options, true);
    // 120(e)(1)(A) adds the benefit to income only when it is credited against
    // that parent's obligation, which requires them to be the payer.
    if (withIncome.adjustments.dependencyBenefit?.applied) return withIncome;
  }
  return run(input, options, false);
}

function run(input: CaseInput, options: EngineOptions, dependencyAsIncome: boolean): CalculationResult {
  const flags: Flag[] = [];
  const line = (d: Decimal) => (options.rounding === 'rule-example' ? toDollars(d) : toCents(d));
  const addOns = input.addOns ?? {};
  const dep = addOns.dependencyBenefit;
  const depMonthly = dec(dep?.monthly);

  // Children due support on the calculation date.
  const included: ChildInput[] = [];
  const excluded: CalculationResult['children']['excluded'] = [];
  for (const child of input.children) {
    const emancipation = emancipationDate(child);
    if (input.calculationDate >= emancipation) {
      excluded.push({ child, emancipation });
      flags.push(flag('CHILD_EXCLUDED_EMANCIPATED', '120(a)', `${child.name ?? child.id} is no longer due support as of ${emancipation} and is excluded.`));
    } else {
      included.push(child);
    }
  }
  if (included.length === 0) throw new Error('No children are due support on the calculation date.');
  const n = included.length;

  // 1-2. Gross and Guidelines Income per parent. 120(e), 120(f).
  const income = {} as Record<ParentId, GuidelinesIncomeResult>;
  for (const p of PARENTS) {
    const parent = input.parents[p];
    const addBenefit = dependencyAsIncome && dep?.onAccountOf === p;
    const inc = addBenefit
      ? { ...parent.income, otherIncome: dec(parent.income.otherIncome).plus(depMonthly.times(12)).toString() }
      : parent.income;
    income[p] = guidelinesIncome({ income: inc, deductions: parent.deductions }, options);
    if (income[p].flooredAtZero) {
      flags.push(flag('NEGATIVE_GUIDELINES_INCOME', '120(f)', `Parent ${p}'s adjustments exceed gross income; Guidelines Income set to zero.`));
    }
  }

  // 3-5. Combined income, basic obligation, income shares. 120(i)(1), (i)(7).
  const shares = incomeShares(income.A.guidelinesIncome.annual, income.B.guidelinesIncome.annual, options);
  if (shares.zeroCombined) flags.push(flag('ZERO_COMBINED_INCOME', '120(c)(1)', 'Combined Guidelines Income is zero; shares defaulted to 50/50.'));
  const basic = basicObligation(shares.combinedAnnual, n, options);

  // 6. Custody adjustment. 120(i)(3)-(6).
  const custody = custodyAdjustment(basic.monthly, shares, included);
  if (custody.capApplied) {
    flags.push(flag('CUSTODY_CAP_APPLIED', custody.type === 'shared' ? '120(i)(4)(B)' : '120(i)(6)(B)', `Capped at $${toCents(custody.cap).toFixed(2)}, what the payer would owe with all children in the other home.`));
  }
  if (custody.payerOvernightShare?.greaterThan('0.5')) {
    flags.push(flag('PAYER_HAS_MAJORITY_TIME', '120(i)(4)(B)', `Parent ${custody.payer} pays support with over 50% of overnights and may show it is inappropriate under the (i)(7) factors.`));
  }
  const signedBase = line(custody.net);

  // 7. Add-ons. 120(g)(1), (g)(3), (g)(4).
  const expenses = [
    ...(addOns.childCare ?? []).map((e) => expenseShare('childCare', e, shares)),
    ...(addOns.healthInsurance ?? []).map((e) => expenseShare('healthInsurance', e, shares)),
  ];
  const childCare = expenses.filter((e) => e.kind === 'childCare');
  const healthInsurance = expenses.filter((e) => e.kind === 'healthInsurance');
  const signedChildCare = line(sum(childCare.map((e) => e.signed)));
  const signedInsurance = line(sum(healthInsurance.map((e) => e.signed)));

  const overnights = {
    A: sum(included.map((c) => new Decimal(c.overnightsWithA))).toNumber(),
    B: sum(included.map((c) => new Decimal(guidelines.daysPerYear - c.overnightsWithA))).toNumber(),
  };
  const tax = taxBenefit({
    taxYear: Number(input.calculationDate.slice(0, 4)),
    children: included,
    parents: input.parents,
    guidelinesIncomeAnnual: { A: income.A.guidelinesIncome.annual, B: income.B.guidelinesIncome.annual },
    shares,
    overnights,
    claimedBy: addOns.taxExemptionClaimedBy,
    tableOverride: addOns.taxTableOverride,
  });
  if (tax) {
    for (const p of PARENTS) {
      if (tax.lookups[p].aboveRange) flags.push(flag('TAX_TABLE_ABOVE_RANGE', '120(g)(3)', `Parent ${p}'s income is above the ${tax.lookups[p].table} table; its last row was used.`));
    }
    if (tax.eligibleChildIds.length > 5) flags.push(flag('TAX_MORE_THAN_FIVE_CHILDREN', '120(g)(3)', 'Tax tables list five children; only five were counted.'));
    if (tax.claimTieDefaulted) flags.push(flag('TAX_TIE_DEFAULTED_TO_CUSTODIAL', '120(g)(3)', `Both parents have the same tax benefit; exemptions assigned to the custodial parent (${tax.claimedBy}).`));
  }
  const signedTax = line(tax?.signed ?? ZERO);

  let signedTotal = signedBase.plus(signedChildCare).plus(signedInsurance).plus(signedTax);
  if (!signedBase.isZero() && !signedTotal.isZero() && signedBase.isPositive() !== signedTotal.isPositive()) {
    flags.push(flag('DIRECTION_REVERSED_BY_ADJUSTMENTS', '120(g)', 'Add-ons and credits exceed base support; the direction of payment is reversed.'));
  }

  // Dependency benefits. 120(g)(5).
  let dependencyBenefit: CalculationResult['adjustments']['dependencyBenefit'] = null;
  if (dep) {
    const payerBefore: ParentId | null = signedTotal.isZero() ? null : signedTotal.isPositive() ? 'A' : 'B';
    const applies = payerBefore === dep.onAccountOf;
    let credit = ZERO;
    if (applies) {
      const r = applyDependencyBenefit(signedTotal.abs(), line(depMonthly));
      credit = r.credit;
      signedTotal = payerBefore === 'A' ? r.after : r.after.negated();
    } else {
      flags.push(flag('DEPENDENCY_BENEFIT_NOT_APPLIED', '120(g)(5)', `Dependency benefits on account of parent ${dep.onAccountOf} were not credited because that parent is not the paying parent.`));
    }
    dependencyBenefit = { onAccountOf: dep.onAccountOf, monthly: depMonthly, credit, applied: applies };
  }

  // 8. Floors and flags. 120(c)(4), (i)(2), (i)(7).
  const payer: ParentId | null = signedTotal.isZero() ? null : signedTotal.isPositive() ? 'A' : 'B';
  const floors = floorsAndFlags({
    payer,
    amount: signedTotal.abs(),
    children: n,
    payerGuidelinesMonthly: payer ? income[payer].guidelinesIncome.monthly : null,
    combinedAnnual: shares.combinedAnnual,
    options,
  });
  flags.push(...floors.flags);
  if (payer && !floors.amount.equals(signedTotal.abs())) {
    signedTotal = payer === 'A' ? floors.amount : floors.amount.negated();
  }

  // Extended visits. 120(i)(5).
  const visit = extendedVisit(signedBase.abs(), addOns.extendedVisitDays, custody.type === 'primary');
  if (addOns.extendedVisitDays !== undefined && !visit) {
    flags.push(flag('EXTENDED_VISIT_NOT_APPLICABLE', '120(i)(5)', 'Extended-visit abatement applies only in primary custody to visits of 14 or more consecutive days.'));
  }

  const result = {
    payer,
    recipient: payer ? other(payer) : null,
    baseSupport: signedBase.abs(),
    totalMonthly: signedTotal.abs(),
    signedTotal,
  };

  const lines: Record<string, Decimal> = {
    'combined.guidelinesIncome.monthly': shares.combinedAnnual.div(12),
    'basic.monthly': basic.monthly,
    'custody.cap': custody.cap,
    baseSupport: signedBase,
    childCare: signedChildCare,
    healthInsurance: signedInsurance,
    taxBenefit: signedTax,
    'taxBenefit.monthly': tax?.monthlyBenefit ?? ZERO,
    dependencyCredit: dependencyBenefit?.credit ?? ZERO,
    total: signedTotal,
  };
  for (const p of PARENTS) {
    lines[`${p}.grossIncome.monthly`] = income[p].grossIncome.monthly;
    lines[`${p}.guidelinesIncome.monthly`] = income[p].guidelinesIncome.monthly;
    lines[`${p}.share.percent`] = shares[p].times(100);
    lines[`${p}.shareOfBasic`] = custody.parentShareOfBasic[p];
    lines[`${p}.obligation`] = custody.obligations[p];
  }

  return {
    guidelinesId: guidelines.id,
    calculationDate: input.calculationDate,
    options,
    children: { included, excluded },
    income,
    shares,
    basic,
    custody,
    adjustments: { childCare, healthInsurance, taxBenefit: tax, dependencyBenefit },
    directPayments: expenses.filter((e) => !e.inSupport && !e.owed.isZero()),
    extendedVisit: visit,
    result,
    flags,
    lines,
  };
}
