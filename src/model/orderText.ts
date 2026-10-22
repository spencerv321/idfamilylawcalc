/**
 * Draft judgment language. I.R.F.L.P. 120(j) requires the judgment to state
 * total support for all children, the due date, and the support due for the
 * remaining children as each is no longer entitled. 120(g)(3) and (g)(4)
 * add the exemption, Form 8332, and health-expense terms.
 *
 * This is a drafting aid: plain, conventional wording the attorney edits.
 */
import { emancipationDate, type CalculationResult, type ChildInput, type Decimal, type ParentId, type StepDownRow } from '../../engine';
import type { CaseFile } from './case';
import { pct } from './format';

const money = (d: Decimal) => `$${d.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

const number = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n] ?? String(n);

/** First day of the month after the calculation date. */
export function defaultStartDate(calculationDate: string): string {
  const [y, m] = calculationDate.split('-').map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

export interface OrderTextOptions {
  startDate: string;
  /** Day of the month payments are due. */
  dueDay: number;
}

export function orderText(c: CaseFile, r: CalculationResult, steps: StepDownRow[], o: OrderTextOptions): string {
  const role = (p: ParentId) => (c.caption.petitioner === p ? 'Petitioner' : 'Respondent');
  const who = (p: ParentId) => `${role(p)}, ${c.parents[p].name || `Parent ${p}`},`;
  const short = (p: ParentId) => role(p);
  const childName = (ch: ChildInput) => ch.name || ch.id;
  const byId = new Map(c.children.map((ch) => [ch.id, ch]));
  const due = `${o.dueDay}${['th', 'st', 'nd', 'rd'][o.dueDay % 10 > 3 || [11, 12, 13].includes(o.dueDay) ? 0 : o.dueDay % 10]}`;

  const paras: string[] = [];
  const kids = r.children.included;

  // 1. Support amount and due date.
  if (r.result.payer) {
    const payer = r.result.payer;
    paras.push(
      `Child support. Commencing ${formatLong(o.startDate)}, ${who(payer)} shall pay to ${who(r.result.recipient!)} child support of ` +
        `${money(r.result.totalMonthly)} per month for the parties' ${number(kids.length)} minor ${kids.length === 1 ? 'child' : 'children'}, ` +
        `${list(kids.map(childName))}, due on the ${due} day of each month.` +
        breakdown(r),
    );
  } else {
    paras.push(`Child support. Under the Idaho Child Support Guidelines neither party owes child support to the other as of ${formatLong(o.startDate)}.`);
  }

  // 2. Step-down per 120(j).
  for (const step of steps.slice(1)) {
    const leaving = kids.filter((k) => emancipationDate(k) === step.effectiveDate);
    const reason = leaving.map((k) => {
      const hs = k.highSchoolGraduation && k.highSchoolGraduation === step.effectiveDate;
      return `${childName(k)}'s ${hs ? 'graduation from high school' : 'eighteenth birthday'}`;
    });
    const remaining = step.childIds.map((id) => byId.get(id)?.name || id);
    if (step.childIds.length === 0) {
      paras.push(`Child support shall terminate on ${formatLong(step.effectiveDate)}, upon ${list(reason)}.`);
    } else if (step.payer) {
      paras.push(
        `Upon ${list(reason)} on ${formatLong(step.effectiveDate)}, ${short(step.payer)} shall pay ${short(step.payer === 'A' ? 'B' : 'A')} ` +
          `${money(step.totalMonthly)} per month for the remaining ${step.childIds.length === 1 ? 'child' : `${number(step.childIds.length)} children`}, ${list(remaining)}.`,
      );
    } else {
      paras.push(`Upon ${list(reason)} on ${formatLong(step.effectiveDate)}, neither party shall owe child support for ${list(remaining)}.`);
    }
  }
  const hsKids = kids.filter((k) => k.highSchoolGraduation);
  if (hsKids.length) {
    paras.push(
      `Support for a child who is pursuing a high school education continues until graduation, but not beyond the child's nineteenth birthday (I.R.F.L.P. 120(a)). ` +
        `The dates above assume ${list(hsKids.map((k) => `${childName(k)} graduates on ${formatLong(k.highSchoolGraduation!)}`))}.`,
    );
  }

  // 3. Health insurance and uncovered expenses, 120(g)(4).
  const s = r.shares;
  const hi = r.adjustments.healthInsurance[0];
  if (hi) {
    const other: ParentId = hi.paidBy === 'A' ? 'B' : 'A';
    paras.push(
      `Health insurance. ${who(hi.paidBy)} shall maintain health insurance for the children. The children's portion of the premium, currently ${money(hi.monthly)} per month, ` +
        (hi.inSupport
          ? `is accounted for in the support amount above.`
          : `shall be shared ${pct(s[hi.paidBy])} by ${short(hi.paidBy)} and ${pct(s[other])} by ${short(other)}; ${short(other)} shall pay ${money(hi.owed)} per month directly to ${short(hi.paidBy)}.`),
    );
  }
  paras.push(
    `Health care expenses not covered by insurance, including orthodontic, optical, dental, psychological, and prescription expenses, shall be paid ` +
      `${pct(s.A)} by ${short('A')} and ${pct(s.B)} by ${short('B')}. Any such expense resulting in an out-of-pocket cost to the other party of more than $500 ` +
      `for the course of treatment must be approved in advance, in writing, by both parties or by prior court order (I.R.F.L.P. 120(g)(4)(B)).`,
  );

  // 4. Child care, 120(g)(1).
  const cc = r.adjustments.childCare;
  if (cc.length) {
    paras.push(
      `Child care. Reasonable work-related child care costs shall be shared ${pct(s.A)} by ${short('A')} and ${pct(s.B)} by ${short('B')}` +
        (cc.some((e) => e.inSupport)
          ? `; the current cost is accounted for in the support amount above.`
          : `, paid directly between the parties. ` +
            cc.map((e) => `${short(e.owedBy)} shall pay ${money(e.owed)} per month toward the ${money(e.monthly)} paid by ${short(e.paidBy)}.`).join(' ')),
    );
  }

  // 5. Tax exemptions, 120(g)(3).
  const tax = r.adjustments.taxBenefit;
  if (tax) {
    const eligible = tax.eligibleChildIds.map((id) => byId.get(id)?.name || id);
    let t =
      `Tax exemptions. ${who(tax.claimedBy)} shall be entitled to claim ${list(eligible)} as dependents for federal and state income tax purposes, ` +
      `and the other party shall not claim ${eligible.length === 1 ? 'that child' : 'them'}.`;
    // 120(g)(3): when the noncustodial parent claims, the judgment must require Form 8332.
    if (tax.claimedBy !== tax.custodialParent) {
      t += ` ${short(tax.custodialParent)} shall sign and deliver to ${short(tax.claimedBy)} IRS Form 8332, and any other form needed to allow ${short(tax.claimedBy)} to claim the exemptions, by January 31 of each year.`;
    }
    paras.push(t);
  }

  // 6. Dependency benefits, 120(g)(5).
  const dep = r.adjustments.dependencyBenefit;
  if (dep?.applied) {
    paras.push(
      `Dependency benefits. The support amount reflects a credit of ${money(dep.credit)} per month for disability or retirement dependency benefits paid to ` +
        `${short(dep.onAccountOf === 'A' ? 'B' : 'A')} on account of ${short(dep.onAccountOf)}. ${short(dep.onAccountOf)} is not entitled to reimbursement of benefits exceeding the support amount (I.R.F.L.P. 120(g)(5)).`,
    );
  }

  // 7. Guidelines statement.
  paras.push(
    `The support amounts above were calculated under the Idaho Child Support Guidelines, I.R.F.L.P. 120, using combined monthly Guidelines Income of ` +
      `${money(r.shares.combinedAnnual.div(12))} (${short('A')} ${pct(s.A)}, ${short('B')} ${pct(s.B)}). The Child Support Worksheet is attached.`,
  );

  return paras.join('\n\n');
}

function breakdown(r: CalculationResult): string {
  const parts: string[] = [];
  const payer = r.result.payer!;
  const rel = (d: Decimal) => (payer === 'A' ? d : d.negated());
  const add = (label: string, d: Decimal) => {
    if (d.isZero()) return;
    parts.push(d.isNegative() ? `a credit of ${money(d.abs())} for ${label}` : `${money(d)} for ${label}`);
  };
  add('health insurance premiums', rel(r.lines.healthInsurance!));
  add('child care', rel(r.lines.childCare!));
  add('the tax benefit', rel(r.lines.taxBenefit!));
  if (!r.lines.dependencyCredit!.isZero()) parts.push(`a credit of ${money(r.lines.dependencyCredit!)} for dependency benefits`);
  if (!parts.length) return '';
  return ` This amount consists of ${list([`base support of ${money(r.result.baseSupport)}`, ...parts])}.`;
}

function formatLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

