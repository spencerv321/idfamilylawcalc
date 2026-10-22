/**
 * Content pages, prerendered to static HTML by scripts/prerender.tsx.
 * Every legal statement cites I.R.F.L.P. 120 (eff. July 1, 2025). Numbers in
 * examples come from the engine (./examples), never typed by hand.
 */
import type { ReactNode } from 'react';
import { guidelines } from '../../engine';
import { APP_PATH } from './config';
import { cliffExample, equalTimeExample, ruleExample, scheduleRows, sharedExample } from './examples';

export interface Faq {
  q: string;
  a: string;
}

export interface Route {
  path: string;
  /** <title>: keyword-first, under ~65 characters. */
  title: string;
  description: string;
  h1: string;
  /** Breadcrumb label. */
  crumb: string;
  body: ReactNode;
  faq?: Faq[];
  /** Include the quick estimator island. */
  estimator?: boolean;
  /** Mark up as a web application (the calculator landing page). */
  app?: boolean;
}

const RULE_URL = 'https://isc.idaho.gov/rules-procedure/irfl';
const FORMS_URL = 'https://isc.idaho.gov/rules-procedure/irfl';
const cap = guidelines.combinedIncomeCap.toLocaleString('en-US');

function Cite({ children }: { children: ReactNode }) {
  return <span className="cite">I.R.F.L.P. {children}</span>;
}

function Estimator() {
  return (
    <div className="estimator" data-island="quick-calc">
      <p className="estimator-fallback">
        The quick estimator needs JavaScript. You can still use the <a href={APP_PATH}>full calculator</a>.
      </p>
    </div>
  );
}

function AppCta({ children = 'Open the full calculator' }: { children?: ReactNode }) {
  return (
    <p className="cta-row">
      <a className="button primary" href={APP_PATH}>
        {children} →
      </a>
      <span className="muted">Free while in beta · runs in your browser · nothing is sent anywhere</span>
    </p>
  );
}

function ScheduleTable() {
  return (
    <div className="table-wrap">
      <table className="schedule">
        <caption>Idaho basic child support schedule, I.R.F.L.P. 120(i)(1): share of each slice of combined annual income</caption>
        <thead>
          <tr>
            <th scope="col">Combined annual Guidelines Income</th>
            {[1, 2, 3, 4, 5].map((n) => (
              <th scope="col" key={n}>
                {n} {n === 1 ? 'child' : 'children'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scheduleRows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {r.rates.map((x, i) => (
                <td key={i}>{x}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

const calculatorFaq: Faq[] = [
  {
    q: 'How is child support calculated in Idaho?',
    a: `Idaho uses an income shares model (I.R.F.L.P. 120). Both parents' Guidelines Income is added together, a schedule of percentages gives the basic support obligation for that combined income and number of children, and each parent is responsible for their share in proportion to their income. The parent with 25% or fewer of the overnights pays their share to the other parent; if each parent has more than 25%, the shared-custody formula applies.`,
  },
  {
    q: 'How many overnights count as shared custody in Idaho?',
    a: 'More than 25% of the overnights in a year with each parent (I.R.F.L.P. 120(i)(4)). Counting overnights out of 365, that means 92 or more. At 91 or fewer, the standard (primary custody) calculation applies.',
  },
  {
    q: 'What is the minimum child support in Idaho?',
    a: 'There is a rebuttable presumption that support is at least $50 per month per child, and when the paying parent earns less than $800 a month the court should carefully review incomes and living expenses (I.R.F.L.P. 120(c)(4)).',
  },
  {
    q: 'Is there an income cap?',
    a: `The schedule covers combined Guidelines Income up to $${cap} a year. Above that, support on the first $${cap} is calculated normally and the court may order more after considering the factors in I.R.F.L.P. 120(i)(7).`,
  },
  {
    q: 'When does child support end in Idaho?',
    a: 'Support is calculated for children under 18, or up to 19 while the child is pursuing a high school education (I.R.F.L.P. 120(a)). The judgment must state the support due for the remaining children as each child is no longer entitled to it, recalculated from the schedule rather than reduced proportionally (I.R.F.L.P. 120(j)).',
  },
  {
    q: 'Is this the official Idaho calculator?',
    a: 'No. This is an independent calculator, not affiliated with the State of Idaho, the Idaho courts or the Idaho Department of Health and Welfare. It implements the court rule (I.R.F.L.P. 120) and fills the court’s own worksheet forms, but the court decides the final amount. Verify results before filing.',
  },
];

const sharedFaq: Faq[] = [
  {
    q: 'Does 50/50 custody mean no child support in Idaho?',
    a: `Not usually. With equal time, the parent with the higher income generally still pays the difference between the two parents' obligations. For example, with incomes of $72,000 and $48,000 and two children at equal time, the higher earner pays about $${equalTimeExample.support} a month in base support.`,
  },
  {
    q: 'Why does shared custody multiply support by 1.5?',
    a: 'The rule recognizes that keeping two homes ready for the children raises the total cost of raising them. The basic obligation is multiplied by 1.5 before it is divided between the parents (I.R.F.L.P. 120(i)(4)).',
  },
  {
    q: 'Can shared custody make a parent pay more than primary custody would?',
    a: 'No. A parent never pays more than they would if all the children lived with the other parent (I.R.F.L.P. 120(i)(4)(B)).',
  },
];

// ---------------------------------------------------------------------------

export const ROUTES: Route[] = [
  {
    path: '/',
    title: 'Child Support Calculator & Worksheets, by the Rules',
    description: 'Accurate child support calculations and court worksheets, built directly from each state’s guidelines. Idaho (I.R.F.L.P. 120) available now.',
    h1: 'Child support math, done by the rules',
    crumb: 'Home',
    body: (
      <>
        <p className="lede">
          Calculations built directly from the state’s child support guidelines, with every step shown, the court’s own worksheet forms filled, and a
          mediation mode for working through proposals live. Everything runs in your browser.
        </p>
        <div className="cards">
          <a className="card" href="/idaho/child-support-calculator/">
            <span className="card-kicker">Available now</span>
            <strong>Idaho child support calculator</strong>
            <span>I.R.F.L.P. 120, amended July 1, 2025. Primary, shared, split and mixed custody, with Forms 5, 6 and 7.</span>
          </a>
          <a className="card" href="/idaho/for-attorneys/">
            <span className="card-kicker">For professionals</span>
            <strong>Attorneys and mediators</strong>
            <span>Court-ready worksheets, order language, step-down schedules and side-by-side proposals.</span>
          </a>
        </div>
        <p className="muted">More states are planned. Each one is built and tested against its own rule before it ships.</p>
      </>
    ),
  },

  {
    path: '/idaho/child-support-calculator/',
    title: 'Idaho Child Support Calculator (2026) · Rule 120 Worksheet',
    description:
      'Free Idaho child support calculator under I.R.F.L.P. 120 (amended July 1, 2025). Estimate support for primary, shared or split custody and fill the official worksheet.',
    h1: 'Idaho Child Support Calculator',
    crumb: 'Idaho calculator',
    estimator: true,
    app: true,
    faq: calculatorFaq,
    body: (
      <>
        <p className="lede">
          Estimate Idaho child support under the current guidelines, <Cite>120</Cite> as amended effective July 1, 2025. The quick estimate below
          gives base support; the full calculator adds health insurance, child care, the tax benefit, step-down dates and the official worksheet.
        </p>
        <Estimator />
        <AppCta />

        <h2>How Idaho child support is calculated</h2>
        <ol className="steps">
          <li>
            <strong>Guidelines Income for each parent.</strong> Gross income from all sources, including potential (imputed) income, less support
            paid under other orders, spousal maintenance and a deduction for other children in the home. <Cite>120(e)–(f)</Cite>
          </li>
          <li>
            <strong>Basic obligation.</strong> Add both incomes and apply the schedule’s percentages, slice by slice, for the number of children.{' '}
            <Cite>120(i)(1)</Cite>
          </li>
          <li>
            <strong>Each parent’s share</strong> is in proportion to their income. <Cite>120(c)(1)</Cite>
          </li>
          <li>
            <strong>Custody adjustment.</strong> With 25% or fewer overnights, a parent pays their share. If each parent has more than 25%, the
            shared-custody formula applies. <Cite>120(i)(3)–(6)</Cite>
          </li>
          <li>
            <strong>Adjustments</strong> for child care, health insurance and the tax benefit. <Cite>120(g)</Cite>
          </li>
        </ol>
        <p>
          <a href="/idaho/how-child-support-is-calculated/">Read the full walkthrough, with the complete schedule →</a>
        </p>

        <h2>The rule’s own example</h2>
        <p>
          Rule 120 works through a case with two children where one parent earns $25,000 a year and the other $10,000. Their combined $35,000 is
          applied to the two-child schedule:
        </p>
        <ul className="calc-list">
          {ruleExample.brackets.map((b, i) => (
            <li key={i}>
              {b.rate}% of ${b.income} = <strong>${b.monthly}</strong>/month
            </li>
          ))}
        </ul>
        <p>
          That is a basic obligation of <strong>${ruleExample.basic} a month</strong>. The parent with 25% or fewer overnights earns{' '}
          {ruleExample.sharePct}% of the combined income and pays <strong>${ruleExample.support} a month</strong>. <Cite>120(i)(3)(B)</Cite>
        </p>

        <h2>Common situations</h2>
        <ul className="link-list">
          <li>
            <a href="/idaho/shared-custody-child-support/">Shared and 50/50 custody</a>: how the 25% line and the 1.5 multiplier work
          </li>
          <li>
            <a href="/idaho/child-support-health-insurance/">Health insurance, child care and the tax benefit</a>
          </li>
          <li>
            <a href="/idaho/child-support-worksheet/">The child support worksheet (Forms 5, 6 and 7)</a>
          </li>
        </ul>
      </>
    ),
  },

  {
    path: '/idaho/how-child-support-is-calculated/',
    title: 'How Idaho Child Support Is Calculated (Rule 120 Schedule & Formula)',
    description:
      'Step by step: Idaho Guidelines Income, the basic child support schedule for 1 to 5 children, income shares, custody adjustments, the $50 minimum and the $440,000 cap.',
    h1: 'How Idaho child support is calculated',
    crumb: 'How it’s calculated',
    body: (
      <>
        <p className="lede">
          Idaho’s Child Support Guidelines are court rule <Cite>120</Cite>, amended effective July 1, 2025. They use an <em>income shares</em>{' '}
          model: support is set from both parents’ incomes combined, then divided between them in proportion to income.
        </p>

        <h2>1. Guidelines Income</h2>
        <p>
          Start with each parent’s <strong>gross income</strong> from any source: wages, salary, commissions, bonuses, business income, interest,
          pensions, social security and other benefits, alimony received, and more <Cite>120(e)(1)(A)</Cite>. Business income is receipts minus
          ordinary and necessary expenses, straight-line depreciation and one-half of self-employment tax <Cite>120(e)(1)(C)</Cite>. Significant
          employment benefits such as a company car or housing count <Cite>120(e)(2)</Cite>, and a parent who is voluntarily unemployed or
          underemployed can be assigned <strong>potential income</strong> <Cite>120(e)(3)</Cite>.
        </p>
        <p>From gross income, subtract <Cite>120(f)</Cite>:</p>
        <ul>
          <li>child support or spousal maintenance ordered in another case;</li>
          <li>spousal maintenance ordered in this case;</li>
          <li>a shown pattern of support paid without an order for a child of another relationship;</li>
          <li>
            for each child of another relationship living in the parent’s home, the guideline support for that child computed from that parent’s
            income alone. The rule’s example: a parent earning $1,800 a month deducts $312, leaving $1,488.
          </li>
        </ul>

        <h2>2. The basic obligation</h2>
        <p>
          Add both parents’ annual Guidelines Income. The schedule applies a percentage to each slice of that combined income, like tax brackets,
          and the sum is the basic obligation for all the children <Cite>120(i)(1)</Cite>:
        </p>
        <ScheduleTable />
        <p className="muted small">
          The rule also prints per-month and per-year dollar columns. In its last row, the dollar figure is the running total through $150,000 (for
          example $15,100 for one child), not the amount for that slice; the percentages are what the schedule applies.
        </p>
        <p>
          The schedule stops at combined income of ${cap} a year. Support on that amount is calculated normally, and the court may award more after
          considering factors such as the child’s needs and the standard of living during the marriage <Cite>120(i)(7)</Cite>. The schedules for
          five children are not a limit for larger families <Cite>120(i)(2)</Cite>.
        </p>

        <h2>3. Each parent’s share</h2>
        <p>
          Each parent is responsible for the basic obligation in proportion to their Guidelines Income <Cite>120(c)(1)</Cite>. If one parent earns
          70% of the combined income, their share is 70% of the basic obligation.
        </p>

        <h2>4. Custody: who pays whom</h2>
        <p>
          Custody is measured in <strong>overnights per calendar year</strong> <Cite>120(i)(3)(A)</Cite>. Every other weekend is 52 overnights, or
          about 14%.
        </p>
        <ul>
          <li>
            <strong>Primary custody.</strong> When one parent has 25% or fewer of the overnights, that parent pays their share to the other{' '}
            <Cite>120(i)(3)(B)</Cite>.
          </li>
          <li>
            <strong>Shared custody.</strong> When each parent has more than 25%, the basic obligation is multiplied by 1.5, divided by income, and
            each parent’s amount is multiplied by the time the children spend with the other parent; the larger amount pays the difference{' '}
            <Cite>120(i)(4)</Cite>. <a href="/idaho/shared-custody-child-support/">See shared custody in detail →</a>
          </li>
          <li>
            <strong>Split custody.</strong> When each parent has at least one child living primarily with them, support is calculated per child with
            the 1.5 multiplier for an equal number of children in each home, then offset <Cite>120(i)(6)</Cite>.
          </li>
        </ul>

        <h2>5. Adjustments</h2>
        <p>
          Work-related child care, the children’s health insurance premium, uncovered medical costs, the federal and Idaho tax benefit for claiming
          the children, and dependency benefits from a parent’s disability or retirement are handled separately <Cite>120(g)</Cite>.{' '}
          <a href="/idaho/child-support-health-insurance/">How each adjustment works →</a>
        </p>

        <h2>Floors and limits</h2>
        <ul>
          <li>
            Support should rarely be zero. There is a rebuttable presumption of at least <strong>$50 per child per month</strong>, and when the
            paying parent’s income is under <strong>$800 a month</strong> the court should review incomes and living expenses carefully{' '}
            <Cite>120(c)(4)</Cite>.
          </li>
          <li>
            The court can depart from the guidelines when evidence shows the amount is inappropriate, stating the guidelines amount and the reasons
            on the record <Cite>120(b)(3)</Cite>.
          </li>
        </ul>

        <h2>How long support lasts</h2>
        <p>
          Support runs until 18, or up to 19 while a child is pursuing a high school education <Cite>120(a)</Cite>. The judgment states support for
          all the children and the amount due for the remaining children as each one ages out. Each step is recalculated from the schedule for the
          smaller number of children, not reduced proportionally <Cite>120(j)</Cite>.
        </p>
        <AppCta>Run the numbers</AppCta>
        <p className="muted small">
          Source: <a href={RULE_URL}>Idaho Rules of Family Law Procedure, Rule 120</a> (Idaho Supreme Court).
        </p>
      </>
    ),
  },

  {
    path: '/idaho/shared-custody-child-support/',
    title: 'Idaho Child Support with Shared or 50/50 Custody (2026)',
    description:
      'How Idaho calculates child support with shared custody: the 25% (92-overnight) threshold, the 1.5 multiplier, worked examples, 50/50 schedules, split and mixed custody.',
    h1: 'Child support with shared or 50/50 custody in Idaho',
    crumb: 'Shared custody',
    estimator: true,
    faq: sharedFaq,
    body: (
      <>
        <p className="lede">
          When each parent has the children for more than 25% of the overnights in a year, Idaho uses a shared-custody calculation instead of the
          standard one <Cite>120(i)(4)</Cite>. Counting overnights out of 365, the line falls between <strong>91 nights (primary)</strong> and{' '}
          <strong>92 nights (shared)</strong>.
        </p>
        <Estimator />

        <h2>The formula</h2>
        <ol className="steps">
          <li>Multiply the basic obligation by 1.5, recognizing the cost of two homes.</li>
          <li>Multiply that by each parent’s share of income.</li>
          <li>Multiply each parent’s result by the share of time the children spend with the <em>other</em> parent.</li>
          <li>Offset the two amounts. The parent who owes more pays the difference.</li>
        </ol>
        <p>
          A parent never pays more than they would if all the children lived with the other parent. And when the paying parent has more than 50%
          of the overnights, they may show the payment is inappropriate under the factors in <Cite>120(i)(7)</Cite> <Cite>120(i)(4)(B)</Cite>.
        </p>

        <h2>Worked example</h2>
        <p>
          Parent A earns $60,000 a year and Parent B $40,000, with two children. Parent B has 110 overnights (30%), Parent A the other 255. The
          basic obligation for $100,000 combined is ${sharedExample.basic} a month.
        </p>
        <ul className="calc-list">
          <li>
            Parent A: ${sharedExample.basic} × 1.5 × 60% × (110 ÷ 365) ≈ <strong>${sharedExample.oA}</strong>
          </li>
          <li>
            Parent B: ${sharedExample.basic} × 1.5 × 40% × (255 ÷ 365) ≈ <strong>${sharedExample.oB}</strong>
          </li>
          <li>
            Parent B pays the difference: <strong>${sharedExample.support} a month</strong>, below the ${sharedExample.cap} Parent B would pay with
            the children living full-time with Parent A.
          </li>
        </ul>

        <h2>The 25% line matters</h2>
        <p>
          With the same incomes, the paying parent owes about <strong>${cliffExample.at91}</strong> a month at 91 overnights and about{' '}
          <strong>${cliffExample.at92}</strong> at 92, because crossing 25% switches to the shared calculation. That is why the exact overnight
          count deserves care, and why the calculator shows how support changes across the whole range in mediation mode.
        </p>

        <h2>Equal (50/50) time</h2>
        <p>
          With equal time, support usually still flows from the higher earner. With incomes of $72,000 and $48,000 and two children, the parent
          earning {equalTimeExample.shareA}% of the combined income pays about <strong>${equalTimeExample.support} a month</strong> in base support.
          Common equal-time schedules such as alternating weeks, 2-2-3 and 5-2-2-5 all come to 182 or 183 overnights.
        </p>

        <h2>Split and mixed custody</h2>
        <p>
          When each parent has at least one child living primarily with them, support is computed per child, with the 1.5 multiplier applied to an
          equal number of children in each home <Cite>120(i)(6)</Cite>. For three children with two in one home and one in the other, one child in
          each home carries the multiplier. Families where some children are shared and others are not use the same per-child worksheet, Form 7.
        </p>

        <h2>Extended visits</h2>
        <p>
          In primary custody only, the court may reduce support while the paying parent has the children for 14 or more consecutive days; a 50%
          reduction for that period is described as reasonable <Cite>120(i)(5)</Cite>.
        </p>
        <AppCta>Try your schedule</AppCta>
      </>
    ),
  },

  {
    path: '/idaho/child-support-health-insurance/',
    title: 'Idaho Child Support: Health Insurance, Child Care & Tax Benefit',
    description:
      'How Idaho child support handles the children’s health insurance, uncovered medical costs, work-related child care, the tax benefit and SSDI dependency benefits.',
    h1: 'Health insurance, child care and the tax benefit',
    crumb: 'Insurance & child care',
    body: (
      <>
        <p className="lede">
          The basic schedule doesn’t cover everything. Rule 120(g) adds several adjustments, each shared in proportion to the parents’ incomes.
        </p>

        <h2>Health insurance</h2>
        <p>
          Every order must consider health insurance for the children, ideally provided by the parent who can get appropriate coverage through an
          employer at lower cost. The children’s premium is shared by income share. It is normally paid directly between the parents, but a
          parent’s share may instead be calculated into the support amount as a credit or an addition <Cite>120(g)(4)(A)</Cite>.
        </p>
        <h3>Uncovered medical costs</h3>
        <p>
          Health care costs insurance doesn’t pay, including orthodontic, optical, dental, psychological and prescription costs, are shared by the
          same percentages. An out-of-pocket cost to the other parent of more than $500 for a course of treatment needs advance written approval
          from both parents or a prior court order <Cite>120(g)(4)(B)</Cite>.
        </p>

        <h2>Work-related child care</h2>
        <p>
          The basic calculation doesn’t include work-related child care. The court may order it shared in proportion to income, paid directly
          between the parents unless they agree otherwise <Cite>120(g)(1)</Cite>.
        </p>

        <h2>The tax benefit</h2>
        <p>
          The parent who claims the children gets a federal and Idaho tax benefit, mainly the child tax credit. The Idaho Supreme Court publishes
          tables of that benefit by income for a remarried parent, a single parent with custody and a single parent without custody. Unless the
          parents agree otherwise, the parent with the greater benefit claims the children, and the other parent receives a pro rata share of the
          benefit as a credit against or addition to support <Cite>120(g)(3)</Cite>.
        </p>
        <p>
          Children who turn 17 or older during the tax year are not counted, because the child tax credit ends that year. When the non-custodial
          parent claims the children, the custodial parent must sign IRS Form 8332 by January 31 each year, and the judgment should say so.
        </p>

        <h2>Disability and retirement dependency benefits</h2>
        <p>
          Benefits paid to the receiving parent because of the paying parent’s disability or retirement can reduce support, but the paying parent
          is not reimbursed for any amount above the support owed <Cite>120(g)(5)</Cite>. Those benefits are also added to the disabled or retired
          parent’s income <Cite>120(e)(1)(A)</Cite>.
        </p>
        <AppCta>Include these in a calculation</AppCta>
      </>
    ),
  },

  {
    path: '/idaho/child-support-worksheet/',
    title: 'Idaho Child Support Worksheet: Forms 5, 6 and 7 Explained',
    description:
      'Which Idaho child support forms you need: Form 5 Affidavit Verifying Income, Form 6 Standard Child Support Worksheet, and Form 7 Shared, Split or Mixed Custody Worksheet.',
    h1: 'The Idaho child support worksheet',
    crumb: 'Worksheet',
    body: (
      <>
        <p className="lede">
          In every child support case, the court receives an Affidavit Verifying Income and a child support worksheet <Cite>120(h)</Cite>. The
          forms are published by the Idaho Supreme Court with the Rules of Family Law Procedure.
        </p>

        <table className="forms-table">
          <thead>
            <tr>
              <th scope="col">Form</th>
              <th scope="col">Used for</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Form 5: Affidavit Verifying Income</th>
              <td>Each parent’s annual income, deductions and Guidelines Income, sworn under penalty of perjury.</td>
            </tr>
            <tr>
              <th scope="row">Form 6: Standard Child Support Worksheet</th>
              <td>Primary custody: one parent has 25% or fewer of the overnights for all the children.</td>
            </tr>
            <tr>
              <th scope="row">Form 7: Shared, Split, or Mixed Custody Worksheet</th>
              <td>Every other arrangement. It works child by child, so it handles shared, split and mixed custody.</td>
            </tr>
          </tbody>
        </table>

        <h2>Form 6, line by line</h2>
        <ol className="steps">
          <li>Monthly Guidelines Income for each parent and combined (from Form 5).</li>
          <li>Each parent’s percentage share of the combined income.</li>
          <li>The basic child support obligation from the schedule.</li>
          <li>Each parent’s share of that obligation.</li>
          <li>Recommended base support: the non-custodial parent’s amount.</li>
          <li>Other costs: child care, health insurance premiums and the tax benefit, each as a plus or minus.</li>
          <li>The total amount to be ordered.</li>
        </ol>

        <h2>Form 7, in brief</h2>
        <p>
          Form 7 divides each parent’s share among the children, applies the 1.5 multiplier to shared and split-custody children, multiplies by
          the share of overnights with the other parent (entering 1 at 75% or more and 0 at 25% or less), and offsets the totals. The same other-cost
          lines follow.
        </p>

        <h2>Filling the forms</h2>
        <p>
          The <a href={APP_PATH}>full calculator</a> fills the court’s own Forms 5, 6 and 7 with your numbers and lets you download them as one PDF.
          Blank forms are on the Idaho Supreme Court’s <a href={FORMS_URL}>Rules of Family Law Procedure page</a>.
        </p>
        <p className="muted small">
          Note: the current Form 5 still cites “I.R.F.L.P. 126”, the rule number before the 2021 renumbering, and has no separate lines for
          spousal maintenance in the current case or unordered support; those are reported with other child support and alimony.
        </p>
        <AppCta>Fill the worksheet</AppCta>
      </>
    ),
  },

  {
    path: '/idaho/for-attorneys/',
    title: 'Idaho Child Support Software for Attorneys & Mediators',
    description:
      'Child support software for Idaho family law attorneys and mediators: Rule 120 calculations, filled Forms 5–7, order language, step-downs and live mediation scenarios.',
    h1: 'Built for Idaho family law attorneys and mediators',
    crumb: 'For attorneys',
    body: (
      <>
        <p className="lede">
          Everything you need to put a child support number in front of a court or across a mediation table, built directly from <Cite>120</Cite> as
          amended July 1, 2025.
        </p>
        <div className="features">
          <div>
            <h3>Every line shown</h3>
            <p>Guidelines Income, shares, each schedule bracket, Form 7’s per-child boxes, the shared-custody cap: nothing is a black box.</p>
          </div>
          <div>
            <h3>The court’s own forms</h3>
            <p>Forms 5, 6 and 7 filled with your numbers and caption, ready to review and file.</p>
          </div>
          <div>
            <h3>Order language</h3>
            <p>Draft judgment wording for the amount, due date, the 120(j) step-down, insurance, uncovered expenses and Form 8332.</p>
          </div>
          <div>
            <h3>Mediation mode</h3>
            <p>Two proposals side by side, adjusted live: overnights, income, exemptions, insurance. See exactly where 25% changes the number.</p>
          </div>
          <div>
            <h3>All custody types</h3>
            <p>Primary, shared, split and mixed, plus other children in the home, self-employment, imputed income and dependency benefits.</p>
          </div>
          <div>
            <h3>Private by design</h3>
            <p>Calculations and saved cases stay in your browser. No client data is sent to or stored on any server.</p>
          </div>
        </div>

        <h2>How accuracy is handled</h2>
        <p>
          The calculation engine reproduces the rule’s own worked examples exactly and is covered by dozens of automated tests and thousands of randomized checks. Where the rule
          leaves a choice open, such as rounding or how the 1.5 multiplier pairs children in mixed custody, the choice is documented and adjustable
          rather than hidden.
        </p>

        <h2>Pricing</h2>
        <p>Free while in beta. Professional plans will follow; beta users will be offered founding pricing.</p>
        <p>
          <a href="/idaho/idaho-child-support-online-alternative/">Switching from Idaho Child Support Online? →</a>
        </p>
        <AppCta>Open the calculator</AppCta>
      </>
    ),
  },

  {
    path: '/idaho/idaho-child-support-online-alternative/',
    title: 'An Alternative to Idaho Child Support Online (ICSP)',
    description:
      'Looking for an alternative to Idaho Child Support Online? A modern Rule 120 calculator with the official worksheets, mediation mode and private, in-browser storage.',
    h1: 'A modern alternative to Idaho Child Support Online',
    crumb: 'ICSP alternative',
    body: (
      <>
        <p className="lede">
          Idaho Child Support Online (ICSP), from Moonlighting Software, is the subscription calculator many Idaho practitioners use. If you’re
          looking for an alternative, here is what this calculator offers.
        </p>
        <ul className="checks">
          <li>Built on Rule 120 as amended effective July 1, 2025, with each interpretation documented.</li>
          <li>Fills the Idaho Supreme Court’s Forms 5, 6 and 7 directly.</li>
          <li>Mediation mode: compare proposals side by side and adjust them live with both parties in the room.</li>
          <li>Drafts order language, including the step-down schedule Rule 120(j) requires.</li>
          <li>Prints a one-page summary for clients.</li>
          <li>Runs in your browser; case data never leaves your computer.</li>
          <li>Free while in beta.</li>
        </ul>
        <p className="muted small">
          This site is independent and is not affiliated with Moonlighting Software or Idaho Child Support Online. Product names are used only to
          identify them. Results can differ from other tools where the rule leaves rounding and similar details open, so compare before filing.
        </p>
        <AppCta>Try it with a recent case</AppCta>
      </>
    ),
  },
];
