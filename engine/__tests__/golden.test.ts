/**
 * Golden cases from SPEC.md. Never change an expected value to make a test
 * pass; if a value looks wrong, stop and raise it (see DECISIONS.md).
 *
 * G1-G5 expected values are copied from SPEC.md. Where SPEC.md states a value
 * under one rounding convention, the test pins that convention explicitly, and
 * the other convention's result is asserted separately and labelled as derived.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { basicObligation, calculate, guidelinesIncome, type CaseInput } from '../index';
import { guidelines } from '../guidelines/2025-07-01';
import { Decimal } from '../money';

const money = (d: { toFixed(n: number): string }) => d.toFixed(2);

/** Two parents with only wage income, children all with one parent unless overnights given. */
function simpleCase(
  incomeA: number,
  incomeB: number,
  children: number,
  overnightsWithA: number,
  options: CaseInput['options'] = {},
): CaseInput {
  return {
    calculationDate: '2026-10-22',
    parents: {
      A: { income: { wages: incomeA }, maritalStatus: 'single' },
      B: { income: { wages: incomeB }, maritalStatus: 'single' },
    },
    children: Array.from({ length: children }, (_, i) => ({
      id: `c${i + 1}`,
      birthDate: `2018-0${i + 1}-15`,
      overnightsWithA,
    })),
    options,
  };
}

describe('G1: Rule 120(i)(3) example (2 children, $25,000 + $10,000, primary)', () => {
  // A earns $25,000 and has 0 overnights; B is the custodial parent.
  it('rule-example rounding: basic $709, payer pays $506', () => {
    const r = calculate(simpleCase(25_000, 10_000, 2, 0, { rounding: 'rule-example' }));
    expect(money(r.basic.monthly)).toBe('709.00');
    expect(r.basic.brackets.map((b) => b.monthly.toNumber())).toEqual([217, 208, 192, 92]);
    expect(r.custody.form).toBe(6);
    expect(r.result.payer).toBe('A');
    expect(money(r.result.baseSupport)).toBe('506.00');
  });

  it('exact rounding: basic $708.33 (SPEC.md), payer $505.95 (derived)', () => {
    const r = calculate(simpleCase(25_000, 10_000, 2, 0, { rounding: 'exact' }));
    expect(money(r.basic.monthly)).toBe('708.33');
    expect(money(r.result.baseSupport)).toBe('505.95');
  });
});

describe('G2: Rule 120 endnote 3 (other child in home)', () => {
  // Bob: gross $1,800/month = $21,600/year, one child of another relationship at home.
  const bob = {
    income: { wages: 21_600 },
    deductions: { otherChildrenInHome: 1 },
    maritalStatus: 'single' as const,
  };

  it('rule-example rounding: deduction $312, adjusted gross $1,488', () => {
    const g = guidelinesIncome(bob, { rounding: 'rule-example' });
    expect(money(g.otherChildrenDeduction.monthly)).toBe('312.00');
    expect(money(g.guidelinesIncome.monthly)).toBe('1488.00');
  });

  it('exact rounding: deduction $311.67 (SPEC.md)', () => {
    const g = guidelinesIncome(bob, { rounding: 'exact' });
    expect(money(g.otherChildrenDeduction.monthly)).toBe('311.67');
    expect(money(g.guidelinesIncome.monthly)).toBe('1488.33');
  });
});

describe('G3: 2 children, $100,000 combined, primary', () => {
  it('exact rounding: basic $1,541.67 (SPEC.md)', () => {
    const r = calculate(simpleCase(60_000, 40_000, 2, 0, { rounding: 'exact' }));
    expect(money(r.basic.monthly)).toBe('1541.67');
  });

  it('rule-example rounding: basic $1,542 (derived; SPEC.md value assumes exact math)', () => {
    const r = calculate(simpleCase(60_000, 40_000, 2, 0, { rounding: 'rule-example' }));
    expect(money(r.basic.monthly)).toBe('1542.00');
  });
});

describe('G4: 2 children, A $60,000, B $40,000, B has 110 overnights (shared)', () => {
  it('exact rounding: A owes $418.15, B owes $646.23, B pays A $228.08, cap $616.67', () => {
    const r = calculate(simpleCase(60_000, 40_000, 2, 365 - 110, { rounding: 'exact' }));
    expect(r.custody.type).toBe('shared');
    expect(r.custody.form).toBe(7);
    expect(money(r.custody.obligations.A)).toBe('418.15');
    expect(money(r.custody.obligations.B)).toBe('646.23');
    expect(r.result.payer).toBe('B');
    expect(money(r.result.baseSupport)).toBe('228.08');
    expect(money(r.custody.cap)).toBe('616.67');
    expect(r.custody.capApplied).toBe(false);
  });
});

describe('G5: combined $440,000 (top bracket)', () => {
  it('percentages give $29,600/yr (1 child) and $45,800/yr (2 children)', () => {
    const opts = { rounding: 'exact' as const };
    expect(basicObligation(new Decimal(440_000), 1, opts).annual.toNumber()).toBe(29_600);
    expect(basicObligation(new Decimal(440_000), 2, opts).annual.toNumber()).toBe(45_800);
  });

  it('income above $440,000 is capped for the schedule and flagged', () => {
    const r = calculate(simpleCase(400_000, 100_000, 1, 0, { rounding: 'exact' }));
    expect(r.basic.annual.toNumber()).toBe(29_600);
    expect(r.flags.map((f) => f.code)).toContain('INCOME_OVER_CAP');
  });

  it("documents the printed tables: the last row's dollar figure is the cumulative amount through $150,000", () => {
    // SPEC.md reads the last row's "Per Year" figure as the top bracket's own
    // amount (and so "wrong"). It is the running total of rows 1-10 in every
    // table. Summing all printed rows double-counts it: $30,200 and $45,200.
    for (const n of [1, 2, 3, 4, 5] as const) {
      const perYear = guidelines.printed.perYear[n];
      const throughTenth = perYear.slice(0, 10).reduce((a, b) => a + b, 0);
      expect(perYear[10]).toBe(throughTenth);
      expect(basicObligation(new Decimal(150_000), n, { rounding: 'exact' }).annual.toNumber()).toBe(throughTenth);
    }
    expect(guidelines.printed.perYear[1].reduce((a, b) => a + b, 0)).toBe(30_200);
    expect(guidelines.printed.perYear[2].reduce((a, b) => a + b, 0)).toBe(45_200);
  });
});

// ---------------------------------------------------------------------------
// D1-D10: Dad's anonymized ICSP cases. Drop fixtures into
// engine/__tests__/fixtures/icsp/ (format: fixtures/README.md) and they run here.
// ---------------------------------------------------------------------------

interface IcspFixture {
  id: string;
  description: string;
  input: CaseInput;
  expected: {
    payer: 'A' | 'B' | null;
    totalMonthly: string;
    lines?: Record<string, string>;
  };
}

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'icsp');
const fixtures: IcspFixture[] = existsSync(fixtureDir)
  ? readdirSync(fixtureDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => JSON.parse(readFileSync(join(fixtureDir, f), 'utf8')))
  : [];

describe('D1-D10: ICSP cases', () => {
  for (const id of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10']) {
    const fx = fixtures.find((f) => f.id === id);
    if (!fx) {
      it.skip(`${id}: waiting on ICSP printout`, () => {});
      continue;
    }
    it(`${id}: ${fx.description}`, () => {
      const r = calculate(fx.input);
      expect(r.result.payer).toBe(fx.expected.payer);
      expect(money(r.result.totalMonthly)).toBe(fx.expected.totalMonthly);
      for (const [key, value] of Object.entries(fx.expected.lines ?? {})) {
        expect(money(r.lines[key]!), key).toBe(value);
      }
    });
  }
});
