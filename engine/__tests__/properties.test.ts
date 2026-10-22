/**
 * Property tests (SPEC.md Phase 1 step 7) over random cases.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calculate, perChild, primary, Decimal, type CaseInput, type EngineOptions } from '../index';

const RUNS = 400;

const income = fc.integer({ min: 0, max: 600_000 });
const overnights = fc.integer({ min: 0, max: 365 });
const rounding = fc.constantFrom<EngineOptions['rounding']>('rule-example', 'exact');
// Mix of tax-eligible children and 17-year-olds (no tax benefit).
const birthDate = fc.constantFrom('2009-01-01', '2012-04-10', '2016-08-20', '2020-11-30');
const children = fc.array(fc.record({ overnightsWithA: overnights, birthDate }), { minLength: 1, maxLength: 6 });

function makeCase(a: number, b: number, kids: { overnightsWithA: number; birthDate: string }[], r: EngineOptions['rounding']): CaseInput {
  return {
    calculationDate: '2026-10-22',
    parents: {
      A: { income: { wages: a }, maritalStatus: 'single' },
      B: { income: { wages: b }, maritalStatus: 'single' },
    },
    children: kids.map((k, i) => ({ id: `c${i}`, ...k })),
    options: { rounding: r },
  };
}

describe('properties', () => {
  it('support is never negative', () => {
    fc.assert(
      fc.property(income, income, children, rounding, (a, b, kids, r) => {
        const res = calculate(makeCase(a, b, kids, r));
        expect(res.result.totalMonthly.isNegative() && !res.result.totalMonthly.isZero()).toBe(false);
        expect(res.result.baseSupport.isNegative() && !res.result.baseSupport.isZero()).toBe(false);
      }),
      { numRuns: RUNS },
    );
  });

  it('the payer never pays more base support than with all children in the other home', () => {
    fc.assert(
      fc.property(income, income, children, rounding, (a, b, kids, r) => {
        const res = calculate(makeCase(a, b, kids, r));
        const payer = res.custody.payer;
        if (!payer) return;
        const allWithOther = res.custody.parentShareOfBasic[payer];
        const line = r === 'rule-example' ? allWithOther.toDecimalPlaces(0) : allWithOther.toDecimalPlaces(2);
        expect(res.result.baseSupport.lte(line)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("base support (A -> B) is monotonic in A's income", () => {
    fc.assert(
      fc.property(income, income, fc.integer({ min: 1, max: 100_000 }), children, rounding, (a, b, delta, kids, r) => {
        const primaryWithB = kids.every((k) => k.overnightsWithA <= 91);
        // Under 'rule-example', per-bracket rounding makes basic/combined a step
        // function, so only primary custody is provably monotonic. 'exact' is
        // monotonic for every custody type.
        if (r === 'rule-example' && !primaryWithB) return;
        const lo = calculate(makeCase(a, b, kids, r));
        const hi = calculate(makeCase(a + delta, b, kids, r));
        expect(hi.lines.baseSupport!.gte(lo.lines.baseSupport!)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it('Form 7 with every child primary in one home reduces to Form 6', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 100 }), fc.integer({ min: 1, max: 6 }), fc.integer({ min: 0, max: 91 }), (basicDollars, pct, n, nights) => {
        const basic = new Decimal(basicDollars);
        const shares = { A: new Decimal(pct).div(100), B: new Decimal(100 - pct).div(100) };
        const kids = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, birthDate: '2015-01-01', overnightsWithA: nights }));
        const f7 = perChild(basic, shares, kids);
        const f6 = primary(basic, shares, 'B');
        expect(f7.net.toFixed(10)).toBe(f6.net.toFixed(10));
      }),
      { numRuns: RUNS },
    );
  });

  it('swapping the parents mirrors the result', () => {
    fc.assert(
      fc.property(income, income, fc.array(overnights, { minLength: 1, maxLength: 5 }), rounding, (a, b, nights, r) => {
        // 17-year-olds only: the tax tie-breakers are intentionally asymmetric.
        const kids = nights.map((o) => ({ overnightsWithA: o, birthDate: '2009-01-01' }));
        const ab = calculate(makeCase(a, b, kids, r));
        const ba = calculate(makeCase(b, a, kids.map((k) => ({ ...k, overnightsWithA: 365 - k.overnightsWithA })), r));
        expect(ab.result.signedTotal.toFixed(2)).toBe(ba.result.signedTotal.negated().toFixed(2));
      }),
      { numRuns: RUNS },
    );
  });

  it('the total reconciles to the printed worksheet lines', () => {
    fc.assert(
      fc.property(income, income, children, rounding, fc.integer({ min: 0, max: 1_500 }), (a, b, kids, r, premium) => {
        const input = makeCase(a, b, kids, r);
        input.addOns = { healthInsurance: [{ paidBy: 'B', monthly: premium, inSupport: true }] };
        const res = calculate(input);
        if (res.flags.some((f) => f.code === 'MINIMUM_APPLIED')) return;
        const l = res.lines;
        const sum = l.baseSupport!.plus(l.childCare!).plus(l.healthInsurance!).plus(l.taxBenefit!);
        expect(sum.toFixed(2)).toBe(l.total!.toFixed(2));
      }),
      { numRuns: RUNS },
    );
  });
});
