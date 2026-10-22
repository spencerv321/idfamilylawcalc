import { useMemo, useState } from 'react';
import { stepDownSchedule, type CalculationResult, type CaseInput, type Decimal, type ParentId } from '../../engine';
import { PARENTS, type CaseFile } from '../model/case';
import { formatDate, pct, usd } from '../model/format';
import { downloadBlob, safeFilename } from '../model/storage';
import { Section } from './ui';

const TYPE_LABEL = { primary: 'Primary custody', shared: 'Shared custody', split: 'Split custody', mixed: 'Mixed custody' };

export function ResultsPanel(props: { c: CaseFile; input: CaseInput | null; result: CalculationResult | null; error: string | null }) {
  const { c, result, error } = props;
  if (error || !result) {
    return (
      <div className="results">
        <div className="headline empty">
          <p className="eyebrow">Child support</p>
          <p className="empty-msg">{error ?? 'Enter incomes and children to see the calculation.'}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="results">
      <Headline c={c} r={result} />
      <Flags r={result} />
      <FormsBar c={c} r={result} />
      <Worksheet c={c} r={result} />
      {result.adjustments.taxBenefit && <TaxDetail c={c} r={result} />}
      {props.input && <StepDown c={c} input={props.input} />}
    </div>
  );
}

const nm = (c: CaseFile, p: ParentId) => c.parents[p].name || `Parent ${p}`;

/** Payer-relative: positive means the payer pays more. */
const rel = (d: Decimal, payer: ParentId | null) => (payer === 'B' ? d.negated() : d);

export function Headline({ c, r, compact }: { c: CaseFile | { parents: CaseFile['parents'] }; r: CalculationResult; compact?: boolean }) {
  const rd = r.options.rounding;
  const payer = r.result.payer;
  const basePayer = r.custody.payer;
  const lines: { label: string; value: Decimal; cite: string; show: boolean }[] = [
    { label: r.custody.form === 6 ? 'Base support (Form 6 line 5)' : 'Base support (Form 7 line 10)', value: r.result.baseSupport, cite: '120(i)', show: true },
    { label: 'Child care', value: rel(r.lines.childCare!, basePayer ?? payer), cite: '120(g)(1)', show: !r.lines.childCare!.isZero() },
    { label: 'Health insurance', value: rel(r.lines.healthInsurance!, basePayer ?? payer), cite: '120(g)(4)', show: !r.lines.healthInsurance!.isZero() },
    { label: 'Tax benefit share', value: rel(r.lines.taxBenefit!, basePayer ?? payer), cite: '120(g)(3)', show: !r.lines.taxBenefit!.isZero() },
    { label: 'Dependency benefit credit', value: r.lines.dependencyCredit!.negated(), cite: '120(g)(5)', show: !r.lines.dependencyCredit!.isZero() },
  ];
  const parents = c.parents;
  const name = (p: ParentId) => parents[p].name || `Parent ${p}`;
  return (
    <div className={`headline${compact ? ' compact' : ''}`}>
      <div className="headline-top">
        <p className="eyebrow">
          {TYPE_LABEL[r.custody.type]} · Form {r.custody.form}
        </p>
        {payer ? (
          <>
            <p className="who">
              <span className={`parent-tag ${payer}`}>{payer}</span> {name(payer)} pays{' '}
              <span className={`parent-tag ${r.result.recipient}`}>{r.result.recipient}</span> {name(r.result.recipient!)}
            </p>
            <p className="big" aria-live="polite">
              {usd(r.result.totalMonthly, rd)}
              <span className="per">/month</span>
            </p>
          </>
        ) : (
          <p className="big">
            $0<span className="per">/month</span>
          </p>
        )}
      </div>
      {lines.filter((l) => l.show).length > 1 && (
        <dl className="breakdown">
          {lines
            .filter((l) => l.show)
            .map((l, i) => (
              <div key={l.label}>
                <dt>
                  {l.label} <span className="cite">{l.cite}</span>
                </dt>
                <dd>{i === 0 ? usd(l.value, rd) : usd(l.value, rd, { sign: true })}</dd>
              </div>
            ))}
          <div className="total">
            <dt>Total amount to be ordered</dt>
            <dd>{usd(r.result.totalMonthly, rd)}</dd>
          </div>
        </dl>
      )}
      {!compact && r.directPayments.length > 0 && (
        <div className="direct">
          <p className="label">Also paid directly between the parents</p>
          <ul>
            {r.directPayments.map((e, i) => (
              <li key={i}>
                {name(e.owedBy)} pays {name(e.paidBy)} {usd(e.owed)}/mo, {pct(e.owed.div(e.monthly))} of{' '}
                {e.kind === 'childCare' ? 'child care' : 'the insurance premium'} ({usd(e.monthly)})
              </li>
            ))}
          </ul>
        </div>
      )}
      {!compact && r.extendedVisit && (
        <p className="note">
          Extended visits ({r.extendedVisit.days} days): support may abate 50% to {usd(r.extendedVisit.abatedMonthlyRate, rd)}/mo while the
          visit lasts, about {usd(r.extendedVisit.annualReduction)} over the year. <span className="cite">120(i)(5)</span>
        </p>
      )}
    </div>
  );
}

export function Flags({ r, compact }: { r: CalculationResult; compact?: boolean }) {
  if (r.flags.length === 0) return null;
  const info = new Set(['TAX_TIE_DEFAULTED_TO_CUSTODIAL', 'CHILD_EXCLUDED_EMANCIPATED', 'CUSTODY_CAP_APPLIED', 'MINIMUM_APPLIED']);
  return (
    <ul className={`flags${compact ? ' compact' : ''}`}>
      {r.flags.map((f, i) => (
        <li key={i} className={info.has(f.code) ? 'info' : 'warn'}>
          <span className="cite">{f.rule}</span> {f.message}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------

function FormsBar({ c, r }: { c: CaseFile; r: CalculationResult }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (which: 'form5' | 'worksheet' | 'packet') => {
    setBusy(which);
    setErr(null);
    try {
      const { loadForms } = await import('../pdf/load');
      const pdf = await import('../pdf/forms');
      const forms = await loadForms();
      const bytes =
        which === 'form5'
          ? await pdf.fillForm5(forms.form5, c, r)
          : which === 'worksheet'
            ? await pdf.fillWorksheet(forms, c, r)
            : await pdf.fillPacket(forms, c, r);
      const label = which === 'form5' ? 'Form5-Affidavit' : which === 'worksheet' ? `Form${r.custody.form}-Worksheet` : 'Forms';
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${safeFilename(c.title)}-${label}.pdf`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="forms-bar">
      <span className="label">Court forms</span>
      <div className="btn-row">
        <button type="button" className="btn" disabled={!!busy} onClick={() => run('form5')}>
          {busy === 'form5' ? 'Filling…' : 'Form 5 · Affidavit'}
        </button>
        <button type="button" className="btn" disabled={!!busy} onClick={() => run('worksheet')}>
          {busy === 'worksheet' ? 'Filling…' : `Form ${r.custody.form} · Worksheet`}
        </button>
        <button type="button" className="btn primary" disabled={!!busy} onClick={() => run('packet')}>
          {busy === 'packet' ? 'Filling…' : 'Both as one PDF'}
        </button>
      </div>
      {err && <p className="hint error">{err}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Worksheet({ c, r }: { c: CaseFile; r: CalculationResult }) {
  const rd = r.options.rounding;
  const $ = (d: Decimal) => usd(d, rd);
  const $c = (d: Decimal) => usd(d);
  const [brackets, setBrackets] = useState(false);
  return (
    <Section title={`Worksheet · Form ${r.custody.form}`} cite="every line" collapsible defaultOpen>
      <table className="sheet">
        <thead>
          <tr>
            <th />
            {PARENTS.map((p) => (
              <th key={p}>
                <span className={`parent-tag ${p}`}>{p}</span> {nm(c, p)}
              </th>
            ))}
            <th>Combined</th>
          </tr>
        </thead>
        <tbody>
          <tr className="sub">
            <td>Gross income (monthly)</td>
            {PARENTS.map((p) => <td key={p}>{$c(r.income[p].grossIncome.monthly)}</td>)}
            <td />
          </tr>
          <tr className="sub">
            <td>Adjustments 120(f)</td>
            {PARENTS.map((p) => <td key={p}>{r.income[p].totalAdjustments.isZero() ? '—' : `−${$c(r.income[p].totalAdjustments.div(12))}`}</td>)}
            <td />
          </tr>
          <tr>
            <td><span className="ln">1</span>Monthly Guidelines Income</td>
            {PARENTS.map((p) => <td key={p}>{$c(r.income[p].guidelinesIncome.monthly)}</td>)}
            <td>{$c(r.shares.combinedAnnual.div(12))}</td>
          </tr>
          <tr>
            <td><span className="ln">2</span>Share of income</td>
            {PARENTS.map((p) => <td key={p}>{pct(r.shares[p])}</td>)}
            <td>100.00%</td>
          </tr>
          <tr>
            <td>
              <span className="ln">3</span>Basic obligation ({r.basic.children} {r.basic.children === 1 ? 'child' : 'children'}){' '}
              <button type="button" className="link small" onClick={() => setBrackets(!brackets)}>
                {brackets ? 'hide brackets' : 'brackets'}
              </button>
            </td>
            <td />
            <td />
            <td><strong>{$(r.basic.monthly)}</strong></td>
          </tr>
          {brackets &&
            r.basic.brackets.map((b) => (
              <tr key={b.from} className="bracket">
                <td>
                  {b.rate.times(100).toString()}% of ${b.from.toLocaleString()}–${Math.min(b.to, 440000).toLocaleString()}
                </td>
                <td colSpan={2} className="muted">{usd(b.income, 'rule-example')} × {b.rate.times(100).toString()}% ÷ 12</td>
                <td>{$(b.monthly)}</td>
              </tr>
            ))}
          <tr>
            <td><span className="ln">4</span>Each parent’s share of basic</td>
            {PARENTS.map((p) => <td key={p}>{$c(r.custody.parentShareOfBasic[p])}</td>)}
            <td />
          </tr>
          {r.custody.form === 6 ? (
            <tr className="emph">
              <td><span className="ln">5</span>Recommended base support</td>
              {PARENTS.map((p) => <td key={p}>{r.custody.payer === p ? $(r.result.baseSupport) : ''}</td>)}
              <td />
            </tr>
          ) : (
            <>
              <tr>
                <td><span className="ln">5</span>Allocation per child</td>
                {PARENTS.map((p) => <td key={p}>{$c(r.custody.perChildAllocation![p])}</td>)}
                <td />
              </tr>
              {r.custody.children.map((ch, i) => {
                const child = r.children.included[i]!;
                return (
                  <tr key={ch.id} className="child-row">
                    <td>
                      <span className="ln">6–8</span>
                      {child.name ?? ch.id}
                      <span className="muted small">
                        {' '}· {ch.custody === 'shared' ? 'shared' : `with ${ch.custody === 'primary-A' ? nm(c, 'A') : nm(c, 'B')}`} · ×{ch.multiplier.toString()}
                      </span>
                    </td>
                    {PARENTS.map((p) => (
                      <td key={p}>
                        {$c(ch.obligation[p])}
                        <span className="calc">
                          {$c(ch.allocation[p])} × {ch.proportion[p].toDecimalPlaces(4).toString()}
                        </span>
                      </td>
                    ))}
                    <td />
                  </tr>
                );
              })}
              <tr>
                <td><span className="ln">9</span>Each parent’s total</td>
                {PARENTS.map((p) => <td key={p}>{$c(r.custody.obligations[p])}</td>)}
                <td />
              </tr>
              {r.custody.payer && (
                <tr className="sub">
                  <td>Cap: payer’s line 4 · 120(i)(4)(B)</td>
                  {PARENTS.map((p) => <td key={p}>{r.custody.payer === p ? $c(r.custody.cap) + (r.custody.capApplied ? ' (applied)' : '') : ''}</td>)}
                  <td />
                </tr>
              )}
              <tr className="emph">
                <td><span className="ln">10</span>Recommended base support</td>
                {PARENTS.map((p) => <td key={p}>{r.custody.payer === p ? $(r.result.baseSupport) : ''}</td>)}
                <td />
              </tr>
            </>
          )}
        </tbody>
      </table>
    </Section>
  );
}

function TaxDetail({ c, r }: { c: CaseFile; r: CalculationResult }) {
  const t = r.adjustments.taxBenefit!;
  const table = { remarried: 'Remarried', 'single-has-custody': 'Single, has custody', 'single-no-custody': 'Single, no custody' };
  return (
    <Section title="Tax benefit" cite="120(g)(3)" collapsible defaultOpen={false}>
      <table className="sheet">
        <thead>
          <tr>
            <th />
            {PARENTS.map((p) => <th key={p}>{nm(c, p)}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Table</td>
            {PARENTS.map((p) => <td key={p}>{table[t.lookups[p].table]}</td>)}
          </tr>
          <tr>
            <td>Income row</td>
            {PARENTS.map((p) => {
              const row = t.lookups[p].row;
              return <td key={p}>{row ? `$${row.over.toLocaleString()}–$${row.upTo.toLocaleString()}` : 'below table'}</td>;
            })}
          </tr>
          <tr>
            <td>Annual benefit, {t.eligibleChildIds.length} {t.eligibleChildIds.length === 1 ? 'child' : 'children'} under 17</td>
            {PARENTS.map((p) => (
              <td key={p}>
                {usd(t.lookups[p].annual, 'rule-example')}
                {t.claimedBy === p && <span className="badge shared">claims</span>}
              </td>
            ))}
          </tr>
          <tr>
            <td>Monthly benefit × income share</td>
            {PARENTS.map((p) => <td key={p}>{usd(t.monthlyBenefit.times(r.shares[p]))}</td>)}
          </tr>
        </tbody>
      </table>
      <p className="hint">
        {nm(c, t.claimedBy)} claims the {t.eligibleChildIds.length === 1 ? 'child' : 'children'}; {nm(c, t.claimedBy === 'A' ? 'B' : 'A')} is
        entitled to {usd(t.nonClaimantShare)}/mo, applied as a credit against or addition to support.
      </p>
    </Section>
  );
}

function StepDown({ c, input }: { c: CaseFile; input: CaseInput }) {
  const rows = useMemo(() => {
    try {
      return stepDownSchedule(input);
    } catch {
      return null;
    }
  }, [input]);
  if (!rows || rows.length < 2) return null;
  const childName = (id: string) => c.children.find((ch) => ch.id === id)?.name ?? id;
  return (
    <Section title="Step-down schedule" cite="120(j)" collapsible defaultOpen>
      <table className="sheet stepdown">
        <thead>
          <tr>
            <th>Beginning</th>
            <th>Children due support</th>
            <th>Payer</th>
            <th>Monthly</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.effectiveDate}>
              <td>{formatDate(row.effectiveDate)}</td>
              <td>{row.childIds.length ? row.childIds.map(childName).join(', ') : <span className="muted">None; support ends</span>}</td>
              <td>{row.payer ? nm(c, row.payer) : '—'}</td>
              <td>{usd(row.totalMonthly, input.options?.rounding)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Each step is recomputed from the schedule for the remaining children, not a pro rata reduction. Incomes and overnights are held constant.</p>
    </Section>
  );
}
