/**
 * Unit tests per pipeline step. Expected values are hand-computed from the
 * Rule 120 text; the arithmetic is shown in comments.
 */
import { describe, expect, it } from 'vitest';
import {
  basicObligation,
  calculate,
  emancipationDate,
  guidelines,
  guidelinesIncome,
  lookupTaxBenefit,
  stepDownSchedule,
  Decimal,
  type CaseInput,
  type ChildInput,
} from '../index';

const money = (d: { toFixed(n: number): string }) => d.toFixed(2);
const codes = (r: { flags: { code: string }[] }) => r.flags.map((f) => f.code);

function kids(overnightsWithA: number[], birthDate = '2018-05-01'): ChildInput[] {
  return overnightsWithA.map((o, i) => ({ id: `c${i + 1}`, birthDate, overnightsWithA: o }));
}

function base(incomeA: number, incomeB: number, children: ChildInput[], extra: Partial<CaseInput> = {}): CaseInput {
  return {
    calculationDate: '2026-10-22',
    parents: {
      A: { income: { wages: incomeA }, maritalStatus: 'single' },
      B: { income: { wages: incomeB }, maritalStatus: 'single' },
    },
    children,
    ...extra,
    options: { rounding: 'exact', ...extra.options },
  };
}

// Children born 2009-01-01 turn 17 in 2026: still due support, but excluded
// from the tax benefit. Used to isolate the custody math from the tax add-on.
const NO_TAX_BIRTH = '2009-01-01';

describe('120(i)(1) schedule transcription', () => {
  it('printed Per Month and Per Year columns (rows 1-10) match rate x bracket width', () => {
    for (const n of [1, 2, 3, 4, 5] as const) {
      for (let i = 0; i < 10; i++) {
        const annual = new Decimal(guidelines.rates[n][i]!).times(guidelines.bracketWidths[i]!);
        expect(annual.toNumber(), `n=${n} row ${i + 1} per year`).toBe(guidelines.printed.perYear[n][i]);
        expect(annual.div(12).toDecimalPlaces(0).toNumber(), `n=${n} row ${i + 1} per month`).toBe(
          guidelines.printed.perMonth[n][i],
        );
      }
    }
  });

  it('records the four-child table labelling its last row "next $20,000"', () => {
    expect(guidelines.printed.topBracketLabelWidth[4]).toBe(20_000);
    expect(guidelines.bracketWidths.at(-1)).toBe(290_000);
  });

  it('zero income gives zero; income exactly at a bracket edge stops there', () => {
    expect(basicObligation(new Decimal(0), 2, { rounding: 'exact' }).annual.toNumber()).toBe(0);
    const at50k = basicObligation(new Decimal(50_000), 1, { rounding: 'exact' });
    expect(at50k.brackets).toHaveLength(5);
    expect(at50k.annual.toNumber()).toBe(1800 + 1700 + 1500 + 1400 + 1300);
  });

  it('more than five children uses the five-child column and is flagged', () => {
    const r = calculate(base(60_000, 40_000, kids([0, 0, 0, 0, 0, 0])));
    expect(r.basic.scheduleChildren).toBe(5);
    expect(codes(r)).toContain('MORE_THAN_FIVE_CHILDREN');
  });
});

describe('120(e)-(f) Guidelines Income', () => {
  it('self-employment: receipts - expenses - depreciation - half SE tax', () => {
    const g = guidelinesIncome({
      income: {
        business: { grossReceipts: 120_000, ordinaryAndNecessaryExpenses: 40_000, straightLineDepreciation: 5_000, selfEmploymentTax: 10_000 },
      },
    });
    expect(g.businessNet.toNumber()).toBe(70_000);
    expect(g.grossIncome.annual.toNumber()).toBe(70_000);
  });

  it('overtime counts unless the court excludes it', () => {
    const incl = guidelinesIncome({ income: { wages: 50_000, overtimeOrSecondJob: 8_000 } });
    const excl = guidelinesIncome({ income: { wages: 50_000, overtimeOrSecondJob: 8_000, excludeOvertimeOrSecondJob: true } });
    expect(incl.grossIncome.annual.toNumber()).toBe(58_000);
    expect(excl.grossIncome.annual.toNumber()).toBe(50_000);
  });

  it('subtracts other orders, maintenance and unordered support; includes benefits and potential income', () => {
    const g = guidelinesIncome({
      income: { wages: 40_000, employmentBenefits: 2_000, potentialIncome: 10_000 },
      deductions: { otherCourtOrders: 3_000, spousalMaintenanceThisCase: 6_000, supportWithoutOrder: 1_000 },
    });
    expect(g.grossIncome.annual.toNumber()).toBe(52_000);
    expect(g.guidelinesIncome.annual.toNumber()).toBe(42_000);
  });

  it('two other children in the home: one-child table each (default) vs two-child table', () => {
    // $21,600: one-child = 1,800 + 1,700 + 240 = 3,740/yr; two-child = 2,600 + 2,500 + 368 = 5,468/yr.
    const parent = { income: { wages: 21_600 }, deductions: { otherChildrenInHome: 2 } };
    expect(guidelinesIncome(parent, { rounding: 'exact' }).otherChildrenDeduction.annual.toNumber()).toBe(7_480);
    expect(
      guidelinesIncome(parent, { rounding: 'exact', otherChildrenTable: 'n-child' }).otherChildrenDeduction.annual.toNumber(),
    ).toBe(5_468);
  });

  it('floors Guidelines Income at zero and flags it', () => {
    const r = calculate({
      ...base(10_000, 40_000, kids([0])),
      parents: {
        A: { income: { wages: 10_000 }, deductions: { otherCourtOrders: 12_000 }, maritalStatus: 'single' },
        B: { income: { wages: 40_000 }, maritalStatus: 'single' },
      },
    });
    expect(r.income.A.guidelinesIncome.annual.toNumber()).toBe(0);
    expect(codes(r)).toContain('NEGATIVE_GUIDELINES_INCOME');
  });
});

describe('120(i)(3)-(6) custody', () => {
  it('91 overnights (24.9%) is primary; 92 (25.2%) is shared. No integer count is exactly 25%.', () => {
    expect(calculate(base(60_000, 40_000, kids([91]))).custody.type).toBe('primary');
    expect(calculate(base(60_000, 40_000, kids([92]))).custody.type).toBe('shared');
    expect(calculate(base(60_000, 40_000, kids([365 - 91]))).custody.type).toBe('primary');
    expect(calculate(base(60_000, 40_000, kids([365 - 92]))).custody.type).toBe('shared');
  });

  it('split 2+1, per the 120(i)(6)(B) example', () => {
    // 3 children, $100,000 combined: 3,000+2,900+2,700+2,600+2,400+4,000+3,200+1,200 = 22,000/yr = 1,833.33/mo.
    // Per child: A 1,833.33 x .6 / 3 = 366.67; B 1,833.33 x .4 / 3 = 244.44.
    // A has c1, c2 (c1 x 1.5, c2 x 1); B has c3 (x 1.5).
    // A owes for c3: 366.67 x 1.5 = 550.00. B owes for c1+c2: 244.44 x 2.5 = 611.11. B pays A 61.11.
    const r = calculate(base(60_000, 40_000, kids([365, 365, 0], NO_TAX_BIRTH)));
    expect(r.custody.type).toBe('split');
    expect(r.custody.children.map((c) => c.multiplier.toNumber())).toEqual([1.5, 1, 1.5]);
    expect(money(r.custody.obligations.A)).toBe('550.00');
    expect(money(r.custody.obligations.B)).toBe('611.11');
    expect(r.result.payer).toBe('B');
    expect(money(r.result.baseSupport)).toBe('61.11');
  });

  it('split 2+2: every child carries the 1.5 multiplier', () => {
    const r = calculate(base(60_000, 40_000, kids([365, 365, 0, 0], NO_TAX_BIRTH)));
    expect(r.custody.children.every((c) => c.multiplier.toNumber() === 1.5)).toBe(true);
  });

  it('mixed: one shared child and one child primary with B', () => {
    // 2 children, $100,000: basic 1,541.67. Line 5: A 462.50, B 308.33.
    // c1 shared, 183 nights with A: A owes 462.50 x 1.5 x 182/365 = 345.92; B owes 308.33 x 1.5 x 183/365 = 231.88.
    // c2 primary with B: A owes 462.50 x 1 x 1 = 462.50.
    // A total 808.42, B 231.88 -> A pays 576.54 (cap 925.00).
    const r = calculate(base(60_000, 40_000, kids([183, 0], NO_TAX_BIRTH)));
    expect(r.custody.type).toBe('mixed');
    expect(r.custody.form).toBe(7);
    expect(money(r.custody.obligations.A)).toBe('808.42');
    expect(money(r.custody.obligations.B)).toBe('231.88');
    expect(money(r.result.baseSupport)).toBe('576.54');
  });

  it('shared cap: payer never owes more than with all children in the other home', () => {
    // A earns everything and has 100 nights: 1.5 x 1 x 265/365 = 1.089 x basic > basic.
    const r = calculate(base(100_000, 0, kids([100, 100], NO_TAX_BIRTH)));
    expect(r.custody.capApplied).toBe(true);
    expect(money(r.result.baseSupport)).toBe('1541.67');
    expect(codes(r)).toContain('CUSTODY_CAP_APPLIED');
  });

  it('flags a payer with more than 50% of overnights', () => {
    const r = calculate(base(150_000, 20_000, kids([200, 200], NO_TAX_BIRTH)));
    expect(r.result.payer).toBe('A');
    expect(codes(r)).toContain('PAYER_HAS_MAJORITY_TIME');
  });

  it('rejects impossible overnights', () => {
    expect(() => calculate(base(1, 1, kids([366])))).toThrow();
    expect(() => calculate(base(1, 1, kids([10.5])))).toThrow();
  });
});

describe('120(g)(3) tax benefit', () => {
  it('looks up bracketed rows: over < income <= upTo', () => {
    expect(lookupTaxBenefit('single-has-custody', new Decimal(40_000), 2).row).toEqual({ over: 38_000, upTo: 40_000 });
    expect(lookupTaxBenefit('single-has-custody', new Decimal(40_001), 2).row).toEqual({ over: 40_000, upTo: 42_000 });
    expect(lookupTaxBenefit('single-has-custody', new Decimal(4_000), 1).annual.toNumber()).toBe(0);
    const high = lookupTaxBenefit('remarried', new Decimal(700_000), 1);
    expect(high.aboveRange).toBe(true);
  });

  it('default assignment to the greater benefit; the other parent gets a pro rata share', () => {
    // A $60,000 non-custodial single: 2,205 + 2,205 = 4,410. B $20,000 custodial single: 1,511 + 1,075 = 2,586.
    // A claims; 4,410 / 12 = 367.50; B's share 25% = 91.875 -> A pays more.
    // Basic for $80,000, 2 children: 16,300/yr = 1,358.33; A's 75% = 1,018.75. Total 1,018.75 + 91.88 = 1,110.63.
    const r = calculate(base(60_000, 20_000, kids([0, 0])));
    const t = r.adjustments.taxBenefit!;
    expect(t.lookups.A.table).toBe('single-no-custody');
    expect(t.lookups.B.table).toBe('single-has-custody');
    expect(t.lookups.A.annual.toNumber()).toBe(4_410);
    expect(t.lookups.B.annual.toNumber()).toBe(2_586);
    expect(t.claimedBy).toBe('A');
    expect(money(r.lines.taxBenefit!)).toBe('91.88');
    expect(money(r.result.totalMonthly)).toBe('1110.63');
  });

  it('equal benefits default to the custodial parent, who credits the payer', () => {
    // A $60,000: 4,410. B $40,000 has custody, row 38,000-40,000: 2,205 + 2,205 = 4,410. Tie -> B claims.
    // 367.50 x A's 60% = 220.50 credit. 925.00 - 220.50 = 704.50.
    const r = calculate(base(60_000, 40_000, kids([0, 0])));
    expect(r.adjustments.taxBenefit!.claimedBy).toBe('B');
    expect(codes(r)).toContain('TAX_TIE_DEFAULTED_TO_CUSTODIAL');
    expect(money(r.lines.taxBenefit!)).toBe('-220.50');
    expect(money(r.result.totalMonthly)).toBe('704.50');
  });

  it('excludes children who turn 17 or older in the tax year', () => {
    const r = calculate(base(60_000, 40_000, [
      { id: 'older', birthDate: '2009-12-31', overnightsWithA: 0 },
      { id: 'younger', birthDate: '2010-01-01', overnightsWithA: 0 },
    ]));
    expect(r.adjustments.taxBenefit!.eligibleChildIds).toEqual(['younger']);
  });

  it('remarried status selects the remarried table; overrides win', () => {
    const r = calculate({
      ...base(60_000, 40_000, kids([0])),
      parents: {
        A: { income: { wages: 60_000 }, maritalStatus: 'remarried' },
        B: { income: { wages: 40_000 }, maritalStatus: 'single' },
      },
      addOns: { taxTableOverride: { B: 'remarried' } },
    });
    expect(r.adjustments.taxBenefit!.lookups.A.table).toBe('remarried');
    expect(r.adjustments.taxBenefit!.lookups.B.table).toBe('remarried');
  });

  it('agreed assignment overrides the default', () => {
    const r = calculate({ ...base(60_000, 20_000, kids([0, 0])), addOns: { taxExemptionClaimedBy: 'B' } });
    // B claims 2,586/yr = 215.50/mo; A's 75% = 161.625 credit.
    expect(money(r.lines.taxBenefit!)).toBe('-161.63');
  });
});

describe('120(g)(1), (g)(4) child care and health insurance', () => {
  const kidsNoTax = kids([0, 0], NO_TAX_BIRTH);

  it('paid directly by default: listed, not added to support', () => {
    const r = calculate({ ...base(60_000, 40_000, kidsNoTax), addOns: { childCare: [{ paidBy: 'B', monthly: 500 }] } });
    expect(money(r.result.totalMonthly)).toBe('925.00');
    expect(r.directPayments).toHaveLength(1);
    expect(r.directPayments[0]!.owedBy).toBe('A');
    expect(money(r.directPayments[0]!.owed)).toBe('300.00');
  });

  it('inside support: recipient-paid premium adds, payer-paid premium credits', () => {
    const add = calculate({ ...base(60_000, 40_000, kidsNoTax), addOns: { healthInsurance: [{ paidBy: 'B', monthly: 200, inSupport: true }] } });
    expect(money(add.lines.healthInsurance!)).toBe('120.00');
    expect(money(add.result.totalMonthly)).toBe('1045.00');
    const credit = calculate({ ...base(60_000, 40_000, kidsNoTax), addOns: { healthInsurance: [{ paidBy: 'A', monthly: 200, inSupport: true }] } });
    expect(money(credit.lines.healthInsurance!)).toBe('-80.00');
    expect(money(credit.result.totalMonthly)).toBe('845.00');
  });

  it('a credit larger than support reverses the direction and is flagged', () => {
    const r = calculate({ ...base(60_000, 40_000, kidsNoTax), addOns: { childCare: [{ paidBy: 'A', monthly: 3_000, inSupport: true }] } });
    // 925.00 - 3,000 x 40% = -275.00: B pays A.
    expect(r.result.payer).toBe('B');
    expect(money(r.result.totalMonthly)).toBe('275.00');
    expect(codes(r)).toContain('DIRECTION_REVERSED_BY_ADJUSTMENTS');
  });
});

describe('120(g)(5) dependency benefits', () => {
  const kidsNoTax = kids([0, 0], NO_TAX_BIRTH);

  it("adds the benefit to the payer's income and credits it against support", () => {
    // A: 60,000 + 300 x 12 = 63,600. Combined 103,600: basic 18,500 + 3,600 x 9% = 18,824/yr = 1,568.67.
    // A's share 63,600/103,600 -> 963.00; less 300 = 663.00.
    const r = calculate({ ...base(60_000, 40_000, kidsNoTax), addOns: { dependencyBenefit: { onAccountOf: 'A', monthly: 300 } } });
    expect(r.income.A.grossIncome.annual.toNumber()).toBe(63_600);
    expect(money(r.result.baseSupport)).toBe('963.00');
    expect(money(r.adjustments.dependencyBenefit!.credit)).toBe('300.00');
    expect(money(r.result.totalMonthly)).toBe('663.00');
  });

  it('never reimburses beyond zero', () => {
    const r = calculate({ ...base(60_000, 40_000, kidsNoTax), addOns: { dependencyBenefit: { onAccountOf: 'A', monthly: 5_000 } } });
    expect(money(r.result.totalMonthly)).toBe('0.00');
  });

  it("is not applied, nor added to income, when that parent is not the payer", () => {
    const r = calculate({ ...base(60_000, 40_000, kidsNoTax), addOns: { dependencyBenefit: { onAccountOf: 'B', monthly: 300 } } });
    expect(r.income.B.grossIncome.annual.toNumber()).toBe(40_000);
    expect(money(r.result.totalMonthly)).toBe('925.00');
    expect(codes(r)).toContain('DEPENDENCY_BENEFIT_NOT_APPLIED');
  });
});

describe('120(i)(5) extended visits', () => {
  it('primary custody: 50% abatement for the visit', () => {
    const r = calculate({ ...base(60_000, 40_000, kids([0, 0], NO_TAX_BIRTH)), addOns: { extendedVisitDays: 28 } });
    expect(money(r.extendedVisit!.abatedMonthlyRate)).toBe('462.50');
    // 925 x 12 / 365 x 28 x 50% = 425.75
    expect(money(r.extendedVisit!.annualReduction)).toBe('425.75');
    expect(money(r.result.totalMonthly)).toBe('925.00');
  });

  it('not applicable in shared custody or under 14 days', () => {
    expect(calculate({ ...base(60_000, 40_000, kids([120])), addOns: { extendedVisitDays: 28 } }).extendedVisit).toBeNull();
    const short = calculate({ ...base(60_000, 40_000, kids([0])), addOns: { extendedVisitDays: 10 } });
    expect(short.extendedVisit).toBeNull();
    expect(codes(short)).toContain('EXTENDED_VISIT_NOT_APPLICABLE');
  });
});

describe('120(c)(4) floors and flags', () => {
  it('flags support under $50 per child by default', () => {
    const r = calculate(base(3_000, 100_000, kids([0, 0], NO_TAX_BIRTH)));
    expect(r.result.totalMonthly.lessThan(100)).toBe(true);
    expect(codes(r)).toContain('BELOW_MINIMUM');
    expect(codes(r)).toContain('LOW_INCOME_REVIEW');
  });

  it("'apply' raises support to the minimum", () => {
    const r = calculate(base(3_000, 100_000, kids([0, 0], NO_TAX_BIRTH), { options: { minimumSupport: 'apply' } }));
    expect(money(r.result.totalMonthly)).toBe('100.00');
    expect(codes(r)).toContain('MINIMUM_APPLIED');
  });
});

describe('120(a), (j) emancipation and step-down', () => {
  it('18th birthday, or high school graduation up to the 19th birthday', () => {
    expect(emancipationDate({ id: 'a', birthDate: '2009-03-01', overnightsWithA: 0 })).toBe('2027-03-01');
    expect(emancipationDate({ id: 'a', birthDate: '2009-03-01', overnightsWithA: 0, highSchoolGraduation: '2027-05-28' })).toBe('2027-05-28');
    expect(emancipationDate({ id: 'a', birthDate: '2009-03-01', overnightsWithA: 0, highSchoolGraduation: '2028-06-01' })).toBe('2028-03-01');
    expect(emancipationDate({ id: 'a', birthDate: '2008-02-29', overnightsWithA: 0 })).toBe('2026-03-01');
  });

  it('excludes a child already emancipated on the calculation date', () => {
    const r = calculate(base(60_000, 40_000, [
      { id: 'adult', birthDate: '2008-01-01', overnightsWithA: 0 },
      { id: 'minor', birthDate: '2015-01-01', overnightsWithA: 0 },
    ]));
    expect(r.children.included.map((c) => c.id)).toEqual(['minor']);
    expect(codes(r)).toContain('CHILD_EXCLUDED_EMANCIPATED');
  });

  it('recomputes from the schedule for the remaining children at each emancipation', () => {
    const input = base(60_000, 40_000, [
      { id: 'c1', birthDate: '2010-03-01', overnightsWithA: 0 },
      { id: 'c2', birthDate: '2014-06-15', overnightsWithA: 0 },
    ]);
    const rows = stepDownSchedule(input);
    expect(rows.map((r) => [r.effectiveDate, r.childIds])).toEqual([
      ['2026-10-22', ['c1', 'c2']],
      ['2028-03-01', ['c2']],
      ['2032-06-15', []],
    ]);
    const oneChild = calculate({ ...input, calculationDate: '2028-03-01', children: [input.children[1]!] });
    expect(money(rows[1]!.totalMonthly)).toBe(money(oneChild.result.totalMonthly));
    // Not a pro rata reduction: two children 925 vs one child at 60% of $100,000 one-child basic.
    expect(rows[1]!.calculation!.basic.scheduleChildren).toBe(1);
    expect(rows[2]!.totalMonthly.isZero()).toBe(true);
  });
});

describe('rounding conventions', () => {
  it("'rule-example' worksheet lines are whole dollars; 'exact' are cents", () => {
    const ex = calculate(base(61_234, 38_766, kids([110, 110]), { options: { rounding: 'rule-example' } }));
    expect(ex.result.totalMonthly.isInteger()).toBe(true);
    expect(ex.result.baseSupport.isInteger()).toBe(true);
    const exact = calculate(base(61_234, 38_766, kids([110, 110])));
    expect(exact.result.totalMonthly.decimalPlaces()).toBeLessThanOrEqual(2);
  });

  it("'percent-2dp' rounds shares to 0.01% as printed on Form 6", () => {
    const r = calculate(base(25_000, 10_000, kids([0, 0]), { options: { sharePrecision: 'percent-2dp' } }));
    expect(r.shares.A.toString()).toBe('0.7143');
    expect(r.shares.B.toString()).toBe('0.2857');
  });
});
