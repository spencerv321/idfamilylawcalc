# Idaho Child Support Calculator

A calculator for I.R.F.L.P. Rule 120 (amended eff. July 1, 2025), built for
family law attorneys and mediators. `SPEC.md` is the product spec, and
`DECISIONS.md` logs every interpretation of the rule.

**Status: Phase 1 (engine only).** There is no UI yet.

```sh
pnpm install
pnpm test                 # golden, unit and property tests
pnpm typecheck
pnpm extract-tax-tables   # re-download the ISC tax tables into engine/guidelines/tax/
```

## Layout

```
engine/
  guidelines/2025-07-01.ts   every Rule 120 constant (an amendment is a new file)
  guidelines/tax/*.json      120(g)(3) tax tables, with source URL, fetch date, SHA-256
  income.ts                  120(e)-(f) gross and Guidelines Income, income shares
  schedule.ts                120(i)(1) basic obligation
  custody.ts                 120(i)(3)-(6) primary (Form 6), shared/split/mixed (Form 7)
  tax.ts                     120(g)(3) tax benefit
  addons.ts                  120(g)(1), (g)(4), (g)(5), (i)(5)
  calculate.ts               the pipeline, floors and flags
  stepdown.ts                120(j) step-down schedule
  __tests__/                 golden (G1-G5, D1-D10), unit, property
scripts/extract-tax-tables.ts
```

The engine is pure TypeScript with no UI, browser or network dependencies.
All money uses `decimal.js`. Every step returns its intermediate lines, so
the UI and the PDF forms can show the work.
