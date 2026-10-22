# Idaho Child Support Calculator — Spec & Handoff

Oct 22, 2026 · @Spencer

## Context and positioning

We are building a modern Idaho child support calculator for family law attorneys and mediators, starting with Dad as design partner. It replaces Idaho Child Support Online (ICSP) by Moonlighting Software, which most Idaho family law practitioners pay a subscription for.

**The incumbent.** [ICSP](https://online.idchildsupport.com/) started as a Windows desktop app and went online around 2015. It still shows "v1.0.27.2018" and runs on an old ASP.NET stack. Plans are Trial (14 days, 3 cases), Basic (cases, printable reports, 2-year archive) and Pro (downloadable reports, 4-year archive), per its [Getting Started page](https://online.idchildsupport.com/GetStarted.aspx). Pricing sits behind signup; Dad reports a couple hundred dollars a year. It is not affiliated with the State of Idaho ([Custody X Change](https://www.custodyxchange.com/topics/child-support/software/idaho-child-support.php)).

**No free official tool.** Idaho publishes no official online calculator ([AllLaw](https://www.alllaw.com/calculators/childsupport/idaho)). Self-represented parties rely on Court Assistance Offices or Ada County Family Court Services.

**Market size.** The Idaho State Bar Family Law Section has about 315 members ([ISB mailing lists](https://isb.idaho.gov/licensing-mcle/mailing-lists/)). With mediators, paralegals and court staff, that is roughly 400–700 seats statewide, or $80–140K a year at incumbent pricing. Idaho alone is a side business, not a venture.

**Our wedge.** Accuracy parity with ICSP is table stakes. We win on:

- Mediation mode: live side-by-side scenarios during a session (overnights, tax exemption, insurance)
- Court-ready Forms 5, 6 and 7, filled and downloadable
- Automatic step-down schedule as each child ages out
- Local-first privacy: calculations run in the browser and client data never touches our servers
- Later: a parenting-time calendar that computes overnights, a modification check, more states

**Biggest risk.** Being wrong by a few dollars on a court filing. Golden test cases from Dad come before any UI.

## Calculation spec (I.R.F.L.P. Rule 120)

The engine implements [Rule 120](https://isc.idaho.gov/rules-procedure/irfl) as amended effective July 1, 2025. Every rule-derived constant lives in one versioned data file (`guidelines/2025-07-01.ts`) so future amendments are a new file, not a code change.

### Pipeline

1. **Gross income per parent** (120(e)): all sources, including potential (imputed) income. Self-employment = receipts minus ordinary and necessary expenses, straight-line depreciation, minus half of self-employment tax. Optional exclusion of qualifying overtime or second-job income (120(e)(1)(B)).
2. **Guidelines Income** (120(f)) = gross minus: support or maintenance paid under other orders, spousal maintenance in this case, a shown pattern of unordered support for other children, and an other-children-in-home deduction (guideline support for that child using only that parent's income, from the one-child table per child).
3. **Combined annual Guidelines Income** = sum of both parents, capped at $440,000 for the schedule.
4. **Basic obligation**: marginal brackets by number of children (table below). Applied like tax brackets.
5. **Income shares**: each parent's Guidelines Income ÷ combined.
6. **Custody adjustment** (120(i)(3)–(6)): primary, shared or split, by overnights per calendar year.
7. **Add-ons**: tax benefit, health insurance, child care, extended-visit abatement, dependency benefits.
8. **Floors and flags**: $50 per child per month rebuttable minimum; review flag if a paying parent earns under $800 per month; deviation flag above $440,000 combined.
9. **Step-down schedule** (120(j)): recompute with n−1 children as each child turns 18, or 19 if still in high school.

### Basic schedule: marginal rates by bracket

| Bracket of combined annual income | 1 child | 2 children | 3 children | 4 children | 5 children |
| --- | --- | --- | --- | --- | --- |
| $0–10,000 | 18% | 26% | 30% | 33% | 36% |
| $10,000–20,000 | 17% | 25% | 29% | 32% | 35% |
| $20,000–30,000 | 15% | 23% | 27% | 30% | 33% |
| $30,000–40,000 | 14% | 22% | 26% | 29% | 32% |
| $40,000–50,000 | 13% | 20% | 24% | 27% | 30% |
| $50,000–70,000 | 12% | 17% | 20% | 22% | 24% |
| $70,000–90,000 | 9% | 13% | 16% | 18% | 20% |
| $90,000–110,000 | 6% | 9% | 12% | 14% | 16% |
| $110,000–130,000 | 5% | 8% | 11% | 13% | 15% |
| $130,000–150,000 | 5% | 8% | 11% | 13% | 15% |
| $150,000–440,000 | 5% | 8% | 11% | 13% | 15% |

Percentages are taken from the rule's tables. Monthly basic = annual ÷ 12. More than five children: the rule says the schedules are not a limit; flag for manual handling.

### Custody formulas

Let B = monthly basic obligation, s\_A and s\_B = income shares, t\_A and t\_B = overnight shares (overnights ÷ 365).

**Primary** (a parent has 25% or less of overnights): the other parent pays their share.

```latex
\text{Support}_{A \to B} = B \cdot s_A
```

**Shared** (each parent has more than 25%):

```latex
O_A = 1.5B \cdot s_A \cdot t_B \qquad O_B = 1.5B \cdot s_B \cdot t_A \qquad \text{Net} = |O_A - O_B|
```

The parent owing more pays the difference. Cap: never more than that parent would pay if all children lived with the other parent. If the payer has more than 50% of overnights, flag the 120(i)(7) factors.

**Split** (each parent has at least one child): per-child amount = B ÷ n. Apply the 1.5 multiplier to one child in each home for an equal-split pairing; remaining children carry no multiplier. Compute each parent's obligation for children in the other home, offset, same cap. Implement the rule's three-child example (2 + 1) exactly.

### Add-ons

- **Tax benefit** (120(g)(3)): look up per-exemption benefit from three ISC tables (remarried; single without custody; single with custody) by Guidelines Income. Default assignment to the parent with the greater benefit. The other parent gets a pro-rata credit by income share. Exclude children 17 or older. Source PDFs: [remarried](https://api.isc.idaho.gov/uploads/Documents/Forms/Rules_and_Procedures_Forms/1777484109709-IRFLP-120-Table_Remarried_Parent.pdf), [single, no custody](https://api.isc.idaho.gov/uploads/Documents/Forms/Rules_and_Procedures_Forms/1777484117934-IRFLP-120-Table_Single_Parent_No_Custody.pdf), [single, has custody](https://api.isc.idaho.gov/uploads/Documents/Forms/Rules_and_Procedures_Forms/1777484125237-IRFLP-120-Table_Single_Parent_Has_Custody.pdf).
- **Health insurance** (120(g)(4)): children's premium shared by income share, either paid directly or as a credit or addition inside support (user toggle).
- **Child care** (120(g)(1)): work-related costs shared by income share, paid directly by default.
- **Extended visits** (120(i)(5)): primary custody only; 50% reduction for 14+ consecutive days.
- **Dependency benefits** (120(g)(5)): SSDI or retirement benefits paid to the recipient for the payer's disability or retirement reduce support; no reimbursement beyond zero.

### Open interpretation decisions

These must be settled with Dad and checked against ICSP before launch.

- [ ] **Rounding.** The rule's example sums rounded monthly bracket amounts ($217 + $208 + $192 + $92 = $709); exact math gives $708.33. Which convention does ICSP use, and at which steps?
- [ ] **Top-bracket dollar columns are wrong.** In every table, the $150K–440K "per year" figure does not equal rate × $290,000 (one child: $15,100 listed vs $14,500). The four-child row also says "next $20,000." Proposal: compute from percentages and document it.
- [ ] **Exactly 25% of overnights.** Primary applies at 25% or less; shared at more than 25%. Confirm handling of 91 vs 92 overnights and leap years.
- [ ] **Tax table lookup.** Bracketed rows vs interpolation; which tax year the current tables reflect.
- [ ] **Shared-custody cap order.** Apply the cap before or after add-ons and the tax credit?
- [ ] **$50 minimum.** Applied automatically, or only flagged?
- [ ] **Imputed income (2025 amendment).** Calculator takes imputed income as an input; confirm no extra fields are needed on Form 5.

## Golden test cases

The engine ships only when every case below passes to the cent, or the difference is explained in a decision log. Cases G1–G2 come straight from Rule 120. G3–G5 are computed from the rule's percentages and must be confirmed in ICSP. D1–D10 are Dad's real cases, anonymized.

| ID | Source | Inputs | Expected (monthly) | Status |
| --- | --- | --- | --- | --- |
| G1 | Rule 120(i)(3) example | 2 children; incomes $25,000 and $10,000/yr; payer has 25% or less of overnights | Basic $709 (rule) vs $708.33 (exact); payer share 71% = $506 | Rounding decision pending |
| G2 | Rule 120 endnote 3 | Other child in home; payer gross $1,800/mo, other parent $0; 1 child | Deduction $312 ($311.67 exact); adjusted gross $1,488 | Ready |
| G3 | Computed | 2 children; $100,000 combined; primary custody | Basic $1,541.67 | Confirm in ICSP |
| G4 | Computed | 2 children; A $60,000, B $40,000; B has 110 overnights (30.1%), shared | A owes $418.15, B owes $646.23; B pays A $228.08 (under cap of $616.67) | Confirm in ICSP |
| G5 | Computed | Combined $440,000; 1 child and 2 children | Percentages give $29,600 and $45,800/yr; the rule's dollar columns sum to $30,200 and $45,200 | Top-bracket decision pending |
| D1–D10 | Dad's ICSP printouts | Mix of primary, shared, split, self-employed, other-children, insurance, child care, tax benefit, 3+ kids, income over $440K | ICSP outputs | Waiting on Dad |

G5 shows the top-bracket problem concretely: the published dollar column is $50/month high for one child and $50/month low for two. Whichever way ICSP resolves it is what attorneys will compare against.

For Dad's cases, ask for the full ICSP report (all inputs and intermediate lines), not just the bottom-line number, so mismatches can be traced to a specific step.

## v1 scope vs later

v1 is what Dad needs to stop opening ICSP: an accurate engine, a fast case form, mediation mode and the three court forms. Target two weekends of build.

| Feature | Phase | Why |
| --- | --- | --- |
| Calculation engine with full test suite | v1 | Everything depends on it |
| Case form: parents, children with birthdates, incomes, deductions, overnights, add-ons | v1 | Replaces ICSP data entry |
| Primary, shared and split custody | v1 | All three are routine |
| Tax benefit tables | v1 | Changes the answer in most cases |
| Mediation mode: two scenarios side by side, live sliders | v1 | Dad's differentiator |
| Forms 5, 6, 7 as filled PDFs | v1 | What actually gets filed |
| Step-down schedule by child birthdate | v1 | Required in the judgment; tedious by hand |
| Local-first storage and JSON case export/import | v1 | Privacy pitch; no backend needed |
| Public free calculator page (basic inputs only) | v1.1 | SEO and court-staff adoption |
| Accounts, sync across devices, Stripe billing | v2 | Only after 5 paying attorneys outside Dad |
| Parenting-time calendar to overnights | v2 | Strong wedge, real UI work |
| Modification check (old order vs new numbers) | v2 | Easy once engine exists |
| ICSP case import (icsp.mdb or report parsing) | v2 | Lowers switching cost |
| Second state (likely Utah) | Later | Only if Idaho proves demand |

Out of scope for now: e-filing, case management beyond saved calculations, arrears and interest calculators.

## Questions for Dad

These are written to send as-is. The first five block the build; the rest shape v1.

**Blocking**

- [ ] What do you pay for ICSP each year, and which plan (Basic or Pro)?
- [ ] Can you print or export the full ICSP report for 10 recent cases, names removed? Ideally a mix: primary, shared, split, self-employed parent, another child in the home, health insurance, child care, 3+ kids, and one high-income case.
- [ ] When the rule's math and ICSP disagree (rounding, the top income bracket), does anyone notice or care? Do judges and opposing counsel just accept the ICSP printout?
- [ ] Which forms do you actually file: Forms 5, 6 and 7 as PDFs, or ICSP's own report format? Do any judges require one or the other?
- [ ] Is it ever exactly 25% overnights (91.25 nights)? How do you and ICSP handle that line?

**Shaping v1**

- [ ] What annoys you most about ICSP? What do you wish it did?
- [ ] In a mediation session, do you run numbers live in front of both parties? What do you change most often while they watch?
- [ ] How do you figure overnights today for complicated schedules: by hand, a calendar, Custody X Change?
- [ ] Would you be comfortable with case data living only on your computer (no cloud), or do you need it on multiple devices?
- [ ] Who else in your circle uses ICSP? Would 3–5 of them try a new tool if you recommended it?
- [ ] What would make you or another attorney nervous about switching? Trust, accuracy, court acceptance, something else?
- [ ] Any Family Law Section meetings or CLEs coming up where a 10-minute demo would fit?

## Claude Code handoff prompt

Paste this into Claude Code in an empty folder, with this doc exported to `SPEC.md` in that folder. It builds the engine test-first and stops for review before any UI.

```markdown
You are building an Idaho child support calculator for family law attorneys and mediators. Read SPEC.md fully before writing code. It is the source of truth; where it lists an open decision, implement the proposal as a named option and log it in DECISIONS.md.

## Stack
- Vite + React + TypeScript, pnpm
- Engine as a pure TypeScript module in /engine with zero UI or browser dependencies
- Vitest for tests
- Money as integer cents or decimal.js — never raw floats in the engine
- pdf-lib for filling the official Forms 5, 6, 7
- Local-first storage (IndexedDB via idb) plus JSON case export/import; no backend in v1
- Deploy target: Cloudflare Pages or Vercel (static)

## Phase 1 — engine only (stop and report when done)
1. Create /engine/guidelines/2025-07-01.ts holding every constant from Rule 120: bracket widths, rates for 1–5 children, $440,000 cap, 25% threshold, 1.5 shared multiplier, $50/child minimum, $800 review threshold.
2. Write a script (/scripts/extract-tax-tables) that downloads the three ISC tax-benefit PDFs linked in SPEC.md and extracts them to JSON in /engine/guidelines/tax/ with the source URL, fetch date and file hash. Print rows for manual spot-checking.
3. Write the golden tests from SPEC.md (G1–G5) FIRST, in /engine/__tests__/golden.test.ts. Leave D1–D10 as skipped placeholders with a fixture format documented.
4. Implement the pipeline in SPEC.md order as small pure functions: guidelinesIncome, basicObligation, incomeShares, primary, shared, split, taxBenefit, addOns, floorsAndFlags, stepDownSchedule. Each returns its intermediate lines so the UI and PDFs can show the work.
5. Rounding: make the convention a config option ('rule-example': round each bracket's monthly amount then sum; 'exact': round only final amounts). Default to 'rule-example' until Dad's cases decide it.
6. Top bracket: compute from percentages. Add a test that documents the mismatch with the rule's printed dollar columns.
7. Add property tests: support never negative; shared payer never pays more than the all-children-with-other-parent amount; monotonic in payer income.
8. Report: test results, every decision logged, and anything in Rule 120 you could not implement unambiguously.

## Phase 2 — after I approve Phase 1
- Case form UI, results panel that shows every intermediate line, mediation mode (two scenarios side by side with live sliders for overnights, incomes, exemption assignment, insurance), step-down table, Forms 5/6/7 PDF export, JSON export/import.
- Use the frontend-design skill; clean, professional, legal-tool feel; works on a laptop in a mediation room.

## Rules
- Never change a golden test's expected value to make it pass. If you think a test is wrong, stop and explain.
- Cite the Rule 120 subsection in a comment above each function.
- No analytics, no network calls from the app at runtime.
```
