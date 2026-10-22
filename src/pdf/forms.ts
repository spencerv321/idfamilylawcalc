/**
 * Fills the official I.R.F.L.P. Forms 5, 6 and 7. The court's PDFs have no
 * form fields, so values are drawn at measured positions on the unmodified
 * pages in public/forms/. Coordinates are PDF points measured from the TOP of
 * the page (as pdftotext -bbox reports them) and converted here.
 *
 * Positions depend on the exact files hashed in public/forms/SOURCES.md.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { Decimal, type CalculationResult, type ParentId } from '../../engine';
import { PARENTS, parseMoney, type CaseFile } from '../model/case';
import { formatDate, plain } from '../model/format';

const PAGE_H = 792;
const INK = rgb(0.05, 0.1, 0.35);

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
}

interface TextOpts {
  size?: number;
  align?: 'left' | 'right' | 'center';
  maxWidth?: number;
  bold?: boolean;
}

/** Draw text with its baseline at `top` points from the top of the page. */
function put(ctx: Ctx, page: PDFPage, s: string, x: number, top: number, o: TextOpts = {}) {
  if (!s) return;
  const font = o.bold ? ctx.bold : ctx.font;
  let size = o.size ?? 9.5;
  if (o.maxWidth) while (size > 5 && font.widthOfTextAtSize(s, size) > o.maxWidth) size -= 0.25;
  const w = font.widthOfTextAtSize(s, size);
  const dx = o.align === 'right' ? -w : o.align === 'center' ? -w / 2 : 0;
  page.drawText(s, { x: x + dx, y: PAGE_H - top, size, font, color: INK });
}

async function open(bytes: Uint8Array): Promise<Ctx> {
  const doc = await PDFDocument.load(bytes);
  return { doc, font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
}

const page = (ctx: Ctx, i: number) => ctx.doc.getPage(i);

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

interface CaptionLayout {
  /** Baselines for name, address, city/state/zip, phone, email. */
  filer: number[];
  filerX: number;
  district: [x: number, top: number];
  county: [x: number, top: number];
  caseNo: [x: number, top: number];
  petitioner: [x: number, top: number];
  respondent: [x: number, top: number];
  partyWidth: number;
}

function caption(ctx: Ctx, p: PDFPage, c: CaseFile, L: CaptionLayout) {
  const f = c.caption.filer;
  [f.name, f.address, f.cityStateZip, f.phone, f.email].forEach((v, i) =>
    put(ctx, p, v, L.filerX, L.filer[i]!, { maxWidth: 212 }),
  );
  put(ctx, p, c.caption.district, L.district[0], L.district[1], { align: 'center', maxWidth: 62 });
  put(ctx, p, c.caption.county, L.county[0], L.county[1], { maxWidth: 120 });
  put(ctx, p, c.caption.caseNumber, L.caseNo[0], L.caseNo[1], { maxWidth: 148 });
  const pet = c.caption.petitioner;
  const other: ParentId = pet === 'A' ? 'B' : 'A';
  put(ctx, p, c.parents[pet].name, L.petitioner[0], L.petitioner[1], { maxWidth: L.partyWidth });
  put(ctx, p, c.parents[other].name, L.respondent[0], L.respondent[1], { maxWidth: L.partyWidth });
}

type Money = (d: Decimal) => string;
const moneyFn = (r: CalculationResult): Money => (d) => plain(d, r.options.rounding === 'rule-example' ? 0 : 2);

function preparedOn(dateIso: string) {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  const month = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const suffix = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th';
  return { day: `${d}${suffix}`, month, yy: String(y).slice(2), y: String(y) };
}

// ---------------------------------------------------------------------------
// Form 5: Affidavit Verifying Income (annual figures, both parents)
// ---------------------------------------------------------------------------

/** Right edges of the two (PARENT) columns, and each line's baseline [page, top]. */
const F5 = {
  colRight: { A: 444, B: 516 } as Record<ParentId, number>,
  colCenter: { A: 421, B: 492 } as Record<ParentId, number>,
  lines: {
    A1: [0, 451], A2: [0, 470], A3: [0, 502], A4: [0, 533], A5: [0, 552], A6: [0, 571], A7: [0, 590], A8: [0, 609], A9: [0, 628],
    B1: [0, 679], B2: [0, 698], B3: [0, 717],
    B4: [1, 94], B5: [1, 113], C: [1, 132], D: [1, 170], E: [1, 208], F: [1, 246], G: [1, 272],
  } as Record<string, [number, number]>,
};

export async function fillForm5(bytes: Uint8Array, c: CaseFile, r: CalculationResult): Promise<Uint8Array> {
  const ctx = await open(bytes);
  caption(ctx, page(ctx, 0), c, {
    filer: [79, 110, 141, 172, 204],
    filerX: 74,
    district: [346, 249],
    county: [420, 268],
    caseNo: [374, 297],
    petitioner: [74, 300],
    respondent: [74, 350],
    partyWidth: 210,
  });

  const whole = (d: Decimal) => plain(d, 0);
  for (const p of PARENTS) {
    const g = r.income[p];
    const i = c.parents[p].income;
    const bd = g.businessDetail;
    // A3-A8 split the engine's single otherIncome back into the form's lines.
    const otherIncome = (k: 'interestDividendsPensions' | 'benefits' | 'publicAssistance' | 'alimony' | 'grantsTrusts' | 'other') =>
      whole(new Decimal(parseMoney(i[k]) ?? '0'));
    const counted = g.overtimeExcluded ? g.wages : g.wages.plus(g.overtimeOrSecondJob);
    const A9 = counted
      .plus(bd.grossReceipts.minus(bd.ordinaryAndNecessaryExpenses))
      .plus(g.otherIncome);
    const B3 = g.otherCourtOrders.plus(g.spousalMaintenanceThisCase).plus(g.supportWithoutOrder);
    const B5 = bd.straightLineDepreciation.plus(bd.halfSelfEmploymentTax).plus(B3).plus(g.otherChildrenDeduction.annual);
    const C = A9.minus(B5);

    const values: Record<string, string> = {
      A1: whole(counted),
      A2: whole(bd.grossReceipts.minus(bd.ordinaryAndNecessaryExpenses)),
      A3: otherIncome('interestDividendsPensions'),
      A4: otherIncome('benefits'),
      A5: otherIncome('publicAssistance'),
      A6: otherIncome('alimony'),
      A7: otherIncome('grantsTrusts'),
      A8: otherIncome('other'),
      A9: whole(A9),
      B1: whole(bd.straightLineDepreciation),
      B2: whole(bd.halfSelfEmploymentTax),
      B3: whole(B3),
      B4: whole(g.otherChildrenDeduction.annual),
      B5: whole(B5),
      C: whole(C),
      D: whole(g.employmentBenefits),
      E: whole(g.potentialIncome),
      F: whole(g.guidelinesIncome.annual),
      G: plain(g.guidelinesIncome.monthly, 2),
    };
    const totals = new Set(['A9', 'B5', 'C', 'F', 'G']);
    for (const [key, [pg, top]] of Object.entries(F5.lines)) {
      const v = values[key] ?? '';
      if (v === '0' && !totals.has(key)) continue;
      put(ctx, page(ctx, pg), v, F5.colRight[p], top, { align: 'right', size: 9, maxWidth: 50 });
    }
    // Parent's name above the "(PARENT)" heading in each section.
    put(ctx, page(ctx, 0), c.parents[p].name, F5.colCenter[p], 414.5, { align: 'center', size: 7, maxWidth: 66 });
    put(ctx, page(ctx, 0), c.parents[p].name, F5.colCenter[p], 638.5, { align: 'center', size: 7, maxWidth: 66 });
  }
  put(ctx, page(ctx, 1), 'Amounts are annual. Line G is monthly.', 72, 292, { size: 7.5 });
  return ctx.doc.save();
}

// ---------------------------------------------------------------------------
// Form 6: Standard Child Support Worksheet (primary custody)
// ---------------------------------------------------------------------------

const F6 = { A: 402, B: 463, C: 526 } as const;

function childrenRows(r: CalculationResult) {
  return r.children.included.map((ch) => ({ name: ch.name ?? ch.id, dob: formatDate(ch.birthDate) }));
}

/** Signed amount relative to the payer: positive increases what the payer owes. */
const forPayer = (signed: Decimal, payer: ParentId) => (payer === 'A' ? signed : signed.negated());

export async function fillForm6(bytes: Uint8Array, c: CaseFile, r: CalculationResult): Promise<Uint8Array> {
  const ctx = await open(bytes);
  const p1 = page(ctx, 0);
  const p2 = page(ctx, 1);
  const $ = moneyFn(r);
  const opt = { align: 'right' as const, maxWidth: 40 };
  const col = (p: ParentId) => (p === 'A' ? F6.A : F6.B);

  caption(ctx, p1, c, {
    filer: [71.5, 100, 131, 162, 193],
    filerX: 74,
    district: [346, 249],
    county: [420, 268],
    caseNo: [374, 297],
    petitioner: [74, 300],
    respondent: [74, 350],
    partyWidth: 210,
  });

  const kids = childrenRows(r);
  kids.slice(0, 4).forEach((k, i) => {
    const top = [422, 440, 457, 474][i]!;
    put(ctx, p1, k.name, 74, top, { maxWidth: 248 });
    put(ctx, p1, k.dob, 362, top);
  });
  if (kids.length > 4) put(ctx, p1, `Also: ${kids.slice(4).map((k) => `${k.name} (${k.dob})`).join('; ')}`, 74, 486, { size: 7, maxWidth: 270 });

  // Column headings: each parent's name above "PARENT".
  for (const p of PARENTS) put(ctx, p1, c.parents[p].name, (col(p) + col(p) - 46) / 2 + 2, 486, { align: 'center', size: 6.5, maxWidth: 58 });

  for (const p of PARENTS) {
    put(ctx, p1, $(r.income[p].guidelinesIncome.monthly), col(p), 518.5, opt);
    put(ctx, p1, r.shares[p].times(100).toFixed(2), col(p) - 10, 540, { align: 'right', maxWidth: 34 });
    put(ctx, p1, $(r.custody.parentShareOfBasic[p]), col(p), 614, opt);
  }
  put(ctx, p1, $(r.shares.combinedAnnual.div(12)), F6.C, 518.5, opt);
  put(ctx, p1, $(r.basic.monthly), F6.C, 581.5, opt);

  const payer = r.custody.payer;
  if (payer) put(ctx, p1, $(r.result.baseSupport), col(payer), 642.3, opt);

  // Line 6 "other costs". Inside-support adjustments go in the payer's column
  // (+ adds to support, - credits it). Directly paid expenses show each
  // parent's share and the word "direct".
  const lines = r.lines;
  const otherCostsForPayer = payer
    ? forPayer(lines.childCare!.plus(lines.healthInsurance!).plus(lines.taxBenefit!), payer)
    : null;
  const signed = (d: Decimal) => (d.isZero() ? '0' : `${d.isNegative() ? '-' : '+'}${$(d.abs())}`);

  const cc = r.adjustments.childCare;
  if (cc.length) {
    const total = cc.reduce((a, e) => a.plus(e.monthly), new Decimal(0));
    put(ctx, p2, $(total), F6.C, 85.9, opt);
    if (cc.some((e) => e.inSupport) && payer) {
      put(ctx, p2, signed(forPayer(lines.childCare!, payer)), col(payer), 85.9, opt);
    } else {
      for (const p of PARENTS) put(ctx, p2, $(total.times(r.shares[p])), col(p), 85.9, opt);
      put(ctx, p2, 'paid direct', 296, 85.9, { size: 7 });
    }
  }
  const hi = r.adjustments.healthInsurance[0];
  if (hi) {
    put(ctx, p2, 'X', hi.paidBy === 'A' ? 116.5 : 168.5, 117.5, { size: 8, bold: true });
    put(ctx, p2, $(hi.monthly), F6.C, 117.9, opt);
    if (hi.inSupport && payer) {
      put(ctx, p2, signed(forPayer(lines.healthInsurance!, payer)), col(payer), 117.9, opt);
    } else {
      for (const p of PARENTS) put(ctx, p2, $(hi.share[p]), col(p), 117.9, opt);
      put(ctx, p2, 'paid direct', 296, 117.9, { size: 7 });
    }
    // Which parent is which checkbox: label the two "Parent" words.
    for (const p of PARENTS) put(ctx, p2, c.parents[p].name, p === 'A' ? 128 : 180, 126, { size: 6, maxWidth: 46 });
  }
  const tax = r.adjustments.taxBenefit;
  if (tax) {
    put(ctx, p2, $(tax.monthlyBenefit), F6.C, 136.8, opt);
    for (const p of PARENTS) put(ctx, p2, $(tax.monthlyBenefit.times(r.shares[p])), col(p), 152.2, opt);
    if (payer) put(ctx, p2, signed(forPayer(lines.taxBenefit!, payer)), col(payer), 167.8, opt);
    put(ctx, p2, `claimed by ${c.parents[tax.claimedBy].name}`, 270, 167.8, { size: 6.5, maxWidth: 80 });
  }
  if (payer && otherCostsForPayer) put(ctx, p1, signed(otherCostsForPayer), col(payer), 701.2, opt);

  const finalPayer = r.result.payer;
  if (finalPayer) put(ctx, p2, $(r.result.totalMonthly), col(finalPayer), 195.2, { ...opt, bold: true });
  if (r.adjustments.dependencyBenefit?.applied) {
    put(ctx, p2, `Includes 120(g)(5) dependency benefit credit of ${$(r.adjustments.dependencyBenefit.credit)}.`, 72, 214, { size: 7.5 });
  }

  const d = preparedOn(r.calculationDate);
  put(ctx, p2, d.day, 199.5, 250, { align: 'center', maxWidth: 33 });
  put(ctx, p2, d.month, 310, 250, { align: 'center', maxWidth: 98 });
  put(ctx, p2, d.yy, 381, 250);
  put(ctx, p2, c.caption.filer.name, 74, 301, { maxWidth: 212 });
  return ctx.doc.save();
}

// ---------------------------------------------------------------------------
// Form 7: Shared, Split, or Mixed Custody Worksheet
// ---------------------------------------------------------------------------

/** Page 2 grid: left edge of each child's A and B cell ("$" sign x). */
const F7_GRID: [number, number][] = [
  [214.7, 255.2],
  [291.2, 331.7],
  [372.2, 408.2],
  [448.8, 484.8],
  [520.8, 556.8],
];
/** Right edge of a grid cell: the next cell's "$" (or the grid edge), less padding. */
const f7CellRight = (child: number, parent: number) => (F7_GRID.flat()[child * 2 + parent + 1] ?? 592) - 9;

export async function fillForm7(bytes: Uint8Array, c: CaseFile, r: CalculationResult): Promise<Uint8Array> {
  const ctx = await open(bytes);
  const [p1, p2, p3] = [page(ctx, 0), page(ctx, 1), page(ctx, 2)];
  const $ = moneyFn(r);

  caption(ctx, p1, c, {
    filer: [118, 150, 181, 212, 243],
    filerX: 74,
    district: [346, 301],
    county: [420, 447],
    caseNo: [375, 336],
    petitioner: [28, 339],
    respondent: [28, 389],
    partyWidth: 210,
  });

  const kids = childrenRows(r);
  // [name x, name column right edge, birth date column center, baseline]
  const kidCells: [number, number, number, number][] = [
    [42, 162, 185, 511], [222, 354, 376, 511], [416, 545, 567, 511],
    [42, 162, 185, 538], [222, 354, 376, 538], [416, 545, 567, 538],
  ];
  kids.slice(0, 6).forEach((k, i) => {
    const [nx, nRight, dobCenter, top] = kidCells[i]!;
    put(ctx, p1, k.name, nx, top, { maxWidth: nRight - nx - 4, size: 8.5 });
    put(ctx, p1, k.dob, dobCenter, top, { align: 'center', maxWidth: 37, size: 7.5 });
  });

  // Page 1, lines 1-5. Columns: A, B, combined.
  const colR = { A: 392, B: 451, C: 512 };
  const o = { align: 'right' as const, maxWidth: 46 };
  for (const p of PARENTS) {
    put(ctx, p1, c.parents[p].name, colR[p] - 22, 554, { align: 'center', size: 6.5, maxWidth: 54 });
    put(ctx, p1, $(r.income[p].guidelinesIncome.monthly), colR[p], 593.5, o);
    put(ctx, p1, `${r.shares[p].times(100).toFixed(2)}%`, colR[p], 617, o);
    put(ctx, p1, $(r.custody.parentShareOfBasic[p]), colR[p], 671.7, o);
    put(ctx, p1, $(r.custody.perChildAllocation?.[p] ?? r.custody.parentShareOfBasic[p].div(r.children.included.length)), colR[p], 697.7, o);
  }
  put(ctx, p1, $(r.shares.combinedAnnual.div(12)), colR.C, 593.5, o);
  put(ctx, p1, '100.00%', colR.C, 617, o);
  put(ctx, p1, $(r.basic.monthly), colR.C, 645.6, o);

  // Page 2 grid: lines 6-8 per child (first five children).
  r.custody.children.slice(0, 5).forEach((ch, i) => {
    PARENTS.forEach((p, k) => {
      const x = F7_GRID[i]![k]!;
      const right = f7CellRight(i, k);
      const cell = { align: 'right' as const, maxWidth: right - x - 7, size: 7.5 };
      put(ctx, p2, $(ch.allocation[p]), right, 404.8, cell);
      put(ctx, p2, ch.proportion[p].toDecimalPlaces(4).toString(), right, 452, cell);
      put(ctx, p2, $(ch.obligation[p]), right, 512.7, cell);
    });
  });
  // Child labels over the Parent/Parent sub-heads.
  PARENTS.forEach((p, k) => {
    for (let i = 0; i < Math.min(5, r.custody.children.length); i++) {
      const x = F7_GRID[i]![k]!;
      put(ctx, p2, p, x + 14, 392, { size: 6.5, bold: true });
    }
  });

  // Lines 9 and 10.
  const nineX = { A: 470, B: 585 };
  for (const p of PARENTS) {
    put(ctx, p2, c.parents[p].name, nineX[p] - 46, 545, { align: 'center', size: 6.5, maxWidth: 70 });
    put(ctx, p2, $(r.custody.obligations[p]), nineX[p], 545.3, { align: 'right', maxWidth: 85 });
  }
  if (r.custody.payer) {
    put(ctx, p2, $(r.result.baseSupport), nineX[r.custody.payer], 577.8, { align: 'right', maxWidth: 85, bold: true });
  }

  // Page 3: other costs, single column, signed relative to the payer.
  const payer = r.custody.payer ?? r.result.payer;
  const signed = (d: Decimal) => (d.isZero() ? '0' : `${d.isNegative() ? '-' : '+'}${$(d.abs())}`);
  const rel = (d: Decimal) => (payer ? signed(forPayer(d, payer)) : $(d));
  const right = 534;
  const cc = r.adjustments.childCare;
  const hi = r.adjustments.healthInsurance[0];
  put(ctx, p3, cc.length ? (cc.some((e) => e.inSupport) ? rel(r.lines.childCare!) : 'direct') : '', right, 95.6, { align: 'right', maxWidth: 60 });
  put(ctx, p3, hi ? (hi.inSupport ? rel(r.lines.healthInsurance!) : 'direct') : '', right, 114.7, { align: 'right', maxWidth: 60 });
  if (r.adjustments.taxBenefit) put(ctx, p3, rel(r.lines.taxBenefit!), right, 157.5, { align: 'right', maxWidth: 60 });
  if (r.result.payer) put(ctx, p3, $(r.result.totalMonthly), right, 182.8, { align: 'right', maxWidth: 60, bold: true });

  // Comments block: who pays whom, plus anything the grid can't hold.
  const notes: string[] = [];
  const usd = (d: Decimal) => `$${$(d)}`;
  if (r.result.payer) {
    notes.push(`${c.parents[r.result.payer].name} pays ${c.parents[r.result.recipient!].name} ${usd(r.result.totalMonthly)} per month.`);
  }
  notes.push(`"Parent" columns: first = ${c.parents.A.name}, second = ${c.parents.B.name}. Other costs are + / - to the paying parent.`);
  const tax = r.adjustments.taxBenefit;
  if (tax) notes.push(`Tax benefit: ${usd(tax.monthlyBenefit)}/mo, claimed by ${c.parents[tax.claimedBy].name}.`);
  const direct = r.directPayments.map((e) => `${c.parents[e.owedBy].name} pays ${usd(e.owed)}/mo of ${e.kind === 'childCare' ? 'child care' : 'insurance'} directly`);
  if (direct.length) notes.push(direct.join('; ') + '.');
  if (r.adjustments.dependencyBenefit?.applied) notes.push(`Includes dependency benefit credit of ${usd(r.adjustments.dependencyBenefit.credit)}.`);
  if (r.custody.capApplied) notes.push(`Capped per I.R.F.L.P. 120(i)(4)(B)/(6)(B) at ${usd(r.custody.cap)}.`);
  if (r.custody.children.length > 5) notes.push(`Children 6+ are included in lines 9-10 but not shown in the grid.`);
  const commentTops = [207, 219.5, 232, 244.5];
  const commentX = [349, 74, 74, 74];
  const commentW = [190, 466, 466, 466];
  wrap(ctx, notes.join(' '), commentW, 7.5).forEach((ln, i) => {
    if (i < commentTops.length) put(ctx, p3, ln, commentX[i]!, commentTops[i]!, { size: 7.5 });
  });

  put(ctx, p3, formatDate(r.calculationDate), 104, 270);
  put(ctx, p3, c.caption.filer.name, 74, 308, { maxWidth: 212 });
  return ctx.doc.save();
}

/** Greedy word wrap into lines of the given widths (last width repeats). */
function wrap(ctx: Ctx, text: string, widths: number[], size: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    const width = widths[Math.min(out.length, widths.length - 1)]!;
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.font.widthOfTextAtSize(next, size) > width && cur) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

// ---------------------------------------------------------------------------
// Packet
// ---------------------------------------------------------------------------

export interface FormBytes {
  form5: Uint8Array;
  form6: Uint8Array;
  form7: Uint8Array;
}

/** The worksheet for this case's custody type: Form 6 (primary) or Form 7. */
export async function fillWorksheet(forms: FormBytes, c: CaseFile, r: CalculationResult) {
  return r.custody.form === 6 ? fillForm6(forms.form6, c, r) : fillForm7(forms.form7, c, r);
}

/** Form 5 followed by the worksheet, as one PDF. */
export async function fillPacket(forms: FormBytes, c: CaseFile, r: CalculationResult): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const bytes of [await fillForm5(forms.form5, c, r), await fillWorksheet(forms, c, r)]) {
    const src = await PDFDocument.load(bytes);
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
  }
  return out.save();
}
