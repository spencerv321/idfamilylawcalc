/**
 * The saved case: what the user types, shaped like the court forms. Money is
 * kept as the raw string the user entered so the form never fights their
 * typing; toEngineInput() parses it. Income and deductions are ANNUAL (Form 5);
 * add-on expenses are MONTHLY (Forms 6-7).
 */
import { DEFAULT_OPTIONS, Decimal, type CaseInput, type EngineOptions, type ParentId } from '../../engine';

export const PARENTS: ParentId[] = ['A', 'B'];

export interface ParentForm {
  name: string;
  maritalStatus: 'single' | 'remarried';
  income: {
    wages: string; // Form 5 A1
    overtimeOrSecondJob: string;
    excludeOvertimeOrSecondJob: boolean; // 120(e)(1)(B) finding
    businessReceipts: string; // Form 5 A2 (with expenses)
    businessExpenses: string;
    depreciation: string; // Form 5 B1
    selfEmploymentTax: string; // full SE tax; B2 shows half
    interestDividendsPensions: string; // A3
    benefits: string; // A4: social security, workers' comp, unemployment, disability, veterans'
    publicAssistance: string; // A5
    alimony: string; // A6
    grantsTrusts: string; // A7
    other: string; // A8
    employmentBenefits: string; // D
    potentialIncome: string; // E
  };
  deductions: {
    otherCourtOrders: string; // 120(f)(1)
    spousalMaintenanceThisCase: string; // 120(f)(2)
    supportWithoutOrder: string; // 120(f)(3)
    otherChildrenInHome: number; // 120(f)(4)
  };
}

export interface ChildForm {
  id: string;
  name: string;
  birthDate: string;
  overnightsWithA: number;
  highSchoolGraduation: string;
}

export interface AddOnsForm {
  childCare: Record<ParentId, string>;
  childCareInSupport: boolean;
  healthInsurance: { paidBy: ParentId; monthly: string; inSupport: boolean };
  taxClaimedBy: 'auto' | ParentId;
  extendedVisitDays: string;
  dependencyBenefit: { onAccountOf: ParentId | 'none'; monthly: string };
}

/** Everything that changes the numbers. Mediation scenarios are copies of this. */
export interface CaseFacts {
  calculationDate: string;
  parents: Record<ParentId, ParentForm>;
  children: ChildForm[];
  addOns: AddOnsForm;
}

export interface Caption {
  district: string;
  county: string;
  caseNumber: string;
  petitioner: ParentId;
  /** Party filing the documents (top-left block on Forms 5-7). */
  filer: { name: string; address: string; cityStateZip: string; phone: string; email: string };
}

export interface Scenario {
  label: string;
  facts: CaseFacts;
}

export interface CaseFile extends CaseFacts {
  schema: 'idaho-child-support-case';
  version: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  caption: Caption;
  options: EngineOptions;
  mediation: { left: Scenario; right: Scenario } | null;
  /** Judgment wording: first payment date ('' = first of next month) and due day. */
  order: { startDate: string; dueDay: number };
}

export const today = () => new Date().toISOString().slice(0, 10);
export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function emptyParent(name: string): ParentForm {
  return {
    name,
    maritalStatus: 'single',
    income: {
      wages: '',
      overtimeOrSecondJob: '',
      excludeOvertimeOrSecondJob: false,
      businessReceipts: '',
      businessExpenses: '',
      depreciation: '',
      selfEmploymentTax: '',
      interestDividendsPensions: '',
      benefits: '',
      publicAssistance: '',
      alimony: '',
      grantsTrusts: '',
      other: '',
      employmentBenefits: '',
      potentialIncome: '',
    },
    deductions: { otherCourtOrders: '', spousalMaintenanceThisCase: '', supportWithoutOrder: '', otherChildrenInHome: 0 },
  };
}

export function emptyChild(index: number): ChildForm {
  return { id: newId(), name: `Child ${index + 1}`, birthDate: '', overnightsWithA: 0, highSchoolGraduation: '' };
}

export function newCase(): CaseFile {
  const now = new Date().toISOString();
  return {
    schema: 'idaho-child-support-case',
    version: 1,
    id: newId(),
    title: 'Untitled case',
    createdAt: now,
    updatedAt: now,
    calculationDate: today(),
    caption: {
      district: '',
      county: '',
      caseNumber: '',
      petitioner: 'A',
      filer: { name: '', address: '', cityStateZip: '', phone: '', email: '' },
    },
    parents: { A: emptyParent('Parent A'), B: emptyParent('Parent B') },
    children: [emptyChild(0)],
    addOns: {
      childCare: { A: '', B: '' },
      childCareInSupport: false,
      healthInsurance: { paidBy: 'A', monthly: '', inSupport: false },
      taxClaimedBy: 'auto',
      extendedVisitDays: '',
      dependencyBenefit: { onAccountOf: 'none', monthly: '' },
    },
    options: { ...DEFAULT_OPTIONS },
    mediation: null,
    order: { startDate: '', dueDay: 1 },
  };
}

export const factsOf = (c: CaseFacts): CaseFacts => structuredClone({
  calculationDate: c.calculationDate,
  parents: c.parents,
  children: c.children,
  addOns: c.addOns,
});

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** "$60,000.50" -> "60000.50"; blank -> "0"; anything else -> null (invalid). */
export function parseMoney(raw: string): string | null {
  const s = raw.replace(/[$,\s]/g, '');
  if (s === '') return '0';
  return /^-?\d+(\.\d+)?$/.test(s) ? s : null;
}

export const isValidMoney = (raw: string) => parseMoney(raw) !== null;
const m = (raw: string) => parseMoney(raw) ?? '0';

export class InputError extends Error {}

/** Translate the form-shaped case into the engine's CaseInput. */
export function toEngineInput(facts: CaseFacts, options: EngineOptions): CaseInput {
  const parent = (p: ParentForm) => {
    const i = p.income;
    const otherIncome = [i.interestDividendsPensions, i.benefits, i.publicAssistance, i.alimony, i.grantsTrusts, i.other]
      .reduce((acc, v) => acc.plus(m(v)), new Decimal(0))
      .toString();
    return {
      name: p.name,
      maritalStatus: p.maritalStatus,
      income: {
        wages: m(i.wages),
        overtimeOrSecondJob: m(i.overtimeOrSecondJob),
        excludeOvertimeOrSecondJob: i.excludeOvertimeOrSecondJob,
        business: {
          grossReceipts: m(i.businessReceipts),
          ordinaryAndNecessaryExpenses: m(i.businessExpenses),
          straightLineDepreciation: m(i.depreciation),
          selfEmploymentTax: m(i.selfEmploymentTax),
        },
        otherIncome,
        employmentBenefits: m(i.employmentBenefits),
        potentialIncome: m(i.potentialIncome),
      },
      deductions: {
        otherCourtOrders: m(p.deductions.otherCourtOrders),
        spousalMaintenanceThisCase: m(p.deductions.spousalMaintenanceThisCase),
        supportWithoutOrder: m(p.deductions.supportWithoutOrder),
        otherChildrenInHome: p.deductions.otherChildrenInHome,
      },
    };
  };

  const children = facts.children.map((c, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.birthDate)) throw new InputError(`Enter a birth date for ${c.name || `child ${i + 1}`}.`);
    return {
      id: c.id,
      name: c.name,
      birthDate: c.birthDate,
      overnightsWithA: c.overnightsWithA,
      highSchoolGraduation: c.highSchoolGraduation || undefined,
    };
  });
  if (children.length === 0) throw new InputError('Add at least one child.');

  const a = facts.addOns;
  const childCare = PARENTS.filter((p) => Number(m(a.childCare[p])) > 0).map((p) => ({
    paidBy: p,
    monthly: m(a.childCare[p]),
    inSupport: a.childCareInSupport,
  }));
  const premium = m(a.healthInsurance.monthly);
  const visitDays = a.extendedVisitDays.trim() === '' ? undefined : Number(a.extendedVisitDays);

  return {
    calculationDate: facts.calculationDate,
    parents: { A: parent(facts.parents.A), B: parent(facts.parents.B) },
    children,
    addOns: {
      childCare,
      healthInsurance: Number(premium) > 0 ? [{ ...a.healthInsurance, monthly: premium }] : [],
      taxExemptionClaimedBy: a.taxClaimedBy === 'auto' ? undefined : a.taxClaimedBy,
      extendedVisitDays: visitDays !== undefined && Number.isFinite(visitDays) ? visitDays : undefined,
      dependencyBenefit:
        a.dependencyBenefit.onAccountOf !== 'none' && Number(m(a.dependencyBenefit.monthly)) > 0
          ? { onAccountOf: a.dependencyBenefit.onAccountOf, monthly: m(a.dependencyBenefit.monthly) }
          : undefined,
    },
    options,
  };
}

/** Bring an imported or older saved case up to the current shape. */
export function normalizeCase(raw: unknown): CaseFile {
  const c = raw as Partial<CaseFile>;
  if (!c || c.schema !== 'idaho-child-support-case') throw new Error('This file is not an Idaho child support case export.');
  if (c.version !== 1) throw new Error(`Unsupported case file version ${String(c.version)}.`);
  const base = newCase();
  return {
    ...base,
    ...c,
    caption: { ...base.caption, ...c.caption, filer: { ...base.caption.filer, ...c.caption?.filer } },
    options: { ...base.options, ...c.options },
    addOns: { ...base.addOns, ...c.addOns },
    parents: {
      A: { ...emptyParent('Parent A'), ...c.parents?.A },
      B: { ...emptyParent('Parent B'), ...c.parents?.B },
    },
    children: c.children ?? base.children,
    mediation: c.mediation ?? null,
    order: { ...base.order, ...c.order },
  } as CaseFile;
}
