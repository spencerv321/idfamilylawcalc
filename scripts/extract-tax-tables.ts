/**
 * Downloads the three ISC "Federal and Idaho Income Tax Benefit - per Exemption"
 * tables referenced by I.R.F.L.P. 120(g)(3) and extracts them to JSON in
 * engine/guidelines/tax/. Each JSON records its source URL, fetch date and
 * SHA-256 of the PDF so a future table change is detectable.
 *
 * Usage: pnpm extract-tax-tables            (download from ISC)
 *        pnpm extract-tax-tables --dir DIR  (use PDFs already saved in DIR)
 *
 * Validation is strict: every row must have 7 money cells, rows must be
 * contiguous (row.over === previous row.upTo), and the first row must start
 * at the documented floor. Any failure aborts without writing.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', 'guidelines', 'tax');

const TABLES = [
  {
    id: 'remarried',
    title: 'Remarried Parent',
    url: 'https://api.isc.idaho.gov/uploads/Documents/Forms/Rules_and_Procedures_Forms/1777484109709-IRFLP-120-Table_Remarried_Parent.pdf',
  },
  {
    id: 'single-no-custody',
    title: 'Single Parent - does not have custody',
    url: 'https://api.isc.idaho.gov/uploads/Documents/Forms/Rules_and_Procedures_Forms/1777484117934-IRFLP-120-Table_Single_Parent_No_Custody.pdf',
  },
  {
    id: 'single-has-custody',
    title: 'Single Parent - has custody',
    url: 'https://api.isc.idaho.gov/uploads/Documents/Forms/Rules_and_Procedures_Forms/1777484125237-IRFLP-120-Table_Single_Parent_Has_Custody.pdf',
  },
] as const;

export interface TaxRow {
  /** Annual Guidelines Income strictly greater than this... */
  over: number;
  /** ...and less than or equal to this. */
  upTo: number;
  /** Benefit for the 1st..5th child (annual dollars). Total for k children = sum of first k. */
  perChild: [number, number, number, number, number];
}

async function loadPdf(url: string, dir?: string): Promise<Uint8Array> {
  if (dir) return new Uint8Array(await readFile(join(dir, basename(url))));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Group text items into visual lines by y coordinate, left to right. */
async function pdfLines(data: Uint8Array): Promise<string[][]> {
  const doc = await getDocument({ data: data.slice(), useSystemFonts: true }).promise;
  const lines: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      const key = [...byY.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      if (!byY.has(key)) byY.set(key, []);
      byY.get(key)!.push({ x, s: item.str });
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      const cells = byY
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .flatMap((c) => c.s.trim().split(/\s+/));
      lines.push(cells);
    }
  }
  return lines;
}

const MONEY = /^\$[\d,]+$/;
const toNum = (s: string) => Number(s.replace(/[$,]/g, ''));

function parseRows(lines: string[][]): { rows: TaxRow[]; duplicates: TaxRow[] } {
  const rows: TaxRow[] = [];
  const duplicates: TaxRow[] = [];
  for (const cells of lines) {
    // Table rows start with a money cell; prose (e.g. the endnote's "$0") does not.
    if (!MONEY.test(cells[0] ?? '')) continue;
    const money = cells.filter((c) => MONEY.test(c));
    if (money.length !== 7 || money.length !== cells.length) {
      throw new Error(`Unexpected table line: ${cells.join(' ')}`);
    }
    const [over, upTo, ...perChild] = money.map(toNum) as number[];
    const row = { over: over!, upTo: upTo!, perChild: perChild as TaxRow['perChild'] };
    // The published remarried table prints one row twice ($532,000-$534,000).
    // Drop exact repeats of the previous row; anything else falls to validate().
    const prev = rows[rows.length - 1];
    if (prev && JSON.stringify(prev) === JSON.stringify(row)) {
      duplicates.push(row);
      continue;
    }
    rows.push(row);
  }
  return { rows, duplicates };
}

function validate(id: string, rows: TaxRow[]) {
  if (rows.length < 50) throw new Error(`${id}: only ${rows.length} rows parsed`);
  if (rows[0]!.over !== 4000) throw new Error(`${id}: first row starts at ${rows[0]!.over}, expected 4000`);
  rows.forEach((r, i) => {
    if (r.upTo <= r.over) throw new Error(`${id}: row ${i} has upTo <= over`);
    if (i > 0 && r.over !== rows[i - 1]!.upTo) {
      throw new Error(`${id}: gap between row ${i - 1} (${rows[i - 1]!.upTo}) and row ${i} (${r.over})`);
    }
  });
}

async function main() {
  const dirFlag = process.argv.indexOf('--dir');
  const dir = dirFlag >= 0 ? process.argv[dirFlag + 1] : undefined;
  await mkdir(OUT_DIR, { recursive: true });

  for (const t of TABLES) {
    const pdf = await loadPdf(t.url, dir);
    const sha256 = createHash('sha256').update(pdf).digest('hex');
    const { rows, duplicates } = parseRows(await pdfLines(pdf));
    validate(t.id, rows);

    const out = {
      id: t.id,
      title: `Federal and Idaho Income Tax Benefit - per Exemption, ${t.title}`,
      rule: 'I.R.F.L.P. 120(g)(3)',
      sourceUrl: t.url,
      fetchedAt: new Date().toISOString().slice(0, 10),
      sha256,
      notes:
        'Income is the parent\'s annual Guidelines Income. Row applies when over < income <= upTo. ' +
        'Income at or below the first row\'s "over" has no listed benefit. Children 17 or older are excluded (table endnote 4).',
      duplicateRowsDropped: duplicates,
      rows,
    };
    await writeFile(join(OUT_DIR, `${t.id}.json`), JSON.stringify(out, null, 2) + '\n');

    console.log(`\n== ${out.title}\n   ${rows.length} rows, sha256 ${sha256.slice(0, 16)}...`);
    for (const d of duplicates) console.log(`   NOTE: dropped duplicate printed row ${d.over}-${d.upTo}`);
    console.log('   over      upTo      c1     c2     c3     c4     c5');
    const sample = rows.length <= 12 ? rows : [...rows.slice(0, 6), null, ...rows.slice(-6)];
    for (const r of sample) {
      if (!r) {
        console.log('   ...');
        continue;
      }
      console.log(
        '   ' +
          [r.over, r.upTo].map((n) => String(n).padEnd(9)).join(' ') +
          r.perChild.map((n) => String(n).padStart(6)).join(' '),
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
