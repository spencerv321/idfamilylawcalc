import { guidelines } from './guidelines/2025-07-01';
import { Decimal, ZERO, sum } from './money';
import { other, type ChildInput, type ParentId } from './types';

export type ChildCustody = 'primary-A' | 'primary-B' | 'shared';
export type CustodyType = 'primary' | 'shared' | 'split' | 'mixed';

export interface ChildCustodyLine {
  id: string;
  overnightsWithA: number;
  /** Share of overnights with each parent (overnights / 365). */
  timeA: Decimal;
  timeB: Decimal;
  custody: ChildCustody;
  /** Form 7 line 6 multiplier: 1.5 for shared and paired split children, else 1. */
  multiplier: Decimal;
  /** Form 7 line 6, 7 and 8 for each parent. */
  allocation: Record<ParentId, Decimal>;
  proportion: Record<ParentId, Decimal>;
  obligation: Record<ParentId, Decimal>;
}

export interface CustodyResult {
  type: CustodyType;
  /** Which official worksheet this calculation corresponds to. */
  form: 6 | 7;
  /** In primary custody, the parent the children live with. */
  custodialParent: ParentId | null;
  children: ChildCustodyLine[];
  /** Form 6/7 line 4: each parent's share of the basic obligation. */
  parentShareOfBasic: Record<ParentId, Decimal>;
  /** Form 7 line 5: line 4 divided by the number of children. */
  perChildAllocation?: Record<ParentId, Decimal>;
  /** Form 6 line 4 / Form 7 line 9: each parent's obligation before offset. */
  obligations: Record<ParentId, Decimal>;
  /** Positive: A pays B. After the cap, before rounding. */
  net: Decimal;
  payer: ParentId | null;
  /** 120(i)(4)(B), (i)(6)(B): most the payer can owe (all children with the other parent). */
  cap: Decimal;
  capApplied: boolean;
  /** Payer's share of all overnights, for the 120(i)(4)(B) majority-time flag. */
  payerOvernightShare: Decimal | null;
}

const days = () => new Decimal(guidelines.daysPerYear);

/**
 * I.R.F.L.P. 120(i)(3)(A)-(B), (i)(4)(A): classify each child by overnights in
 * one calendar year (divided by 365, per Form 7 line 7). A parent with 25% or
 * less of a child's overnights is a non-custodial parent for that child;
 * more than 25% with each parent is shared.
 */
export function classifyChild(child: ChildInput): Pick<ChildCustodyLine, 'timeA' | 'timeB' | 'custody'> {
  const n = child.overnightsWithA;
  if (!Number.isInteger(n) || n < 0 || n > guidelines.daysPerYear) {
    throw new Error(`overnightsWithA for ${child.id} must be an integer from 0 to ${guidelines.daysPerYear}, got ${n}`);
  }
  const timeA = new Decimal(n).div(days());
  const timeB = new Decimal(1).minus(timeA);
  const t = new Decimal(guidelines.primaryThreshold);
  const custody: ChildCustody = timeA.lte(t) ? 'primary-B' : timeB.lte(t) ? 'primary-A' : 'shared';
  return { timeA, timeB, custody };
}

export function custodyType(kinds: ChildCustody[]): CustodyType {
  if (kinds.every((k) => k === 'shared')) return 'shared';
  if (kinds.every((k) => k === 'primary-A') || kinds.every((k) => k === 'primary-B')) return 'primary';
  if (kinds.every((k) => k !== 'shared')) return 'split';
  return 'mixed';
}

/**
 * I.R.F.L.P. 120(i)(3)(B), Form 6: primary physical custody. The non-custodial
 * parent pays their income share of the basic obligation.
 */
export function primary(basicMonthly: Decimal, shares: Record<ParentId, Decimal>, custodialParent: ParentId) {
  const payer = other(custodialParent);
  const parentShareOfBasic = { A: basicMonthly.times(shares.A), B: basicMonthly.times(shares.B) };
  const amount = parentShareOfBasic[payer];
  return {
    parentShareOfBasic,
    obligations: parentShareOfBasic,
    payer: amount.isZero() ? null : payer,
    net: payer === 'A' ? amount : amount.negated(),
  };
}

/**
 * I.R.F.L.P. 120(i)(4)(B) shared, 120(i)(6)(A)-(B) split, and Form 7 (shared,
 * split or mixed): per-child worksheet.
 *
 *   line 5  = basic x income share / number of children
 *   line 6  = line 5 x 1.5 for a shared child or a paired split child, else x 1
 *   line 7  = overnights with the other parent / 365 (>= .75 -> 1, <= .25 -> 0)
 *   line 8  = line 6 x line 7;  line 9 = sum per parent
 *   line 10 = difference, owed by the parent with the larger total
 *
 * Split pairing per 120(i)(6): the 1.5 multiplier applies to an equal number of
 * children in each home (one child in each home for 2+1); the rest carry none.
 * Cap per 120(i)(4)(B) and (i)(6)(B): never more than the payer's share of the
 * basic obligation, i.e. what they would pay with all children in the other home.
 */
export function perChild(
  basicMonthly: Decimal,
  shares: Record<ParentId, Decimal>,
  children: ChildInput[],
): Omit<CustodyResult, 'type' | 'form' | 'custodialParent'> {
  const n = children.length;
  const parentShareOfBasic = { A: basicMonthly.times(shares.A), B: basicMonthly.times(shares.B) };
  const perChildAllocation = { A: parentShareOfBasic.A.div(n), B: parentShareOfBasic.B.div(n) };
  const classified = children.map((c) => ({ child: c, ...classifyChild(c) }));

  const withA = classified.filter((c) => c.custody === 'primary-A');
  const withB = classified.filter((c) => c.custody === 'primary-B');
  const pairs = Math.min(withA.length, withB.length);
  const paired = new Set([...withA.slice(0, pairs), ...withB.slice(0, pairs)].map((c) => c.child.id));

  const multiplier = new Decimal(guidelines.sharedMultiplier);
  const one = new Decimal(1);
  const full = new Decimal(guidelines.form7.fullAtOrAbove);
  const zero = new Decimal(guidelines.form7.zeroAtOrBelow);
  const clamp = (t: Decimal) => (t.gte(full) ? one : t.lte(zero) ? ZERO : t);

  const lines: ChildCustodyLine[] = classified.map((c) => {
    const m = c.custody === 'shared' || paired.has(c.child.id) ? multiplier : one;
    const allocation = { A: perChildAllocation.A.times(m), B: perChildAllocation.B.times(m) };
    // Each parent's obligation runs on the time the child spends with the OTHER parent.
    const proportion = { A: clamp(c.timeB), B: clamp(c.timeA) };
    return {
      id: c.child.id,
      overnightsWithA: c.child.overnightsWithA,
      timeA: c.timeA,
      timeB: c.timeB,
      custody: c.custody,
      multiplier: m,
      allocation,
      proportion,
      obligation: { A: allocation.A.times(proportion.A), B: allocation.B.times(proportion.B) },
    };
  });

  const obligations = {
    A: sum(lines.map((l) => l.obligation.A)),
    B: sum(lines.map((l) => l.obligation.B)),
  };
  const diff = obligations.A.minus(obligations.B);
  const payer: ParentId | null = diff.isZero() ? null : diff.isPositive() ? 'A' : 'B';

  let net = diff;
  let cap = ZERO;
  let capApplied = false;
  let payerOvernightShare: Decimal | null = null;
  if (payer) {
    cap = parentShareOfBasic[payer];
    if (diff.abs().greaterThan(cap)) {
      capApplied = true;
      net = payer === 'A' ? cap : cap.negated();
    }
    const payerNights = sum(lines.map((l) => (payer === 'A' ? l.timeA : l.timeB)));
    payerOvernightShare = payerNights.div(n);
  }

  return { children: lines, parentShareOfBasic, perChildAllocation, obligations, net, payer, cap, capApplied, payerOvernightShare };
}

/** I.R.F.L.P. 120(i)(3)-(6): dispatch to Form 6 (primary) or Form 7 (shared, split, mixed). */
export function custodyAdjustment(
  basicMonthly: Decimal,
  shares: Record<ParentId, Decimal>,
  children: ChildInput[],
): CustodyResult {
  const kinds = children.map((c) => classifyChild(c).custody);
  const type = custodyType(kinds);

  if (type === 'primary') {
    const custodialParent: ParentId = kinds[0] === 'primary-A' ? 'A' : 'B';
    const p = primary(basicMonthly, shares, custodialParent);
    const lines = children.map((c) => {
      const k = classifyChild(c);
      const one = new Decimal(1);
      return {
        id: c.id,
        overnightsWithA: c.overnightsWithA,
        ...k,
        multiplier: one,
        allocation: { A: ZERO, B: ZERO },
        proportion: { A: ZERO, B: ZERO },
        obligation: { A: ZERO, B: ZERO },
      };
    });
    return {
      type,
      form: 6,
      custodialParent,
      children: lines,
      parentShareOfBasic: p.parentShareOfBasic,
      obligations: p.obligations,
      net: p.net,
      payer: p.payer,
      cap: p.payer ? p.parentShareOfBasic[p.payer] : ZERO,
      capApplied: false,
      payerOvernightShare: null,
    };
  }

  return { type, form: 7, custodialParent: null, ...perChild(basicMonthly, shares, children) };
}
