/**
 * Idaho Child Support Guidelines, I.R.F.L.P. Rule 120
 * (adopted July 1, 2021; amended March 24, 2022, eff. July 1, 2022;
 * amended June 3, 2025, eff. July 1, 2025).
 *
 * Every rule-derived constant the engine uses lives here. A future amendment
 * is a new file alongside this one, not a code change.
 *
 * Source: https://isc.idaho.gov/rules-procedure/print/irfl/120 (fetched 2026-10-22)
 */
import remarried from './tax/remarried.json';
import singleNoCustody from './tax/single-no-custody.json';
import singleHasCustody from './tax/single-has-custody.json';

export type ChildCount = 1 | 2 | 3 | 4 | 5;

export interface TaxTable {
  id: string;
  title: string;
  sourceUrl: string;
  fetchedAt: string;
  sha256: string;
  rows: { over: number; upTo: number; perChild: number[] }[];
}

export type TaxTableId = 'remarried' | 'single-no-custody' | 'single-has-custody';

export const guidelines = {
  id: '2025-07-01',
  effectiveDate: '2025-07-01',
  sourceUrl: 'https://isc.idaho.gov/rules-procedure/print/irfl/120',

  /** 120(i)(1): bracket widths of combined annual Guidelines Income, lowest first. */
  bracketWidths: [10_000, 10_000, 10_000, 10_000, 10_000, 20_000, 20_000, 20_000, 20_000, 20_000, 290_000],

  /** 120(i)(1): marginal rate for each bracket, by number of children. */
  rates: {
    1: ['0.18', '0.17', '0.15', '0.14', '0.13', '0.12', '0.09', '0.06', '0.05', '0.05', '0.05'],
    2: ['0.26', '0.25', '0.23', '0.22', '0.20', '0.17', '0.13', '0.09', '0.08', '0.08', '0.08'],
    3: ['0.30', '0.29', '0.27', '0.26', '0.24', '0.20', '0.16', '0.12', '0.11', '0.11', '0.11'],
    4: ['0.33', '0.32', '0.30', '0.29', '0.27', '0.22', '0.18', '0.14', '0.13', '0.13', '0.13'],
    5: ['0.36', '0.35', '0.33', '0.32', '0.30', '0.24', '0.20', '0.16', '0.15', '0.15', '0.15'],
  } satisfies Record<ChildCount, string[]>,

  /**
   * The "Per Month" and "Per Year" columns exactly as printed in 120(i)(1).
   * Not used in calculation; kept so tests can check the rates above against
   * the rule's own arithmetic. See DECISIONS.md D-002 on the last row.
   */
  printed: {
    perMonth: {
      1: [150, 142, 125, 117, 108, 200, 150, 100, 83, 83, 1258],
      2: [217, 208, 192, 183, 167, 283, 217, 150, 133, 133, 1883],
      3: [250, 242, 225, 217, 200, 333, 267, 200, 183, 183, 2300],
      4: [275, 267, 250, 242, 225, 367, 300, 233, 217, 217, 2592],
      5: [300, 292, 275, 267, 250, 400, 333, 267, 250, 250, 2883],
    },
    perYear: {
      1: [1800, 1700, 1500, 1400, 1300, 2400, 1800, 1200, 1000, 1000, 15100],
      2: [2600, 2500, 2300, 2200, 2000, 3400, 2600, 1800, 1600, 1600, 22600],
      3: [3000, 2900, 2700, 2600, 2400, 4000, 3200, 2400, 2200, 2200, 27600],
      4: [3300, 3200, 3000, 2900, 2700, 4400, 3600, 2800, 2600, 2600, 31100],
      5: [3600, 3500, 3300, 3200, 3000, 4800, 4000, 3200, 3000, 3000, 34600],
    },
    /** The four-child table's last row reads "next $20,000"; every other table says $290,000. */
    topBracketLabelWidth: { 1: 290_000, 2: 290_000, 3: 290_000, 4: 20_000, 5: 290_000 },
  },

  /** 120(i)(7): the schedule applies to the first $440,000 of combined income. */
  combinedIncomeCap: 440_000,

  /** 120(i)(2): schedules stop at five children; more is not a limitation. */
  maxScheduledChildren: 5 as ChildCount,

  /** 120(i)(3)(B), (i)(4)(A): primary when a parent has 25% or less of overnights. */
  primaryThreshold: '0.25',

  /** Form 7 line 7: overnight fraction >= .75 is entered as 1; <= .25 as 0. */
  form7: { fullAtOrAbove: '0.75', zeroAtOrBelow: '0.25' },

  /** Form 7 line 7 divides overnights by 365. */
  daysPerYear: 365,

  /** 120(i)(4)(B), (i)(6)(A): shared and split multiplier. */
  sharedMultiplier: '1.5',

  /** 120(c)(4): rebuttable presumption of at least $50 per child per month. */
  minimumMonthlyPerChild: 50,

  /** 120(c)(4): careful review when the paying parent earns under $800 per month. */
  lowIncomeReviewMonthly: 800,

  /** 120(i)(5): extended visits of 14+ consecutive days; a reasonable reduction is 50%. */
  extendedVisit: { minConsecutiveDays: 14, reduction: '0.5' },

  /** 120(a): support runs to 18, or 19 while pursuing high school. */
  emancipation: { age: 18, highSchoolAge: 19 },

  /** 120(g)(3) tables and endnote 4. */
  taxBenefit: {
    /** Child tax credit is unavailable in the tax year a child turns 17 or after. */
    ineligibleFromAgeInTaxYear: 17,
    tables: {
      remarried: remarried as TaxTable,
      'single-no-custody': singleNoCustody as TaxTable,
      'single-has-custody': singleHasCustody as TaxTable,
    } satisfies Record<TaxTableId, TaxTable>,
  },
} as const;

export type Guidelines = typeof guidelines;
