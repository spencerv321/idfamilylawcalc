import { guidelines, type TaxTableId } from './guidelines/2025-07-01';
import { Decimal, ZERO, sum } from './money';
import { other, type ChildInput, type ParentId, type ParentInput } from './types';

/** Whole-year age a child reaches during the given calendar (tax) year. */
export const ageReachedInYear = (birthDate: string, year: number) => year - Number(birthDate.slice(0, 4));

export interface TaxLookup {
  table: TaxTableId;
  /** The matching row, or null when income is at or below the table's first row. */
  row: { over: number; upTo: number } | null;
  aboveRange: boolean;
  /** Per-child benefits used (first k columns), annual. */
  perChild: Decimal[];
  annual: Decimal;
}

/**
 * I.R.F.L.P. 120(g)(3) tables: a row applies when over < income <= upTo. The
 * total benefit for k children is the sum of the first k "per exemption"
 * columns. Income at or below the first row has no benefit; income above the
 * last row uses the last row and is flagged.
 */
export function lookupTaxBenefit(table: TaxTableId, annualIncome: Decimal, children: number): TaxLookup {
  const rows = guidelines.taxBenefit.tables[table].rows;
  const k = Math.min(children, 5);
  const last = rows[rows.length - 1]!;
  const aboveRange = annualIncome.greaterThan(last.upTo);
  const row = aboveRange ? last : rows.find((r) => annualIncome.greaterThan(r.over) && annualIncome.lte(r.upTo)) ?? null;
  const perChild = row ? row.perChild.slice(0, k).map((v) => new Decimal(v)) : [];
  return { table, row: row && { over: row.over, upTo: row.upTo }, aboveRange, perChild, annual: sum(perChild) };
}

export interface TaxBenefitResult {
  eligibleChildIds: string[];
  /** Parent treated as having custody for table selection. */
  custodialParent: ParentId;
  custodialTieBroken: boolean;
  lookups: Record<ParentId, TaxLookup>;
  claimedBy: ParentId;
  claimTieDefaulted: boolean;
  /** Form 6 line 6c: claiming parent's total benefit / 12. */
  monthlyBenefit: Decimal;
  /** Non-claiming parent's pro rata share of that benefit. */
  nonClaimantShare: Decimal;
  /** Positive: A pays B. */
  signed: Decimal;
}

/**
 * I.R.F.L.P. 120(g)(3) and endnote 4: tax benefit. Children who turn 17 or
 * older in the tax year are excluded. Each parent's benefit comes from the
 * table for their marital status and custody, by their annual Guidelines
 * Income. Unless the parents agree, the exemptions go to the parent with the
 * greater benefit; the other parent receives a pro rata share by income share,
 * as a credit against or addition to support (Form 6 line 6c).
 */
export function taxBenefit(args: {
  taxYear: number;
  children: ChildInput[];
  parents: Record<ParentId, Pick<ParentInput, 'maritalStatus'>>;
  guidelinesIncomeAnnual: Record<ParentId, Decimal>;
  shares: Record<ParentId, Decimal>;
  /** Total overnights per parent across the children, for table selection. */
  overnights: Record<ParentId, number>;
  claimedBy?: ParentId;
  tableOverride?: Partial<Record<ParentId, TaxTableId>>;
}): TaxBenefitResult | null {
  const eligible = args.children.filter(
    (c) => ageReachedInYear(c.birthDate, args.taxYear) < guidelines.taxBenefit.ineligibleFromAgeInTaxYear,
  );
  if (eligible.length === 0) return null;

  // The parent with more overnights has custody. On an exact tie, the IRS
  // tie-breaker (higher AGI) is approximated by higher Guidelines Income.
  let custodialParent: ParentId;
  let custodialTieBroken = false;
  if (args.overnights.A !== args.overnights.B) {
    custodialParent = args.overnights.A > args.overnights.B ? 'A' : 'B';
  } else {
    custodialTieBroken = true;
    custodialParent = args.guidelinesIncomeAnnual.B.greaterThan(args.guidelinesIncomeAnnual.A) ? 'B' : 'A';
  }

  const tableFor = (p: ParentId): TaxTableId =>
    args.tableOverride?.[p] ??
    (args.parents[p].maritalStatus === 'remarried'
      ? 'remarried'
      : p === custodialParent
        ? 'single-has-custody'
        : 'single-no-custody');

  const lookups = {
    A: lookupTaxBenefit(tableFor('A'), args.guidelinesIncomeAnnual.A, eligible.length),
    B: lookupTaxBenefit(tableFor('B'), args.guidelinesIncomeAnnual.B, eligible.length),
  };

  let claimedBy = args.claimedBy;
  let claimTieDefaulted = false;
  if (!claimedBy) {
    const cmp = lookups.A.annual.comparedTo(lookups.B.annual);
    if (cmp === 0) {
      claimTieDefaulted = true;
      claimedBy = custodialParent;
    } else {
      claimedBy = cmp > 0 ? 'A' : 'B';
    }
  }

  const nonClaimant = other(claimedBy);
  const monthlyBenefit = lookups[claimedBy].annual.div(12);
  const nonClaimantShare = monthlyBenefit.times(args.shares[nonClaimant]);
  const signed = claimedBy === 'A' ? nonClaimantShare : nonClaimantShare.negated();

  return {
    eligibleChildIds: eligible.map((c) => c.id),
    custodialParent,
    custodialTieBroken,
    lookups,
    claimedBy,
    claimTieDefaulted,
    monthlyBenefit,
    nonClaimantShare,
    signed: nonClaimantShare.isZero() ? ZERO : signed,
  };
}
