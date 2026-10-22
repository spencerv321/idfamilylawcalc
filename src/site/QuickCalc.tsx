/**
 * The quick estimator on the content pages: two incomes, number of children
 * and overnights, giving base support (Form 6 line 5 / Form 7 line 10) before
 * add-ons. It runs the same engine as the full calculator. "Continue" hands the
 * inputs to /app/ in the URL fragment, which never leaves the browser.
 */
import { useMemo, useState } from 'react';
import { basicObligation, custodyAdjustment, DEFAULT_OPTIONS, Decimal, guidelines, incomeShares } from '../../engine';
import { parseMoney } from '../model/case';
import { usd } from '../model/format';
import { presetOvernights, SCHEDULE_PRESETS } from '../model/schedules';
import { APP_PATH } from './config';

export interface Prefill {
  /** Monthly gross incomes. */
  a: string;
  b: string;
  children: number;
  nightsWithA: number;
}

export function encodePrefill(p: Prefill): string {
  return `#prefill=${encodeURIComponent(JSON.stringify(p))}`;
}

const money = (raw: string) => {
  const v = parseMoney(raw);
  return v === null ? null : new Decimal(v);
};

export function estimate(p: Prefill) {
  const a = money(p.a);
  const b = money(p.b);
  if (!a || !b || a.isNegative() || b.isNegative()) return null;
  const opts = DEFAULT_OPTIONS;
  const shares = incomeShares(a.times(12), b.times(12), opts);
  const basic = basicObligation(shares.combinedAnnual, p.children, opts);
  const kids = Array.from({ length: p.children }, (_, i) => ({ id: `c${i}`, birthDate: '2015-01-01', overnightsWithA: p.nightsWithA }));
  const custody = custodyAdjustment(basic.monthly, shares, kids);
  return {
    shares,
    basic,
    custody,
    amount: custody.net.abs().toDecimalPlaces(0),
    overCap: shares.combinedAnnual.greaterThan(guidelines.combinedIncomeCap),
  };
}

export function QuickCalc() {
  const [p, setP] = useState<Prefill>({ a: '5,000', b: '3,000', children: 2, nightsWithA: 52 });
  const r = useMemo(() => {
    try {
      return estimate(p);
    } catch {
      return null;
    }
  }, [p]);
  const set = (patch: Partial<Prefill>) => setP((x) => ({ ...x, ...patch }));
  const pct = (n: number) => `${((n / 365) * 100).toFixed(0)}%`;
  const typeLabel = { primary: 'Primary custody (Form 6)', shared: 'Shared custody (Form 7)', split: 'Split custody (Form 7)', mixed: 'Mixed custody (Form 7)' };

  return (
    <div className="qc">
      <div className="qc-inputs">
        <label className="qc-field">
          <span>Parent A gross income, monthly</span>
          <span className="qc-money">
            $<input inputMode="decimal" value={p.a} onChange={(e) => set({ a: e.target.value })} aria-invalid={money(p.a) === null || undefined} />
          </span>
        </label>
        <label className="qc-field">
          <span>Parent B gross income, monthly</span>
          <span className="qc-money">
            $<input inputMode="decimal" value={p.b} onChange={(e) => set({ b: e.target.value })} aria-invalid={money(p.b) === null || undefined} />
          </span>
        </label>
        <label className="qc-field">
          <span>Children</span>
          <select value={p.children} onChange={(e) => set({ children: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="qc-field">
          <span>Schedule</span>
          <select
            defaultValue="eow"
            onChange={(e) => {
              const preset = SCHEDULE_PRESETS.find((x) => x.id === e.target.value);
              if (preset) set({ nightsWithA: presetOvernights(preset) });
              if (e.target.value === 'none') set({ nightsWithA: 0 });
            }}
          >
            <option value="none">Parent A: no overnights</option>
            {SCHEDULE_PRESETS.map((x) => (
              <option key={x.id} value={x.id}>
                Parent A: {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="qc-field qc-wide">
          <span>
            Overnights a year with Parent A: <strong>{p.nightsWithA}</strong> ({pct(p.nightsWithA)}) · Parent B: {365 - p.nightsWithA}
          </span>
          <input type="range" min={0} max={365} value={p.nightsWithA} onChange={(e) => set({ nightsWithA: Number(e.target.value) })} />
        </label>
      </div>

      <div className="qc-result" aria-live="polite">
        {r ? (
          <>
            <p className="qc-type">{typeLabel[r.custody.type]}</p>
            {r.custody.payer ? (
              <p className="qc-amount">
                Parent {r.custody.payer} pays about <strong>{usd(r.amount, 'rule-example')}</strong>
                <span>/month</span>
              </p>
            ) : (
              <p className="qc-amount">No base support either way</p>
            )}
            <dl>
              <div>
                <dt>Combined monthly income</dt>
                <dd>{usd(r.shares.combinedAnnual.div(12))}</dd>
              </div>
              <div>
                <dt>Basic obligation, {p.children} {p.children === 1 ? 'child' : 'children'}</dt>
                <dd>{usd(r.basic.monthly, 'rule-example')}</dd>
              </div>
              <div>
                <dt>Income shares (A / B)</dt>
                <dd>
                  {r.shares.A.times(100).toFixed(1)}% / {r.shares.B.times(100).toFixed(1)}%
                </dd>
              </div>
            </dl>
            <p className="qc-note">
              Base support before health insurance, child care and the tax-benefit adjustment, assuming gross income with no other deductions.
              {r.overCap && ' Combined income is over $440,000 a year; the court may order more (Rule 120(i)(7)).'}
            </p>
            <a className="qc-cta" href={`${APP_PATH}${encodePrefill(p)}`}>
              Continue in the full calculator →
            </a>
          </>
        ) : (
          <p className="qc-note">Enter both monthly incomes as numbers.</p>
        )}
      </div>
    </div>
  );
}
