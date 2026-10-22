/**
 * Print-only layouts. Hidden on screen; printView('summary' | 'comparison')
 * selects one via body[data-print]. Plain black-on-white regardless of theme.
 */
import { useMemo } from 'react';
import { stepDownSchedule, type CalculationResult, type CaseInput, type Decimal, type ParentId } from '../../engine';
import { PARENTS, type CaseFacts, type CaseFile } from '../model/case';
import { formatDate, pct, personalize, usd } from '../model/format';
import { evaluate } from './MediationView';

const TYPE = { primary: 'Primary custody', shared: 'Shared custody', split: 'Split custody', mixed: 'Mixed custody' };

export function PrintArea({ c, input, result }: { c: CaseFile; input: CaseInput | null; result: CalculationResult | null }) {
  return (
    <div className="print-area" aria-hidden="true">
      {result && input && <Summary c={c} input={input} r={result} />}
      {c.mediation && <Comparison c={c} />}
    </div>
  );
}

function Header({ c, title }: { c: CaseFile; title: string }) {
  const pet = c.caption.petitioner;
  const res: ParentId = pet === 'A' ? 'B' : 'A';
  return (
    <header className="ps-head">
      <div>
        <h1>{title}</h1>
        <p>
          {c.parents[pet].name} (Petitioner) and {c.parents[res].name} (Respondent)
          {c.caption.caseNumber ? ` · Case No. ${c.caption.caseNumber}` : ''}
          {c.caption.county ? ` · ${c.caption.county} County` : ''}
        </p>
      </div>
      <p className="ps-meta">
        Calculated {formatDate(c.calculationDate)}
        <br />
        Idaho Child Support Guidelines, I.R.F.L.P. 120
      </p>
    </header>
  );
}

function Footer() {
  return (
    <footer className="ps-foot">
      Estimate prepared for discussion under the Idaho Child Support Guidelines. It is not a court order; the court decides the final amount, and
      deviations may apply.
    </footer>
  );
}

const name = (facts: { parents: CaseFacts['parents'] }, p: ParentId) => facts.parents[p].name || `Parent ${p}`;

function adjustments(r: CalculationResult): { label: string; value: Decimal }[] {
  const payer = r.custody.payer ?? r.result.payer;
  const rel = (d: Decimal) => (payer === 'B' ? d.negated() : d);
  return [
    { label: 'Child care', value: rel(r.lines.childCare!) },
    { label: 'Health insurance', value: rel(r.lines.healthInsurance!) },
    { label: 'Tax benefit share', value: rel(r.lines.taxBenefit!) },
    { label: 'Dependency benefit credit', value: r.lines.dependencyCredit!.negated() },
  ].filter((x) => !x.value.isZero());
}

function Summary({ c, input, r }: { c: CaseFile; input: CaseInput; r: CalculationResult }) {
  const rd = r.options.rounding;
  const steps = useMemo(() => {
    try {
      return stepDownSchedule(input);
    } catch {
      return [];
    }
  }, [input]);
  const childName = (id: string) => c.children.find((x) => x.id === id)?.name ?? id;

  return (
    <section className="print-page" data-kind="summary">
      <Header c={c} title="Child Support Summary" />

      <div className="ps-hero">
        {r.result.payer ? (
          <>
            <p className="ps-who">
              {name(c, r.result.payer)} pays {name(c, r.result.recipient!)}
            </p>
            <p className="ps-amount">
              {usd(r.result.totalMonthly, rd)} <span>per month</span>
            </p>
          </>
        ) : (
          <p className="ps-amount">No support owed</p>
        )}
        <p className="ps-type">
          {TYPE[r.custody.type]} · Worksheet Form {r.custody.form}
        </p>
      </div>

      <table className="ps-table">
        <tbody>
          <tr>
            <td>Base support</td>
            <td>{usd(r.result.baseSupport, rd)}</td>
          </tr>
          {adjustments(r).map((a) => (
            <tr key={a.label}>
              <td>{a.label}</td>
              <td>{usd(a.value, rd, { sign: true })}</td>
            </tr>
          ))}
          <tr className="ps-total">
            <td>Total per month</td>
            <td>{usd(r.result.totalMonthly, rd)}</td>
          </tr>
        </tbody>
      </table>

      <h2>Income</h2>
      <table className="ps-table">
        <thead>
          <tr>
            <th />
            {PARENTS.map((p) => (
              <th key={p}>{name(c, p)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Guidelines Income, monthly</td>
            {PARENTS.map((p) => (
              <td key={p}>{usd(r.income[p].guidelinesIncome.monthly)}</td>
            ))}
          </tr>
          <tr>
            <td>Share of combined income</td>
            {PARENTS.map((p) => (
              <td key={p}>{pct(r.shares[p])}</td>
            ))}
          </tr>
          <tr>
            <td>Uncovered medical, dental, vision, counseling</td>
            {PARENTS.map((p) => (
              <td key={p}>{pct(r.shares[p])}</td>
            ))}
          </tr>
        </tbody>
      </table>

      <h2>Children</h2>
      <table className="ps-table">
        <thead>
          <tr>
            <th>Child</th>
            <th>Born</th>
            {PARENTS.map((p) => (
              <th key={p}>Nights with {name(c, p)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.children.included.map((ch) => (
            <tr key={ch.id}>
              <td>{ch.name}</td>
              <td>{formatDate(ch.birthDate)}</td>
              <td>{ch.overnightsWithA}</td>
              <td>{365 - ch.overnightsWithA}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(r.directPayments.length > 0 || r.adjustments.taxBenefit) && (
        <>
          <h2>Also agreed</h2>
          <ul className="ps-list">
            {r.directPayments.map((e, i) => (
              <li key={i}>
                {name(c, e.owedBy)} pays {name(c, e.paidBy)} {usd(e.owed)} per month directly ({pct(e.owed.div(e.monthly))} of{' '}
                {e.kind === 'childCare' ? 'child care' : 'the children’s insurance premium'}).
              </li>
            ))}
            {r.adjustments.taxBenefit && (
              <li>
                {name(c, r.adjustments.taxBenefit.claimedBy)} claims the {r.adjustments.taxBenefit.eligibleChildIds.length === 1 ? 'child' : 'children'} under 17 for
                taxes.
              </li>
            )}
          </ul>
        </>
      )}

      {steps.length > 1 && (
        <>
          <h2>As each child ages out</h2>
          <table className="ps-table">
            <thead>
              <tr>
                <th>Beginning</th>
                <th>Children</th>
                <th>Monthly</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.effectiveDate}>
                  <td>{formatDate(s.effectiveDate)}</td>
                  <td>{s.childIds.length ? s.childIds.map(childName).join(', ') : 'Support ends'}</td>
                  <td>{s.payer ? `${usd(s.totalMonthly, rd)} (${name(c, s.payer)} pays)` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {r.flags.length > 0 && (
        <>
          <h2>Notes</h2>
          <ul className="ps-list small">
            {r.flags.map((f, i) => (
              <li key={i}>
                {personalize(f.message, { A: name(c, 'A'), B: name(c, 'B') })} (I.R.F.L.P. {f.rule})
              </li>
            ))}
          </ul>
        </>
      )}
      <Footer />
    </section>
  );
}

function Comparison({ c }: { c: CaseFile }) {
  const m = c.mediation!;
  const sides = [m.left, m.right].map((s) => ({ s, ev: evaluate(s.facts, c.options) }));
  const rd = c.options.rounding;
  const cell = (fn: (r: CalculationResult, facts: CaseFacts) => string) =>
    sides.map(({ s, ev }, i) => <td key={i}>{ev.result ? fn(ev.result, s.facts) : ev.error}</td>);
  const [l, rr] = sides.map((x) => x.ev.result?.result.signedTotal ?? null);
  let delta = '';
  if (l && rr) {
    const d = rr.minus(l);
    const names = m.right.facts.parents;
    if (!d.isZero()) delta = `${usd(d.abs(), rd)}/mo more toward ${d.isNegative() ? names.A.name : names.B.name} in ${m.right.label}`;
  }

  return (
    <section className="print-page" data-kind="comparison">
      <Header c={c} title="Child Support Proposals" />
      <table className="ps-table ps-compare">
        <colgroup>
          <col style={{ width: '22%' }} />
          <col style={{ width: '39%' }} />
          <col style={{ width: '39%' }} />
        </colgroup>
        <thead>
          <tr>
            <th />
            {sides.map(({ s }, i) => (
              <th key={i}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="ps-total">
            <td>Monthly support</td>
            {cell((r, f) => (r.result.payer ? `${name(f, r.result.payer)} pays ${usd(r.result.totalMonthly, rd)}` : 'None'))}
          </tr>
          <tr>
            <td>Custody</td>
            {cell((r) => TYPE[r.custody.type])}
          </tr>
          <tr>
            <td>Overnights</td>
            {cell((r, f) =>
              r.children.included
                .map((ch) => `${ch.name}: ${ch.overnightsWithA} / ${365 - ch.overnightsWithA}`)
                .join('; ') + ` (${name(f, 'A')} / ${name(f, 'B')})`,
            )}
          </tr>
          <tr>
            <td>Guidelines Income, monthly</td>
            {cell((r, f) => PARENTS.map((p) => `${name(f, p)} ${usd(r.income[p].guidelinesIncome.monthly)}`).join(' · '))}
          </tr>
          <tr>
            <td>Base support</td>
            {cell((r) => usd(r.result.baseSupport, rd))}
          </tr>
          <tr>
            <td>Adjustments</td>
            {cell((r) => adjustments(r).map((a) => `${a.label} ${usd(a.value, rd, { sign: true })}`).join(' · ') || 'None')}
          </tr>
          <tr>
            <td>Claims the children for taxes</td>
            {cell((r, f) => (r.adjustments.taxBenefit ? name(f, r.adjustments.taxBenefit.claimedBy) : 'No children under 17'))}
          </tr>
          <tr>
            <td>Paid directly</td>
            {cell(
              (r, f) =>
                r.directPayments
                  .map((e) => `${name(f, e.owedBy)} pays ${usd(e.owed)} ${e.kind === 'childCare' ? 'child care' : 'insurance'}`)
                  .join(' · ') || 'None',
            )}
          </tr>
        </tbody>
      </table>
      {delta && <p className="ps-delta">Difference: {delta}.</p>}
      <Footer />
    </section>
  );
}
