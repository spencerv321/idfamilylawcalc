# Decision log

Interpretations of I.R.F.L.P. Rule 120 (amended eff. July 1, 2025) made while
building the engine. Each open item from SPEC.md is a named option in
`engine/types.ts` (`EngineOptions`). Defaults stay until Dad's ICSP cases
(D1–D10) confirm or overturn them.

Primary sources checked on 2026-10-22: the Rule 120 text
(<https://isc.idaho.gov/rules-procedure/print/irfl/120>), the three tax-benefit
tables, and Forms 5, 6 and 7 from the ISC rules page.

Status: **Open** = needs Dad/ICSP · **Resolved** = settled by the rule or forms · **Choice** = engineering call, low risk.

---

## D-001 Rounding · Open · `rounding`

- `'rule-example'` (default): each bracket's monthly amount is rounded to the
  dollar, then summed. This reproduces the 120(i)(3) example's $709 and endnote
  3's $312. Worksheet lines that feed the total (base support, each add-on,
  the total) are whole dollars.
- `'exact'`: full precision throughout, and those lines are rounded to cents.
- Intermediate lines (shares, Form 7 boxes) keep full precision in both modes
  and are rounded only for display. ICSP may round each box; the D-cases will
  show whether it does.
- Rounding is half-up, away from zero.

**SPEC.md conflict:** G3 ($1,541.67) and G4 ($418.15 / $646.23 / $228.08) are
exact-math values, but SPEC.md makes `'rule-example'` the default. Under that
default G3 is **$1,542**. The golden tests run G3 and G4 under `'exact'`, so
their expected values are unchanged, and a separate test asserts the
rule-example result ($1,542).

## D-002 Top-bracket dollar columns · Resolved: no error in the rule

SPEC.md says the $150K–$440K row's "per year" figure is wrong ($15,100 listed
vs 5% × $290,000 = $14,500). That figure is actually the **running total
through $150,000**. It is the sum of rows 1–10 in all five tables ($15,100,
$22,600, $27,600, $31,100, $34,600), and the monthly column matches
(e.g. $1,258 = $15,100 / 12). The $30,200 and $45,200 in G5 come from adding
that running total to rows 1–10 a second time.

The engine computes from the percentages, which agrees with the tables read
this way: $29,600 (1 child) and $45,800 (2 children) at $440,000. A test
checks the running-total reading for all five tables.

The one real defect is a label: the four-child table's last row says "13% of
the next **$20,000**". The engine uses $290,000, the only width consistent with
the $440,000 cap and the other four tables.

## D-003 Exactly 25% of overnights · Resolved

Form 7 line 7 divides overnights by **365**, and an integer count can never be
exactly 25% of 365: 91 nights is 24.93% (primary), 92 is 25.21% (shared). The
engine takes integer overnights from 0 to 365 and applies "25% or less" =
primary per 120(i)(3)(B). Leap years still divide by 365, as Form 7 does.

Form 7 line 7 also clamps each child's fraction: ≥ .75 → 1, ≤ .25 → 0. The
engine applies this per child.

## D-004 Tax benefit lookup · Resolved (with caveats)

- The tables are bracketed $2,000 rows ("greater than X and less than or equal
  to Y"), so there is no interpolation. Income is the parent's annual
  Guidelines Income. The benefit for k children is the sum of the first k
  per-child columns.
- Income at or below $4,000 gives $0. Income above a table's last row uses the
  last row and raises `TAX_TABLE_ABOVE_RANGE`.
- The published remarried table prints the $532,000–$534,000 row twice with
  identical values. The extractor drops the duplicate and records it in the JSON.
- **Table selection:** remarried → Remarried. Single and custodial → "has
  custody". Single and non-custodial → "does not have custody". The custodial
  parent is the one with more total overnights. On an exact tie, the parent
  with the higher Guidelines Income counts as custodial, approximating the IRS
  higher-AGI tie-breaker. `taxTableOverride` replaces any of this.
- **Claimant:** the parent with the greater benefit, per 120(g)(3). If the
  benefits are equal, the custodial parent claims (the IRS default, no Form
  8332) and `TAX_TIE_DEFAULTED_TO_CUSTODIAL` is raised. Ties are common: both
  parents hit the $2,205 plateau at middle incomes.
- **Age:** a child who turns 17 or older during the calculation year is
  excluded, per endnote 4. The tax year is the calculation date's year.
- **Tax year of the tables: Open.** The PDFs were created Nov 20, 2024. $2,205
  per child appears to be the $2,000 federal child tax credit plus Idaho's $205
  credit, i.e. pre-2025 law. If so, the tables understate the benefit for tax
  years after the 2025 federal change. The engine uses the tables as
  published, since the rule directs it, and the court may deviate.

## D-005 Cap order (shared/split) · Resolved: cap base support before add-ons

Forms 6 and 7 compute "Recommended Base Support" (Form 7 line 10) and then
list child care, health insurance and tax benefit as "Other costs" below it.
The engine applies the 120(i)(4)(B) / (i)(6)(B) cap to base support only, then
adds the add-ons. The cap equals the payer's Form 6 line 4 amount (all
children living with the other parent).

## D-006 $50 minimum · Open · `minimumSupport`

120(c)(4) makes $50 per child per month a rebuttable presumption. The default
is `'flag'`: `BELOW_MINIMUM` is raised and the computed amount is kept, because
applying it automatically would hide a judgment call. `'apply'` raises the
total to the minimum. The check runs on the final total. Ask Dad what ICSP does.

## D-007 Imputed income on Form 5 · Resolved for the engine, follow-up for Phase 2

Form 5 line E ("Potential income") holds imputed income, so the engine needs
no extra field beyond `potentialIncome`. For Phase 2 PDF filling: the current
Form 5 still cites "I.R.F.L.P. 126" (the pre-2021 numbering), and it has no
lines for 120(f)(2) spousal maintenance in this case or 120(f)(3) unordered
support. Those will need to go on line B3 or in an attachment. Ask Dad how
practitioners handle it.

## D-008 Income-share precision · Open · `sharePrecision`

`'exact'` (default) keeps shares at full precision. `'percent-2dp'` rounds to
0.01%, as Form 6 prints them (B = 100% − A). The share error is at most
0.005 points, so base support moves by at most about $0.20/month. That is
still enough to flip a whole-dollar rounding, so ICSP's choice matters for
matching to the dollar.

## D-009 Other children in the home · Choice · `otherChildrenTable`

120(f)(4) deducts "the Guideline support amount calculated for that child,
using only that parent's income". The default `'one-child-each'` applies the
one-child table once per child, as SPEC.md says and endnote 3 shows for one
child. `'n-child'` uses the n-child table for n children. The income used is
the parent's **gross** income before the other 120(f) adjustments (endnote 3
starts from gross), run through the schedule with the $440,000 cap.

## D-010 Custody model · Choice (mixed pairing Open)

- Overnights are entered **per child**. If every child is primary in the same
  home, the case is Form 6 (primary). Otherwise it is Form 7, computed per
  child as the form does. That covers shared, split, and mixed, which Form 7
  is titled for and SPEC.md didn't list.
- The 1.5 multiplier applies to every shared child, and to `min(kA, kB)`
  split children in each home, where kA and kB count children primary with
  each parent. For 2+1 this gives one child in each home (the rule's example);
  for 2+2, all four. **Open:** in mixed cases, the pairing counts only
  non-shared children. Confirm against an ICSP mixed case.
- `PAYER_HAS_MAJORITY_TIME` is raised when the payer has more than 50% of all
  overnights across the children (120(i)(4)(B)).

## D-011 Add-on defaults and sign · Choice

- Child care is paid directly unless agreed otherwise (120(g)(1)). Health
  insurance is paid directly unless calculated inside support (120(g)(4)(A)).
  Both are per-expense `inSupport` toggles.
- The tax benefit share always goes inside support (120(g)(3): "will be
  included in the child support order").
- A credit larger than base support reverses the payment direction. The
  engine reverses it and raises `DIRECTION_REVERSED_BY_ADJUSTMENTS`; it does
  not clamp to zero.

## D-012 Extended visits · Choice

120(i)(5) says the court "may" reduce support, so this is informational: a 50%
abated rate and the annual reduction (base × 12 / 365 × days × 50%). The
monthly order amount is unchanged. It applies to primary custody only.

## D-013 Dependency benefits · Choice · `dependencyBenefitAsIncome`

SPEC.md covers only the 120(g)(5) credit. 120(e)(1)(A) also adds the benefit
to the disabled or retired parent's gross income when it is credited against
their obligation, and the engine does that by default. The credit is applied
after add-ons and floors the total at zero (no reimbursement). If that parent
turns out not to be the payer, the case is recomputed without the income
addition and `DEPENDENCY_BENEFIT_NOT_APPLIED` is raised.

## D-014 Low-income review · Choice

The 120(c)(4) $800 test uses the paying parent's monthly Guidelines Income.

## D-015 Emancipation and step-down · Choice

- Support ends on the 18th birthday. If a later high school graduation date is
  given, it ends on graduation, but no later than the 19th birthday (120(a)).
  A Feb 29 birthday falls on Mar 1 in common years.
- Children already emancipated on the calculation date are excluded and
  flagged.
- Each step-down row is a full recalculation for the remaining children as of
  that date, using the schedule for n−1 children, not a pro rata cut
  (120(j)). Incomes and overnights stay fixed. A child turning 17 (losing the
  tax benefit) is not a separate step.

## D-016 More than five children · Choice

The engine uses the five-child schedule and raises `MORE_THAN_FIVE_CHILDREN`
for manual handling (120(i)(2)). The tax tables count five children at most.

## D-017 Zero combined income · Choice

Shares default to 50/50 and `ZERO_COMBINED_INCOME` is raised. The basic
obligation is $0.

---

## Not computed (discretionary or out of scope)

- 120(b)(3) deviations and 120(i)(7) support above $440,000 are flagged only.
- 120(g)(2) transportation is a discretionary sharing; nothing is computed.
- 120(g)(4)(B) uncovered health expenses are shared by the income-share
  percentages the engine reports. There are no amounts to compute in advance.
- The 120(g)(1) federal child care tax credit is not modeled (the tax tables
  exclude it too, per endnote 4).

---

## D-018 Filling Forms 5, 6 and 7 · Choice

The court's PDFs have no fillable fields, so values are drawn at measured
positions on the unmodified forms (`public/forms/`, hashes in `SOURCES.md`).
`src/pdf/forms.test.ts` fills each form and reads the text back out to check
placement.

- **Form 5** shows annual figures for both parents. A2 is receipts minus
  expenses; depreciation and half of the self-employment tax go on B1–B2.
  B3 combines other orders, spousal maintenance in this case, and unordered
  support, because the form has no separate lines for 120(f)(2)–(3) (see D-007).
  Blank lines stay blank. Signature and date are left for the affiant.
- **Form 6**: line 5 and the line 6 "+/−" adjustments go in the paying
  parent's column, signed relative to that parent. Directly paid child care
  or insurance shows each parent's share, marked "paid direct", and is not
  added to line 7.
- **Form 7**: the per-child grid holds five children; a sixth is included in
  lines 9–10 and noted in the comments. The "other costs" lines are signed
  relative to the paying parent. The comments block states who pays whom and
  which "Parent" column is which.
- Amounts follow the rounding convention (D-001): whole dollars under
  `'rule-example'`, cents under `'exact'`.

## D-019 Schedule presets · Choice

Presets count overnights the way the 120(i)(3)(A) example does: a two-week
pattern times 26 (every other weekend = 2 × 26 = 52). Equal-time schedules
give 182/183. Each summer week adds 7 nights minus that week's share of the
regular pattern. Holidays aren't modeled; adjust the number by hand.

## D-020 Order language · Choice

The "Order language" panel drafts the 120(j) statement: the total and due date,
then a step-down sentence at each emancipation date (from the step-down
schedule), plus health insurance, the uncovered-expense split by income share,
the $500 pre-approval rule (120(g)(4)(B)), child care, and the tax exemption.
When the non-custodial parent claims the children, it adds the Form 8332
requirement (120(g)(3)). Parties are named by caption role. Amounts are always
written to the cent ("$560.00"); the value itself follows the rounding
convention (D-001).
