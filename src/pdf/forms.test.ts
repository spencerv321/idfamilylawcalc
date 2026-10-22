/**
 * Fills each official form for the example cases, then reads the text back out
 * of the PDF and checks each value landed on the right line.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { calculate } from '../../engine';
import { toEngineInput, type CaseFile } from '../model/case';
import { primaryExample, sharedExample, splitExample } from '../model/samples';
import { fillForm5, fillForm6, fillForm7, fillPacket, type FormBytes } from './forms';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const forms: FormBytes = {
  form5: new Uint8Array(readFileSync(join(root, 'public/forms/form5.pdf'))),
  form6: new Uint8Array(readFileSync(join(root, 'public/forms/form6.pdf'))),
  form7: new Uint8Array(readFileSync(join(root, 'public/forms/form7.pdf'))),
};

/** Text items with position: x = left edge, top = baseline from top of page. */
async function textItems(bytes: Uint8Array) {
  const doc = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
  const pages: { str: string; x: number; right: number; top: number }[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(
      content.items
        .filter((it): it is Extract<typeof it, { str: string }> => 'str' in it && it.str.trim() !== '')
        .map((it) => ({ str: it.str, x: it.transform[4], right: it.transform[4] + it.width, top: 792 - it.transform[5] })),
    );
  }
  return pages;
}

/** Assert `value` is drawn on `page` with its baseline within 3pt of the label's row. */
function expectOnRow(pages: Awaited<ReturnType<typeof textItems>>, page: number, label: string, value: string, minX = 300) {
  const row = pages[page]!.find((t) => t.str.includes(label));
  expect(row, `label "${label}" on page ${page + 1}`).toBeDefined();
  const hit = pages[page]!.find((t) => t.str === value && Math.abs(t.top - row!.top) < 9 && t.x > minX);
  expect(hit, `"${value}" on the "${label}" row (page ${page + 1})`).toBeDefined();
}

function run(c: CaseFile) {
  return calculate(toEngineInput(c, c.options));
}

const outDir = join(root, 'test-results', 'pdf');
const save = (name: string, bytes: Uint8Array) => {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, name), bytes);
};

describe('Form 6 (primary custody)', () => {
  it('fills incomes, shares, basic, base support and total on their lines', async () => {
    const c = primaryExample();
    const r = run(c);
    expect(r.custody.form).toBe(6);
    const bytes = await fillForm6(forms.form6, c, r);
    save('form6-primary.pdf', bytes);
    const pages = await textItems(bytes);

    expectOnRow(pages, 0, 'MONTHLY', '2,083'); // $25,000 / 12, whole dollars
    expectOnRow(pages, 0, 'MONTHLY', '2,917'); // combined $35,000 / 12
    expectOnRow(pages, 0, 'PERCENTAGE', '71.43');
    expectOnRow(pages, 0, 'BASIC CHILD', '709');
    expectOnRow(pages, 0, 'RECOMMENDED', '506');
    // Party names sit on the line above the "Petitioner," label.
    expect(pages[0]!.some((t) => t.str === 'Alex Rivera' && Math.abs(t.top - 300) < 3)).toBe(true);
    expectOnRow(pages, 1, 'ORDERED', r.result.totalMonthly.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    expect(pages[0]!.some((t) => t.str === 'Casey Rivera')).toBe(true);
  });
});

describe('Form 7 (shared and split)', () => {
  it('shared: per-child grid and lines 9-10', async () => {
    const c = sharedExample();
    const r = run(c);
    expect(r.custody.form).toBe(7);
    const bytes = await fillForm7(forms.form7, c, r);
    save('form7-shared.pdf', bytes);
    const pages = await textItems(bytes);
    const $ = (d: { toFixed(n: number): string }) => d.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    expectOnRow(pages, 0, 'MONTHLY', $(r.income.A.guidelinesIncome.monthly));
    expectOnRow(pages, 0, '(apply line 1', $(r.basic.monthly));
    expectOnRow(pages, 1, '(total from all', $(r.custody.obligations.A), 360);
    expectOnRow(pages, 1, '(total from all', $(r.custody.obligations.B), 360);
    expectOnRow(pages, 1, 'subtract', $(r.result.baseSupport), 360);
    // Line 7 proportions: A's obligation runs on B's 110/365.
    expect(pages[1]!.some((t) => t.str === '0.3014')).toBe(true);
    expectOnRow(pages, 2, 'ORDERED', $(r.result.totalMonthly), 400);
  });

  it('split: a 2+1 case fills a worksheet', async () => {
    const c = splitExample();
    const r = run(c);
    expect(r.custody.type).toBe('split');
    const bytes = await fillForm7(forms.form7, c, r);
    save('form7-split.pdf', bytes);
    const pages = await textItems(bytes);
    expect(pages[1]!.filter((t) => t.str === '1').length).toBeGreaterThanOrEqual(2);
  });
});

describe('Form 5 and packet', () => {
  it('Form 5 fills annual income lines for both parents', async () => {
    const c = sharedExample();
    const r = run(c);
    const bytes = await fillForm5(forms.form5, c, r);
    save('form5-shared.pdf', bytes);
    const pages = await textItems(bytes);
    expectOnRow(pages, 0, 'Wages', '60,000', 380);
    expectOnRow(pages, 0, 'Rent', '44,000', 380); // 58,000 - 14,000
    expectOnRow(pages, 0, 'One-half', '3,000', 380);
    expectOnRow(pages, 1, 'GUIDELINES', '41,000', 380); // 44,000 - 3,000
    expectOnRow(pages, 1, 'MONTHLY', '3,416.67', 380);
  });

  it('packet = Form 5 + worksheet', async () => {
    const c = primaryExample();
    const bytes = await fillPacket(forms, c, run(c));
    save('packet-primary.pdf', bytes);
    expect((await textItems(bytes)).length).toBe(4);
  });
});
