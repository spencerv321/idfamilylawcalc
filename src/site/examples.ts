/**
 * Worked examples for the content pages, computed by the engine at build time
 * so the prose can never disagree with the calculator.
 */
import { calculate, guidelines, type CaseInput } from '../../engine';

function run(a: number, b: number, children: number, nightsWithA: number) {
  const input: CaseInput = {
    calculationDate: '2026-01-01',
    parents: {
      A: { income: { wages: a }, maritalStatus: 'single' },
      B: { income: { wages: b }, maritalStatus: 'single' },
    },
    // Born 2009: turns 17 in the tax year, so examples show base support without the tax benefit.
    children: Array.from({ length: children }, (_, i) => ({ id: `c${i}`, birthDate: '2009-06-01', overnightsWithA: nightsWithA })),
  };
  return calculate(input);
}

const d = (x: { toFixed(n: number): string }, places = 0) => x.toFixed(places).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Rule 120(i)(3)(B)'s own example: $25,000 and $10,000, two children, primary custody. */
export const ruleExample = (() => {
  const r = run(25_000, 10_000, 2, 0);
  return {
    brackets: r.basic.brackets.map((b) => ({ rate: b.rate.times(100).toString(), income: d(b.income), monthly: d(b.monthly) })),
    basic: d(r.basic.monthly),
    sharePct: r.shares.A.times(100).toFixed(0),
    support: d(r.result.baseSupport),
  };
})();

/** Shared custody: $60,000 and $40,000, two children, Parent B has 110 overnights. */
export const sharedExample = (() => {
  const r = run(60_000, 40_000, 2, 255);
  return {
    basic: d(r.basic.monthly),
    oA: d(r.custody.obligations.A),
    oB: d(r.custody.obligations.B),
    payer: r.custody.payer,
    support: d(r.result.baseSupport),
    cap: d(r.custody.cap),
  };
})();

/** Equal time: $72,000 and $48,000, two children, 183/182 overnights. */
export const equalTimeExample = (() => {
  const r = run(72_000, 48_000, 2, 183);
  return { basic: d(r.basic.monthly), payer: r.custody.payer, support: d(r.result.baseSupport), shareA: r.shares.A.times(100).toFixed(0) };
})();

/** The same incomes at 91 vs 92 overnights: the 25% line. */
export const cliffExample = (() => {
  const at91 = run(60_000, 40_000, 2, 91);
  const at92 = run(60_000, 40_000, 2, 92);
  return { at91: d(at91.result.baseSupport), at92: d(at92.result.baseSupport) };
})();

/** The 120(i)(1) schedule as display rows: bracket label and the rate for 1-5 children. */
export const scheduleRows = (() => {
  let from = 0;
  return guidelines.bracketWidths.map((w, i) => {
    const to = from + w;
    const n = (x: number) => x.toLocaleString('en-US');
    const label = i === 0 ? `First $${n(w)}` : `$${n(from)} – $${n(to)}`;
    from = to;
    return { label, rates: ([1, 2, 3, 4, 5] as const).map((kids) => `${Math.round(Number(guidelines.rates[kids][i]) * 100)}%`) };
  });
})();
