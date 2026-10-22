# ICSP fixtures (D1–D10)

Each of Dad's anonymized ICSP cases goes in `fixtures/icsp/D<n>.json`. The
golden suite picks it up automatically; until the file exists, the case shows
as skipped. Start from `icsp-template.json`.

```jsonc
{
  "id": "D1",                       // D1..D10
  "description": "Shared, 2 kids, self-employed father",
  "source": { "icspVersion": "1.0.27.2018", "printedOn": "2026-10-20" },
  "input": { /* a CaseInput: see engine/types.ts */ },
  "expected": {
    "payer": "A",                   // "A", "B" or null
    "totalMonthly": "512.00",       // the ICSP bottom line, 2 decimals
    "lines": {                      // optional: every intermediate ICSP prints
      "A.guidelinesIncome.monthly": "5000.00",
      "basic.monthly": "1542.00",
      "baseSupport": "228.00"
    }
  }
}
```

## Conventions

- Income and deduction inputs are **annual**; add-on expenses are **monthly**.
- `overnightsWithA` is per child, out of 365.
- Amounts in `expected.lines` are compared with `toFixed(2)`.
- Signed lines (`baseSupport`, `childCare`, `healthInsurance`, `taxBenefit`,
  `total`) are **positive when A pays B** and negative when B pays A.
- Set `input.options` to the convention being tested (for example
  `"rounding": "exact"`). Once the ICSP cases settle a convention, the default
  changes in `engine/types.ts` and the fixtures stop needing it.

## Line keys

| Key | Worksheet line |
| --- | --- |
| `A.grossIncome.monthly`, `B.…` | Form 5 A9 ÷ 12 (before 120(f) adjustments) |
| `A.guidelinesIncome.monthly`, `B.…` | Form 5 G / Form 6–7 line 1 |
| `combined.guidelinesIncome.monthly` | Form 6–7 line 1, combined |
| `A.share.percent`, `B.…` | Form 6–7 line 2 |
| `basic.monthly` | Form 6–7 line 3 |
| `A.shareOfBasic`, `B.…` | Form 6–7 line 4 |
| `A.obligation`, `B.…` | Form 6 line 4 / Form 7 line 9 |
| `custody.cap` | 120(i)(4)(B) cap for the payer |
| `baseSupport` | Form 6 line 5 / Form 7 line 10 |
| `childCare`, `healthInsurance` | Other costs A, B (only when computed in support) |
| `taxBenefit.monthly` | Other costs C: total benefit ÷ 12 |
| `taxBenefit` | Other costs C: pro rata share credited or added |
| `dependencyCredit` | 120(g)(5) credit |
| `total` | Total amount to be ordered |

When a mismatch can't be traced to a line, record it in `DECISIONS.md` with the
case ID. Do not edit the expected values.
