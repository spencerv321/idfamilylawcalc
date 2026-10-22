import { useMemo, type ReactNode } from 'react';
import { calculate, classifyChild, type CalculationResult, type CaseInput, type Decimal, type ParentId } from '../../engine';
import { factsOf, InputError, PARENTS, toEngineInput, type CaseFacts, type CaseFile, type Scenario } from '../model/case';
import { usd } from '../model/format';
import { OvernightsChart } from './OvernightsChart';
import { OvernightsSlider } from './InputPanel';
import { Flags, Headline } from './ResultsPanel';
import { MoneyInput, Segmented, Toggle } from './ui';

type Update = (mutate: (draft: CaseFile) => void) => void;
type Side = 'left' | 'right';

function evaluate(facts: CaseFacts, options: CaseFile['options']): { input: CaseInput | null; result: CalculationResult | null; error: string | null } {
  try {
    const input = toEngineInput(facts, options);
    return { input, result: calculate(input), error: null };
  } catch (e) {
    return { input: null, result: null, error: e instanceof InputError ? e.message : `Can’t calculate: ${(e as Error).message}` };
  }
}

export function MediationView({ c, update }: { c: CaseFile; update: Update }) {
  if (!c.mediation) {
    return (
      <div className="mediation-empty">
        <h2>Mediation mode</h2>
        <p>
          Put two versions of this case side by side and adjust them live: overnights, incomes, who claims the children, insurance and child care. Each
          change recalculates instantly. The case itself is untouched until you apply a scenario.
        </p>
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            update((d) => {
              d.mediation = {
                left: { label: 'Proposal 1', facts: factsOf(d) },
                right: { label: 'Proposal 2', facts: factsOf(d) },
              };
            })
          }
        >
          Start from this case
        </button>
      </div>
    );
  }

  return <Session c={c} update={update} />;
}

function Session({ c, update }: { c: CaseFile; update: Update }) {
  const m = c.mediation!;
  const left = useMemo(() => evaluate(m.left.facts, c.options), [m.left.facts, c.options]);
  const right = useMemo(() => evaluate(m.right.facts, c.options), [m.right.facts, c.options]);

  const signed = (r: CalculationResult | null) => r?.result.signedTotal ?? null;
  const sl = signed(left.result);
  const sr = signed(right.result);

  return (
    <div className="mediation">
      <div className="mediation-bar">
        <p className="muted">Changes here don’t touch the case until you apply a scenario.</p>
        <div className="btn-row">
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              update((d) => {
                d.mediation = { left: { ...d.mediation!.left, facts: factsOf(d) }, right: { ...d.mediation!.right, facts: factsOf(d) } };
              })
            }
          >
            Reset both to case
          </button>
          <button type="button" className="btn ghost" onClick={() => update((d) => void (d.mediation = null))}>
            End session
          </button>
        </div>
      </div>
      <div className="scenarios">
        {(['left', 'right'] as Side[]).map((side) => {
          const ev = side === 'left' ? left : right;
          const mine = side === 'left' ? sl : sr;
          const theirs = side === 'left' ? sr : sl;
          return (
            <ScenarioPanel
              key={side}
              c={c}
              side={side}
              scenario={m[side]}
              ev={ev}
              delta={side === 'right' && mine && theirs ? mine.minus(theirs) : null}
              otherLabel={m.left.label}
              update={update}
            />
          );
        })}
      </div>
    </div>
  );
}

function ScenarioPanel(props: {
  c: CaseFile;
  side: Side;
  scenario: Scenario;
  ev: ReturnType<typeof evaluate>;
  delta: Decimal | null;
  otherLabel: string;
  update: Update;
}) {
  const { c, side, scenario, ev, update } = props;
  const f = scenario.facts;
  const set = (fn: (facts: CaseFacts) => void) => update((d) => fn(d.mediation![side].facts));
  const name = (p: ParentId) => f.parents[p].name || `Parent ${p}`;
  const names = { A: name('A'), B: name('B') };
  const sameSchedule = f.children.every((ch) => ch.overnightsWithA === f.children[0]?.overnightsWithA);
  const rd = c.options.rounding;

  return (
    <section className={`scenario ${side}`} aria-label={scenario.label}>
      <header>
        <input
          className="scenario-label"
          aria-label="Scenario name"
          value={scenario.label}
          onChange={(e) => update((d) => void (d.mediation![side].label = e.target.value))}
        />
        <button
          type="button"
          className="btn small"
          onClick={() => {
            if (!confirm(`Replace the case’s numbers with “${scenario.label}”?`)) return;
            update((d) => {
              const facts = structuredClone(d.mediation![side].facts);
              d.calculationDate = facts.calculationDate;
              d.parents = facts.parents;
              d.children = facts.children;
              d.addOns = facts.addOns;
            });
          }}
        >
          Apply to case
        </button>
      </header>

      {ev.result ? (
        <>
          <Headline c={{ parents: f.parents }} r={ev.result} compact />
          {props.delta && !props.delta.isZero() && (
            <p className="delta">
              {deltaText(props.delta, names, rd)} vs {props.otherLabel}
            </p>
          )}
          <Flags r={ev.result} compact />
        </>
      ) : (
        <div className="headline compact empty">
          <p className="empty-msg">{ev.error}</p>
        </div>
      )}

      <div className="controls">
        <Control label="Overnights" cite="120(i)">
          {sameSchedule || f.children.length === 1 ? (
            <OvernightsSlider
              compact
              value={f.children[0]?.overnightsWithA ?? 0}
              onChange={(n) => set((x) => x.children.forEach((ch) => (ch.overnightsWithA = Math.max(0, Math.min(365, Math.round(n))))))}
              names={names}
              badge={badgeFor(f.children[0]?.overnightsWithA ?? 0, names)}
            />
          ) : (
            f.children.map((ch, i) => (
              <div key={ch.id} className="per-child">
                <span className="small muted">{ch.name}</span>
                <OvernightsSlider
                  compact
                  value={ch.overnightsWithA}
                  onChange={(n) => set((x) => void (x.children[i]!.overnightsWithA = Math.max(0, Math.min(365, Math.round(n)))))}
                  names={names}
                  badge={badgeFor(ch.overnightsWithA, names)}
                />
              </div>
            ))
          )}
        </Control>

        <Control label="Annual income" cite="120(e)">
          {PARENTS.map((p) => {
            const field = mainIncomeField(f, p);
            return (
              <IncomeSlider
                key={p}
                p={p}
                name={name(p)}
                source={field === 'wages' ? 'wages' : 'business receipts'}
                value={f.parents[p].income[field]}
                onChange={(v) => set((x) => void (x.parents[p].income[field] = v))}
              />
            );
          })}
          {ev.result && (
            <p className="hint">
              Guidelines Income: {PARENTS.map((p) => `${name(p)} ${usd(ev.result!.income[p].guidelinesIncome.annual, 'rule-example')}`).join(' · ')}
            </p>
          )}
        </Control>

        <Control label="Who claims the children" cite="120(g)(3)">
          <Segmented
            size="sm"
            ariaLabel="Exemptions claimed by"
            value={f.addOns.taxClaimedBy}
            options={[{ value: 'auto', label: 'Greater benefit' }, ...PARENTS.map((p) => ({ value: p, label: name(p) }))]}
            onChange={(v) => set((x) => void (x.addOns.taxClaimedBy = v))}
          />
        </Control>

        <Control label="Health insurance premium" cite="120(g)(4)">
          <div className="inline">
            <MoneyInput compact ariaLabel="Monthly premium" value={f.addOns.healthInsurance.monthly} onChange={(v) => set((x) => void (x.addOns.healthInsurance.monthly = v))} />
            <Segmented
              size="sm"
              ariaLabel="Paid by"
              value={f.addOns.healthInsurance.paidBy}
              options={PARENTS.map((p) => ({ value: p, label: `${name(p)} pays` }))}
              onChange={(v) => set((x) => void (x.addOns.healthInsurance.paidBy = v))}
            />
          </div>
          <Toggle label="Inside support" checked={f.addOns.healthInsurance.inSupport} onChange={(v) => set((x) => void (x.addOns.healthInsurance.inSupport = v))} />
        </Control>

        <Control label="Child care (monthly)" cite="120(g)(1)">
          <div className="inline">
            {PARENTS.map((p) => (
              <MoneyInput
                key={p}
                compact
                label={`${name(p)} pays`}
                value={f.addOns.childCare[p]}
                onChange={(v) => set((x) => void (x.addOns.childCare[p] = v))}
              />
            ))}
          </div>
          <Toggle label="Inside support" checked={f.addOns.childCareInSupport} onChange={(v) => set((x) => void (x.addOns.childCareInSupport = v))} />
        </Control>
      </div>

      {ev.input && ev.result && sameSchedule && (
        <OvernightsChart
          input={ev.input}
          current={f.children[0]?.overnightsWithA ?? 0}
          currentValue={ev.result.result.signedTotal.toNumber()}
          names={names}
          rounding={rd}
        />
      )}
    </section>
  );
}

function deltaText(delta: Decimal, names: Record<ParentId, string>, rd: 'rule-example' | 'exact') {
  // Signed totals are + when A pays B: a positive delta moves money toward B.
  const amount = usd(delta.abs(), rd);
  return delta.isNegative() ? `${amount}/mo more toward ${names.A}` : `${amount}/mo more toward ${names.B}`;
}

function badgeFor(n: number, names: Record<ParentId, string>) {
  const k = classifyChild({ id: 'x', birthDate: '2000-01-01', overnightsWithA: Math.max(0, Math.min(365, n)) }).custody;
  if (k === 'shared') return { text: 'Shared', cls: 'shared' };
  return { text: `Lives with ${k === 'primary-A' ? names.A : names.B}`, cls: k === 'primary-A' ? 'A' : 'B' };
}

function Control({ label, cite, children }: { label: string; cite?: string; children: ReactNode }) {
  return (
    <div className="control">
      <div className="control-label">
        {label} {cite && <span className="cite">{cite}</span>}
      </div>
      {children}
    </div>
  );
}

/** The income line the mediation slider moves: wages, unless the parent's income is business income. */
function mainIncomeField(f: CaseFacts, p: ParentId): 'wages' | 'businessReceipts' {
  const i = f.parents[p].income;
  const num = (s: string) => Number(s.replace(/[$,\s]/g, '')) || 0;
  return num(i.wages) === 0 && num(i.businessReceipts) > 0 ? 'businessReceipts' : 'wages';
}

function IncomeSlider(props: { p: ParentId; name: string; source: string; value: string; onChange: (v: string) => void }) {
  const n = Number(props.value.replace(/[$,\s]/g, '')) || 0;
  const max = Math.max(250_000, Math.ceil((n * 1.5) / 50_000) * 50_000);
  return (
    <div className="income-slider">
      <span className={`parent-tag ${props.p}`}>{props.p}</span>
      <span className="who-name">
        {props.name}
        <span className="muted small"> {props.source}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={500}
        value={Math.min(n, max)}
        aria-label={`${props.name} ${props.source}`}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <MoneyInput compact ariaLabel={`${props.name} ${props.source} amount`} value={props.value} onChange={props.onChange} />
    </div>
  );
}
