import { useState, type ReactNode } from 'react';
import { classifyChild, type CalculationResult, type ParentId } from '../../engine';
import { emptyChild, PARENTS, type CaseFacts, type CaseFile, type ParentForm } from '../model/case';
import { ageOn, pct, usd } from '../model/format';
import { MoneyInput, Section, Segmented, TextInput, Toggle } from './ui';

type Update = (mutate: (draft: CaseFile) => void) => void;
type FactsUpdate = (mutate: (draft: CaseFacts) => void) => void;

export function InputPanel({ c, update, result }: { c: CaseFile; update: Update; result: CalculationResult | null }) {
  const factsUpdate: FactsUpdate = (fn) => update((d) => fn(d));
  return (
    <div className="input-panel">
      <CaseSection c={c} update={update} />
      <ParentsSection facts={c} update={factsUpdate} result={result} />
      <ChildrenSection facts={c} update={factsUpdate} />
      <AddOnsSection facts={c} update={factsUpdate} result={result} />
      <ConventionsSection c={c} update={update} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function CaseSection({ c, update }: { c: CaseFile; update: Update }) {
  const [captionOpen, setCaptionOpen] = useState(false);
  return (
    <Section title="Case">
      <div className="grid-2">
        <TextInput label="Case name" value={c.title} onChange={(v) => update((d) => void (d.title = v))} />
        <TextInput
          label="Calculation date"
          type="date"
          value={c.calculationDate}
          onChange={(v) => update((d) => void (d.calculationDate = v))}
        />
      </div>
      <button type="button" className="disclosure" aria-expanded={captionOpen} onClick={() => setCaptionOpen(!captionOpen)}>
        <span className={`chev${captionOpen ? ' open' : ''}`} aria-hidden="true">›</span> Court caption and filer
        <span className="muted"> · printed on Forms 5–7</span>
      </button>
      {captionOpen && (
        <div className="caption-fields">
          <div className="grid-3">
            <TextInput label="Judicial district" value={c.caption.district} placeholder="Fourth" onChange={(v) => update((d) => void (d.caption.district = v))} />
            <TextInput label="County" value={c.caption.county} placeholder="Ada" onChange={(v) => update((d) => void (d.caption.county = v))} />
            <TextInput label="Case number" value={c.caption.caseNumber} onChange={(v) => update((d) => void (d.caption.caseNumber = v))} />
          </div>
          <div className="field">
            <span className="label">Petitioner</span>
            <Segmented
              ariaLabel="Petitioner"
              value={c.caption.petitioner}
              options={PARENTS.map((p) => ({ value: p, label: c.parents[p].name || `Parent ${p}` }))}
              onChange={(v) => update((d) => void (d.caption.petitioner = v))}
            />
          </div>
          <div className="grid-2">
            <TextInput label="Filer name" value={c.caption.filer.name} onChange={(v) => update((d) => void (d.caption.filer.name = v))} />
            <TextInput label="Mailing address" value={c.caption.filer.address} onChange={(v) => update((d) => void (d.caption.filer.address = v))} />
            <TextInput label="City, state, ZIP" value={c.caption.filer.cityStateZip} onChange={(v) => update((d) => void (d.caption.filer.cityStateZip = v))} />
            <TextInput label="Telephone" type="tel" value={c.caption.filer.phone} onChange={(v) => update((d) => void (d.caption.filer.phone = v))} />
            <TextInput label="Email" type="email" value={c.caption.filer.email} onChange={(v) => update((d) => void (d.caption.filer.email = v))} />
          </div>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

type IncomeKey = keyof ParentForm['income'];
type MoneyIncomeKey = Exclude<IncomeKey, 'excludeOvertimeOrSecondJob'>;

const COMMON_INCOME: { key: MoneyIncomeKey; label: string; form?: string }[] = [
  { key: 'wages', label: 'Wages, salary, commissions, bonuses', form: 'A1' },
  { key: 'potentialIncome', label: 'Potential (imputed) income', form: 'E' },
];

const MORE_INCOME: { key: MoneyIncomeKey; label: string; form?: string }[] = [
  { key: 'interestDividendsPensions', label: 'Interest, dividends, pensions, annuities', form: 'A3' },
  { key: 'benefits', label: 'Social security, workers’ comp, unemployment, disability, veterans’', form: 'A4' },
  { key: 'publicAssistance', label: 'Public assistance for self', form: 'A5' },
  { key: 'alimony', label: 'Alimony received', form: 'A6' },
  { key: 'grantsTrusts', label: 'Grants, trust distributions', form: 'A7' },
  { key: 'other', label: 'Other income', form: 'A8' },
  { key: 'employmentBenefits', label: 'Employment benefits (car, housing, phone)', form: 'D' },
];

const BUSINESS: { key: MoneyIncomeKey; label: string; form?: string }[] = [
  { key: 'businessReceipts', label: 'Gross receipts', form: 'A2' },
  { key: 'businessExpenses', label: 'Ordinary and necessary expenses', form: 'A2' },
  { key: 'depreciation', label: 'Straight-line depreciation', form: 'B1' },
  { key: 'selfEmploymentTax', label: 'Self-employment tax paid (half is deducted)', form: 'B2' },
];

function hasAny(facts: CaseFacts, keys: { key: MoneyIncomeKey }[]) {
  return PARENTS.some((p) => keys.some((k) => facts.parents[p].income[k.key].trim() !== ''));
}

function LedgerRow(props: { label: ReactNode; form?: string; children: [ReactNode, ReactNode] }) {
  return (
    <div className="ledger-row">
      <div className="ledger-label">
        {props.label}
        {props.form && <span className="formref">Form 5 {props.form}</span>}
      </div>
      <div className="ledger-cell">{props.children[0]}</div>
      <div className="ledger-cell">{props.children[1]}</div>
    </div>
  );
}

function ParentsSection({ facts, update, result }: { facts: CaseFacts; update: FactsUpdate; result: CalculationResult | null }) {
  const [more, setMore] = useState(() => hasAny(facts, MORE_INCOME));
  const [business, setBusiness] = useState(() => hasAny(facts, BUSINESS));
  const [overtime, setOvertime] = useState(() => PARENTS.some((p) => facts.parents[p].income.overtimeOrSecondJob.trim() !== ''));
  const [adjust, setAdjust] = useState(() =>
    PARENTS.some((p) => {
      const d = facts.parents[p].deductions;
      return d.otherCourtOrders || d.spousalMaintenanceThisCase || d.supportWithoutOrder || d.otherChildrenInHome;
    }),
  );

  const money = (key: MoneyIncomeKey) =>
    PARENTS.map((p) => (
      <MoneyInput
        key={p}
        compact
        ariaLabel={`${facts.parents[p].name || `Parent ${p}`}: ${key}`}
        value={facts.parents[p].income[key]}
        onChange={(v) => update((d) => void (d.parents[p].income[key] = v))}
      />
    )) as [ReactNode, ReactNode];

  const rows = (list: typeof COMMON_INCOME) =>
    list.map((r) => (
      <LedgerRow key={r.key} label={r.label} form={r.form}>
        {money(r.key)}
      </LedgerRow>
    ));

  const deduction = (key: 'otherCourtOrders' | 'spousalMaintenanceThisCase' | 'supportWithoutOrder') =>
    PARENTS.map((p) => (
      <MoneyInput
        key={p}
        compact
        ariaLabel={`${facts.parents[p].name}: ${key}`}
        value={facts.parents[p].deductions[key]}
        onChange={(v) => update((d) => void (d.parents[p].deductions[key] = v))}
      />
    )) as [ReactNode, ReactNode];

  return (
    <Section title="Parents and income" cite="120(e)–(f) · annual amounts">
      <div className="ledger">
        <div className="ledger-row ledger-head">
          <div />
          {PARENTS.map((p) => (
            <div key={p} className="ledger-cell">
              <span className={`parent-tag ${p}`}>{p}</span>
              <input
                className="name-input"
                aria-label={`Parent ${p} name`}
                value={facts.parents[p].name}
                onChange={(e) => update((d) => void (d.parents[p].name = e.target.value))}
              />
            </div>
          ))}
        </div>
        <LedgerRow label="Tax filing status" form={undefined}>
          {
            PARENTS.map((p) => (
              <Segmented
                key={p}
                size="sm"
                ariaLabel={`Parent ${p} marital status`}
                value={facts.parents[p].maritalStatus}
                options={[
                  { value: 'single', label: 'Single' },
                  { value: 'remarried', label: 'Remarried' },
                ]}
                onChange={(v) => update((d) => void (d.parents[p].maritalStatus = v))}
              />
            )) as [ReactNode, ReactNode]
          }
        </LedgerRow>

        <div className="ledger-group">Gross income</div>
        {rows(COMMON_INCOME)}

        {overtime && (
          <>
            <LedgerRow label="Overtime or second-job income" form="A1">
              {money('overtimeOrSecondJob')}
            </LedgerRow>
            <LedgerRow label={<span className="sub">Excluded by court finding · 120(e)(1)(B)</span>}>
              {
                PARENTS.map((p) => (
                  <Toggle
                    key={p}
                    label="Exclude"
                    checked={facts.parents[p].income.excludeOvertimeOrSecondJob}
                    onChange={(v) => update((d) => void (d.parents[p].income.excludeOvertimeOrSecondJob = v))}
                  />
                )) as [ReactNode, ReactNode]
              }
            </LedgerRow>
          </>
        )}
        {business && (
          <>
            <div className="ledger-subgroup">Self-employment, rents, royalties · 120(e)(1)(C)</div>
            {rows(BUSINESS)}
          </>
        )}
        {more && rows(MORE_INCOME)}

        {adjust && (
          <>
            <div className="ledger-group">Adjustments · 120(f)</div>
            <LedgerRow label="Support or maintenance under other orders">{deduction('otherCourtOrders')}</LedgerRow>
            <LedgerRow label="Spousal maintenance ordered in this case">{deduction('spousalMaintenanceThisCase')}</LedgerRow>
            <LedgerRow label="Support paid without order (shown pattern)">{deduction('supportWithoutOrder')}</LedgerRow>
            <LedgerRow label="Other children of another relationship in the home">
              {
                PARENTS.map((p) => (
                  <div key={p} className="count-field">
                    <input
                      type="number"
                      min={0}
                      max={9}
                      aria-label={`Parent ${p} other children in home`}
                      value={facts.parents[p].deductions.otherChildrenInHome}
                      onChange={(e) =>
                        update((d) => void (d.parents[p].deductions.otherChildrenInHome = Math.max(0, Math.min(9, Math.trunc(Number(e.target.value) || 0)))))
                      }
                    />
                    {result && result.income[p].otherChildrenInHome > 0 && (
                      <span className="hint">−{usd(result.income[p].otherChildrenDeduction.annual, result.options.rounding)}/yr</span>
                    )}
                  </div>
                )) as [ReactNode, ReactNode]
              }
            </LedgerRow>
          </>
        )}

        <div className="add-rows">
          {!overtime && <button type="button" className="link" onClick={() => setOvertime(true)}>+ Overtime / second job</button>}
          {!business && <button type="button" className="link" onClick={() => setBusiness(true)}>+ Self-employment</button>}
          {!more && <button type="button" className="link" onClick={() => setMore(true)}>+ Other income types</button>}
          {!adjust && <button type="button" className="link" onClick={() => setAdjust(true)}>+ Adjustments (other orders, maintenance, other children)</button>}
        </div>

        {result && (
          <div className="ledger-totals">
            <LedgerRow label="Gross income">
              {PARENTS.map((p) => <Amount key={p} d={result.income[p].grossIncome.annual} />) as [ReactNode, ReactNode]}
            </LedgerRow>
            <LedgerRow label={<strong>Guidelines Income</strong>}>
              {
                PARENTS.map((p) => (
                  <div key={p} className="amount strong">
                    {usd(result.income[p].guidelinesIncome.annual, 'rule-example')}
                    <span className="hint">{usd(result.income[p].guidelinesIncome.monthly)}/mo · {pct(result.shares[p])}</span>
                  </div>
                )) as [ReactNode, ReactNode]
              }
            </LedgerRow>
          </div>
        )}
      </div>
    </Section>
  );
}

function Amount({ d }: { d: Parameters<typeof usd>[0] }) {
  return <div className="amount">{usd(d, 'rule-example')}</div>;
}

// ---------------------------------------------------------------------------

const custodyLabel = (overnightsWithA: number, names: Record<ParentId, string>) => {
  if (!Number.isInteger(overnightsWithA) || overnightsWithA < 0 || overnightsWithA > 365) return { text: 'Check overnights', cls: 'warn' };
  const k = classifyChild({ id: 'x', birthDate: '2000-01-01', overnightsWithA }).custody;
  if (k === 'shared') return { text: 'Shared', cls: 'shared' };
  return { text: `Lives with ${k === 'primary-A' ? names.A : names.B}`, cls: k === 'primary-A' ? 'A' : 'B' };
};

function ChildrenSection({ facts, update }: { facts: CaseFacts; update: FactsUpdate }) {
  const names = { A: facts.parents.A.name || 'A', B: facts.parents.B.name || 'B' };
  const allSame = facts.children.every((ch) => ch.overnightsWithA === facts.children[0]?.overnightsWithA);
  const [linked, setLinked] = useState(allSame);

  const setNights = (i: number, n: number) =>
    update((d) => {
      const v = Math.max(0, Math.min(365, Math.round(n)));
      if (linked) d.children.forEach((ch) => (ch.overnightsWithA = v));
      else d.children[i]!.overnightsWithA = v;
    });

  return (
    <Section
      title="Children and overnights"
      cite="120(i)(3)–(6) · overnights per year"
      actions={
        facts.children.length > 1 ? (
          <Toggle label="Same schedule for all" checked={linked} onChange={setLinked} />
        ) : undefined
      }
    >
      <div className="children">
        {facts.children.map((ch, i) => {
          const age = ageOn(ch.birthDate, facts.calculationDate);
          const badge = custodyLabel(ch.overnightsWithA, names);
          return (
            <div className="child-card" key={ch.id}>
              <div className="child-top">
                <TextInput
                  label="Name"
                  value={ch.name}
                  onChange={(v) => update((d) => void (d.children[i]!.name = v))}
                />
                <TextInput
                  label={age === null ? 'Birth date' : `Birth date · age ${age}`}
                  type="date"
                  value={ch.birthDate}
                  onChange={(v) => update((d) => void (d.children[i]!.birthDate = v))}
                />
                <TextInput
                  label="HS graduation (if after 18)"
                  type="date"
                  value={ch.highSchoolGraduation}
                  onChange={(v) => update((d) => void (d.children[i]!.highSchoolGraduation = v))}
                />
                {facts.children.length > 1 && (
                  <button
                    type="button"
                    className="icon-btn remove"
                    aria-label={`Remove ${ch.name}`}
                    title="Remove child"
                    onClick={() => update((d) => void d.children.splice(i, 1))}
                  >
                    ×
                  </button>
                )}
              </div>
              <OvernightsSlider
                value={ch.overnightsWithA}
                onChange={(n) => setNights(i, n)}
                names={names}
                badge={badge}
              />
            </div>
          );
        })}
        <button
          type="button"
          className="btn ghost"
          onClick={() =>
            update((d) => {
              const c = emptyChild(d.children.length);
              c.overnightsWithA = d.children[0]?.overnightsWithA ?? 0;
              d.children.push(c);
            })
          }
        >
          + Add child
        </button>
      </div>
    </Section>
  );
}

export function OvernightsSlider(props: {
  value: number;
  onChange: (n: number) => void;
  names: Record<ParentId, string>;
  badge: { text: string; cls: string };
  compact?: boolean;
}) {
  const v = props.value;
  return (
    <div className={`overnights${props.compact ? ' compact' : ''}`}>
      <div className="overnights-row">
        <label className="ov-side A">
          <span>{props.names.A}</span>
          <input
            type="number"
            min={0}
            max={365}
            value={v}
            aria-label={`Overnights with ${props.names.A}`}
            onChange={(e) => props.onChange(Number(e.target.value) || 0)}
          />
        </label>
        <div className="ov-track">
          <input
            type="range"
            min={0}
            max={365}
            value={v}
            aria-label="Overnights split"
            onChange={(e) => props.onChange(Number(e.target.value))}
          />
          {/* 25% thresholds: 91 nights is primary, 92 is shared (Form 7 line 7) */}
          <span className="tick" style={{ left: `${(91.5 / 365) * 100}%` }} aria-hidden="true" />
          <span className="tick" style={{ left: `${(273.5 / 365) * 100}%` }} aria-hidden="true" />
        </div>
        <label className="ov-side B">
          <span>{props.names.B}</span>
          <output aria-label={`Overnights with ${props.names.B}`}>{365 - v}</output>
        </label>
      </div>
      <div className="overnights-meta">
        <span className={`badge ${props.badge.cls}`}>{props.badge.text}</span>
        <span className="muted">
          {((v / 365) * 100).toFixed(1)}% / {(((365 - v) / 365) * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AddOnsSection({ facts, update, result }: { facts: CaseFacts; update: FactsUpdate; result: CalculationResult | null }) {
  const a = facts.addOns;
  const name = (p: ParentId) => facts.parents[p].name || `Parent ${p}`;
  const tax = result?.adjustments.taxBenefit;
  return (
    <Section title="Add-ons and credits" cite="120(g) · monthly amounts">
      <div className="addon">
        <h3>Work-related child care <span className="cite">120(g)(1)</span></h3>
        <div className="grid-2">
          {PARENTS.map((p) => (
            <MoneyInput
              key={p}
              label={`Paid by ${name(p)}`}
              value={a.childCare[p]}
              onChange={(v) => update((d) => void (d.addOns.childCare[p] = v))}
            />
          ))}
        </div>
        <Toggle
          label="Compute inside support"
          hint="Otherwise each parent pays their share directly (the rule's default)."
          checked={a.childCareInSupport}
          onChange={(v) => update((d) => void (d.addOns.childCareInSupport = v))}
        />
      </div>

      <div className="addon">
        <h3>Children’s health insurance premium <span className="cite">120(g)(4)</span></h3>
        <div className="grid-2">
          <MoneyInput label="Monthly premium for the children" value={a.healthInsurance.monthly} onChange={(v) => update((d) => void (d.addOns.healthInsurance.monthly = v))} />
          <div className="field">
            <span className="label">Paid by</span>
            <Segmented
              ariaLabel="Premium paid by"
              value={a.healthInsurance.paidBy}
              options={PARENTS.map((p) => ({ value: p, label: name(p) }))}
              onChange={(v) => update((d) => void (d.addOns.healthInsurance.paidBy = v))}
            />
          </div>
        </div>
        <Toggle
          label="Compute inside support (credit or addition)"
          hint="Otherwise shared directly between the parents."
          checked={a.healthInsurance.inSupport}
          onChange={(v) => update((d) => void (d.addOns.healthInsurance.inSupport = v))}
        />
      </div>

      <div className="addon">
        <h3>Tax exemptions <span className="cite">120(g)(3)</span></h3>
        <Segmented
          ariaLabel="Exemptions claimed by"
          value={a.taxClaimedBy}
          options={[
            { value: 'auto', label: 'Greater benefit (default)' },
            ...PARENTS.map((p) => ({ value: p, label: `${name(p)} claims` })),
          ]}
          onChange={(v) => update((d) => void (d.addOns.taxClaimedBy = v))}
        />
        {tax ? (
          <p className="hint">
            {name(tax.claimedBy)} claims {tax.eligibleChildIds.length} {tax.eligibleChildIds.length === 1 ? 'child' : 'children'} under 17 ·{' '}
            {usd(tax.monthlyBenefit)}/mo benefit; the other parent’s share is {usd(tax.nonClaimantShare)}.
          </p>
        ) : result ? (
          <p className="hint">No children under 17 in the tax year, so there is no tax benefit.</p>
        ) : null}
      </div>

      <div className="grid-2">
        <div className="addon">
          <h3>Extended visits <span className="cite">120(i)(5)</span></h3>
          <TextInput
            label="Days per year in blocks of 14+ (primary custody)"
            type="number"
            min={0}
            max={365}
            value={a.extendedVisitDays}
            onChange={(v) => update((d) => void (d.addOns.extendedVisitDays = v))}
          />
        </div>
        <div className="addon">
          <h3>Dependency benefits <span className="cite">120(g)(5)</span></h3>
          <Segmented
            size="sm"
            ariaLabel="Dependency benefit on account of"
            value={a.dependencyBenefit.onAccountOf}
            options={[{ value: 'none', label: 'None' }, ...PARENTS.map((p) => ({ value: p, label: `${name(p)}’s` }))]}
            onChange={(v) => update((d) => void (d.addOns.dependencyBenefit.onAccountOf = v))}
          />
          {a.dependencyBenefit.onAccountOf !== 'none' && (
            <MoneyInput
              label="SSDI/retirement paid for the children, monthly"
              value={a.dependencyBenefit.monthly}
              onChange={(v) => update((d) => void (d.addOns.dependencyBenefit.monthly = v))}
            />
          )}
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function ConventionsSection({ c, update }: { c: CaseFile; update: Update }) {
  const o = c.options;
  return (
    <Section title="Calculation conventions" cite="see DECISIONS.md" collapsible defaultOpen={false}>
      <p className="muted small">
        Rule 120 leaves these points open. The defaults follow the rule’s own examples; change them to match how your court or opposing counsel computes.
      </p>
      <div className="conventions">
        <div className="field">
          <span className="label">Rounding</span>
          <Segmented
            ariaLabel="Rounding"
            value={o.rounding}
            options={[
              { value: 'rule-example', label: 'Whole dollars per bracket (rule example: $709)' },
              { value: 'exact', label: 'Exact, to the cent ($708.33)' },
            ]}
            onChange={(v) => update((d) => void (d.options.rounding = v))}
          />
        </div>
        <div className="field">
          <span className="label">Income shares</span>
          <Segmented
            ariaLabel="Income share precision"
            value={o.sharePrecision}
            options={[
              { value: 'exact', label: 'Full precision' },
              { value: 'percent-2dp', label: 'Rounded to 0.01% (as printed on Form 6)' },
            ]}
            onChange={(v) => update((d) => void (d.options.sharePrecision = v))}
          />
        </div>
        <div className="field">
          <span className="label">$50 per child minimum · 120(c)(4)</span>
          <Segmented
            ariaLabel="Minimum support"
            value={o.minimumSupport}
            options={[
              { value: 'flag', label: 'Flag only' },
              { value: 'apply', label: 'Apply automatically' },
            ]}
            onChange={(v) => update((d) => void (d.options.minimumSupport = v))}
          />
        </div>
        <div className="field">
          <span className="label">Other children in the home · 120(f)(4)</span>
          <Segmented
            ariaLabel="Other children table"
            value={o.otherChildrenTable}
            options={[
              { value: 'one-child-each', label: 'One-child table per child' },
              { value: 'n-child', label: 'n-child table' },
            ]}
            onChange={(v) => update((d) => void (d.options.otherChildrenTable = v))}
          />
        </div>
        <Toggle
          label="Add dependency benefits to the disabled/retired parent’s income · 120(e)(1)(A)"
          checked={o.dependencyBenefitAsIncome}
          onChange={(v) => update((d) => void (d.options.dependencyBenefitAsIncome = v))}
        />
      </div>
    </Section>
  );
}
