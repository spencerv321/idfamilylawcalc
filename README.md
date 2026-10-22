# Idaho Child Support Calculator

A calculator for I.R.F.L.P. Rule 120 (amended eff. July 1, 2025), built for
family law attorneys and mediators. `SPEC.md` is the product spec, and
`DECISIONS.md` logs every interpretation of the rule.

**Status: Phase 2.** The engine plus the web app: case form, live
results with every worksheet line, mediation mode, step-down schedule, filled
Forms 5/6/7, and local-first saving with JSON export/import.

```sh
pnpm install
pnpm dev                  # app at http://localhost:5173
pnpm build                # static site in dist/ (Cloudflare Pages, Vercel, any static host)
pnpm test                 # engine golden/unit/property tests + PDF fill tests
pnpm typecheck
npx playwright test       # browser smoke tests (set PW_CHROMIUM to a Chromium path if needed)
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
src/
  model/                     case file shape, engine adapter, IndexedDB storage, examples
  components/                input ledger, results/worksheet, mediation, overnights chart
  pdf/forms.ts               fills the official forms at measured positions
public/forms/                unmodified ISC Forms 5, 6, 7 (hashes in SOURCES.md)
e2e/                         Playwright smoke tests
scripts/extract-tax-tables.ts
```

The engine is pure TypeScript with no UI, browser or network dependencies.
All money uses `decimal.js`. Every step returns its intermediate lines, so
the UI and the PDF forms can show the work.

## Privacy

There is no backend. Calculations run in the browser, cases live in the
browser's IndexedDB, and the only requests the app makes are for its own
static files (including the blank court forms). Use Export JSON to move a
case to another machine.
