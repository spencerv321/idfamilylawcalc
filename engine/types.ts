import type { Decimal, MoneyInput } from './money';
import type { TaxTableId } from './guidelines/2025-07-01';

export type ParentId = 'A' | 'B';
export const other = (p: ParentId): ParentId => (p === 'A' ? 'B' : 'A');

// ---------------------------------------------------------------------------
// Options. Each open interpretation in SPEC.md is a named option; see DECISIONS.md.
// ---------------------------------------------------------------------------

export interface EngineOptions {
  /**
   * D-001. 'rule-example': round each bracket's monthly amount to the dollar
   * and sum (the 120(i)(3) example's $709); worksheet lines are whole dollars.
   * 'exact': full precision; worksheet lines rounded to cents.
   */
  rounding: 'rule-example' | 'exact';
  /** D-008. Use income shares at full precision, or rounded to 0.01% as Form 6 prints them. */
  sharePrecision: 'exact' | 'percent-2dp';
  /** D-006. The 120(c)(4) $50/child minimum: flag only, or raise support to it. */
  minimumSupport: 'flag' | 'apply';
  /** D-009. 120(f)(4) deduction: one-child table per other child, or the n-child table for n children. */
  otherChildrenTable: 'one-child-each' | 'n-child';
  /** D-013. Add dependency benefits to the disabled/retired parent's gross income per 120(e)(1)(A). */
  dependencyBenefitAsIncome: boolean;
}

export const DEFAULT_OPTIONS: EngineOptions = {
  rounding: 'rule-example',
  sharePrecision: 'exact',
  minimumSupport: 'flag',
  otherChildrenTable: 'one-child-each',
  dependencyBenefitAsIncome: true,
};

// ---------------------------------------------------------------------------
// Inputs. All income and deduction amounts are ANNUAL dollars (as on Form 5);
// add-on expenses are MONTHLY dollars (as on Forms 6 and 7).
// ---------------------------------------------------------------------------

export interface BusinessIncomeInput {
  /** 120(e)(1)(C) */
  grossReceipts?: MoneyInput;
  ordinaryAndNecessaryExpenses?: MoneyInput;
  /** 120(e)(1)(C)(i), straight-line over the ADS recovery period. */
  straightLineDepreciation?: MoneyInput;
  /** 120(e)(1)(C)(ii): the full self-employment tax paid; the engine deducts half. */
  selfEmploymentTax?: MoneyInput;
}

export interface IncomeInput {
  /** Salaries, wages, commissions, bonuses (Form 5 A1). */
  wages?: MoneyInput;
  /** 120(e)(1)(B): overtime or second-job income, counted unless excluded. */
  overtimeOrSecondJob?: MoneyInput;
  /** The court's 120(e)(1)(B) finding that overtime/second-job income is excluded. */
  excludeOvertimeOrSecondJob?: boolean;
  /** Rents, royalties, trade or business income (Form 5 A2, B1, B2). */
  business?: BusinessIncomeInput;
  /** Everything else in 120(e)(1)(A): interest, pensions, benefits, alimony received, etc. */
  otherIncome?: MoneyInput;
  /** 120(e)(2): significant employment benefits (Form 5 D). */
  employmentBenefits?: MoneyInput;
  /** 120(e)(3): potential (imputed) income (Form 5 E). */
  potentialIncome?: MoneyInput;
}

export interface DeductionInput {
  /** 120(f)(1): child support or spousal maintenance ordered in other cases. */
  otherCourtOrders?: MoneyInput;
  /** 120(f)(2): spousal maintenance ordered in this case. */
  spousalMaintenanceThisCase?: MoneyInput;
  /** 120(f)(3): unordered support for a child of another relationship, with a shown pattern. */
  supportWithoutOrder?: MoneyInput;
  /** 120(f)(4): natural or adopted children of another relationship living in this parent's home. */
  otherChildrenInHome?: number;
}

export interface ParentInput {
  name?: string;
  income: IncomeInput;
  deductions?: DeductionInput;
  /** Selects the 120(g)(3) tax table. */
  maritalStatus: 'single' | 'remarried';
}

export interface ChildInput {
  id: string;
  name?: string;
  /** ISO date, YYYY-MM-DD. */
  birthDate: string;
  /** Overnights per year with parent A; parent B has the rest of 365. */
  overnightsWithA: number;
  /** If the child will still be in high school at 18, the expected graduation date. */
  highSchoolGraduation?: string;
}

export interface ExpenseInput {
  paidBy: ParentId;
  /** Monthly dollars for the children. */
  monthly: MoneyInput;
  /** true: computed inside support as a credit/addition. false: paid directly between parents. */
  inSupport?: boolean;
}

export interface AddOnInput {
  /** 120(g)(1): work-related child care. Paid directly unless inSupport. */
  childCare?: ExpenseInput[];
  /** 120(g)(4): children's health insurance premium. Paid directly unless inSupport. */
  healthInsurance?: ExpenseInput[];
  /** 120(g)(3): who claims the children. Omit to assign to the parent with the greater benefit. */
  taxExemptionClaimedBy?: ParentId;
  /** 120(g)(3): override which table each parent uses (normally derived from marital status and custody). */
  taxTableOverride?: Partial<Record<ParentId, TaxTableId>>;
  /** 120(i)(5): days per year the paying parent has the children in blocks of 14+ consecutive days. */
  extendedVisitDays?: number;
  /** 120(g)(5): dependency benefits paid to the other parent because of this parent's disability or retirement. */
  dependencyBenefit?: { onAccountOf: ParentId; monthly: MoneyInput };
}

export interface CaseInput {
  /** ISO date the calculation is made as of; drives ages and the tax year. */
  calculationDate: string;
  parents: Record<ParentId, ParentInput>;
  children: ChildInput[];
  addOns?: AddOnInput;
  options?: Partial<EngineOptions>;
}

// ---------------------------------------------------------------------------
// Outputs. Every step returns its intermediate lines for the UI and the forms.
// ---------------------------------------------------------------------------

export type FlagCode =
  | 'LOW_INCOME_REVIEW'
  | 'BELOW_MINIMUM'
  | 'MINIMUM_APPLIED'
  | 'INCOME_OVER_CAP'
  | 'MORE_THAN_FIVE_CHILDREN'
  | 'PAYER_HAS_MAJORITY_TIME'
  | 'CUSTODY_CAP_APPLIED'
  | 'DIRECTION_REVERSED_BY_ADJUSTMENTS'
  | 'TAX_TABLE_ABOVE_RANGE'
  | 'TAX_MORE_THAN_FIVE_CHILDREN'
  | 'TAX_TIE_DEFAULTED_TO_CUSTODIAL'
  | 'ZERO_COMBINED_INCOME'
  | 'CHILD_EXCLUDED_EMANCIPATED'
  | 'EXTENDED_VISIT_NOT_APPLICABLE'
  | 'DEPENDENCY_BENEFIT_NOT_APPLIED'
  | 'NEGATIVE_GUIDELINES_INCOME';

export interface Flag {
  code: FlagCode;
  rule: string;
  message: string;
}

/** One printable line of work, e.g. "Line 4. Each parent's support obligation". */
export interface Line {
  key: string;
  label: string;
  rule: string;
  A?: Decimal;
  B?: Decimal;
  combined?: Decimal;
}

/** Positive means A pays B; negative means B pays A. */
export type SignedAmount = Decimal;
