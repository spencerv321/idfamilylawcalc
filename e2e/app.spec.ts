import { expect, test } from '@playwright/test';

const shot = (name: string) => `test-results/screens/${name}.png`;

async function loadExample(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('button', { name: /Untitled case|Example|Saved on this device|Not saved/ }).first().click();
  await page.getByRole('menuitem', { name: label }).click();
}

test('primary example: Rule 120 numbers, worksheet and step-down', async ({ page }) => {
  await page.goto('/app/');
  await loadExample(page, 'Primary custody');
  const results = page.getByRole('complementary', { name: 'Results' });
  // Rule 120(i)(3): $709 basic, $506 base. Plus -$51 insurance credit and +$105 tax share = $560.
  await expect(results.locator('.big')).toContainText('$560');
  await expect(results.getByText('$709', { exact: true })).toBeVisible();
  await expect(results.getByText('Step-down schedule')).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Verify before filing');
  await page.screenshot({ path: shot('calculator-primary'), fullPage: true });
});

test('typing updates the result live and invalid money is flagged', async ({ page }) => {
  await page.goto('/app/');
  await page.getByLabel('Parent A name').fill('Pat');
  await page.getByLabel('Pat: wages').fill('60,000');
  await page.getByLabel('Parent B: wages').fill('40000');
  await page.getByLabel(/Birth date/).fill('2018-05-01');
  const results = page.getByRole('complementary', { name: 'Results' });
  await expect(results.locator('.big')).toBeVisible();
  await page.getByLabel('Pat: wages').fill('60k');
  await expect(page.getByText('Enter a number')).toBeVisible();
});

test('shared example: Form 7 worksheet and PDF download', async ({ page }) => {
  await page.goto('/app/');
  await loadExample(page, 'Shared custody');
  await expect(page.getByText('Shared custody · Form 7')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Both as one PDF' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/Forms\.pdf$/);
  await file.saveAs('test-results/screens/downloaded-packet.pdf');
  await page.screenshot({ path: shot('calculator-shared'), fullPage: true });
});

test('cases persist across reloads', async ({ page }) => {
  await page.goto('/app/');
  await loadExample(page, 'Split custody');
  await page.reload();
  await expect(page.locator('.case-title')).toHaveText('Example: split custody (2 + 1)');
});

test('mediation: two scenarios, sliders and delta', async ({ page }) => {
  await page.goto('/app/');
  await loadExample(page, 'Shared custody');
  await page.getByRole('button', { name: 'Mediation' }).click();
  await page.getByRole('button', { name: 'Start from this case' }).click();
  const right = page.getByRole('region', { name: 'Proposal 2' });
  await right.getByRole('spinbutton', { name: 'Overnights with Morgan Lee' }).fill('300');
  await expect(right.locator('.delta')).toBeVisible();
  await expect(right.getByText(/Lives with Morgan Lee/)).toBeVisible();
  await right.locator('svg').hover({ position: { x: 200, y: 100 } });
  await page.screenshot({ path: shot('mediation'), fullPage: true });
});

test('narrow screen layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/');
  await loadExample(page, 'Primary custody');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: shot('mobile'), fullPage: true });
});

test('works under the production Content-Security-Policy (public/_headers)', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const csp = readFileSync('public/_headers', 'utf8').match(/Content-Security-Policy: (.*)/)![1]!;
  const violations: string[] = [];
  page.on('console', (m) => m.text().includes('Content Security Policy') && violations.push(m.text()));
  await page.route('**/*', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp } });
  });
  await page.goto('/app/');
  await loadExample(page, 'Shared custody');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Both as one PDF' }).click();
  await download;
  await page.getByRole('button', { name: 'Mediation' }).click();
  await page.getByRole('button', { name: 'Start from this case' }).click();
  await expect(page.locator('.ov-chart svg').first()).toBeVisible();
  // A request to another origin must be blocked.
  const blocked = await page.evaluate(() => fetch('https://example.com').then(() => false, () => true));
  expect(blocked).toBe(true);
  // Blocked by the policy itself, not just by a missing network.
  expect(violations.some((v) => v.includes('example.com'))).toBe(true);
  expect(violations.filter((v) => !v.includes('example.com'))).toEqual([]);
});

test('light by default; theme toggle switches and persists', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/app/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: shot('dark') });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('schedule preset fills overnights; monthly entry stores annual', async ({ page }) => {
  await page.goto('/app/');
  await loadExample(page, 'Primary custody');
  await page.getByLabel('Schedule describes time with').getByRole('radio', { name: 'Alex Rivera' }).click();
  await page.getByLabel('Common schedule').first().selectOption('eow-midweek');
  await expect(page.getByRole('spinbutton', { name: 'Overnights with Alex Rivera' }).first()).toHaveValue('104');
  await expect(page.getByText('Shared').first()).toBeVisible();

  await page.getByLabel('Enter income as').getByRole('radio', { name: 'Monthly' }).click();
  const wages = page.getByLabel('Alex Rivera: wages');
  await expect(wages).toHaveValue('2,083.33'); // $25,000 a year, shown monthly
  await wages.fill('5000');
  await wages.blur();
  await page.getByLabel('Enter income as').getByRole('radio', { name: 'Annual' }).click();
  await expect(page.getByLabel('Alex Rivera: wages')).toHaveValue('60000');
});

test('order language: drafted, editable start date, copyable', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/app/');
  await loadExample(page, 'Primary custody');
  await page.getByRole('button', { name: 'Order language' }).click();
  const text = page.getByLabel('Draft order language');
  await expect(text).toContainText('Commencing November 1, 2026, Petitioner, Alex Rivera, shall pay to Respondent, Blair Rivera, child support of $560.00 per month');
  await page.getByLabel('Due on day of month').fill('5');
  await expect(text).toContainText('due on the 5th day of each month');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied ✓' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('IRS Form 8332');
  await page.locator('.order-text').scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot('order-language') });
});

test('print layouts: client summary and mediation comparison', async ({ page }) => {
  await page.goto('/app/');
  await loadExample(page, 'Shared custody');
  await page.evaluate(() => (document.body.dataset.print = 'summary'));
  await page.pdf({ path: 'test-results/screens/print-summary.pdf', format: 'Letter' });
  await page.getByRole('button', { name: 'Mediation' }).click();
  await page.getByRole('button', { name: 'Start from this case' }).click();
  await page.getByRole('region', { name: 'Proposal 2' }).getByRole('spinbutton', { name: 'Overnights with Morgan Lee' }).fill('300');
  await page.evaluate(() => (document.body.dataset.print = 'comparison'));
  await page.pdf({ path: 'test-results/screens/print-comparison.pdf', format: 'Letter' });
});

test('backup reminder, back up all, and restore', async ({ page }) => {
  await page.goto('/app/');
  await loadExample(page, 'Split custody');
  const reminder = page.getByRole('region', { name: 'Backup reminder' });
  await expect(reminder).toContainText('not backed up');
  const dl = page.waitForEvent('download');
  await reminder.getByRole('button', { name: 'Back up all cases' }).click();
  const file = await dl;
  const path = 'test-results/screens/backup.json';
  await file.saveAs(path);
  await expect(reminder).toHaveCount(0);

  // Delete the case, then restore it from the backup.
  page.on('dialog', (d) => void d.accept());
  await page.locator('.case-button').click();
  await page.getByRole('button', { name: 'Delete Example: split custody (2 + 1)' }).click();
  await expect(page.getByRole('menuitem', { name: /split custody/ })).toHaveCount(0);
  // A one-case backup restores like an import; add a second case so it's a real multi-case restore.
  const json = JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'));
  json.cases.push({ ...json.cases[0], id: 'second', title: 'Second case' });
  (await import('node:fs')).writeFileSync(path, JSON.stringify(json));
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.getByText('Restored 2 cases.')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /split custody/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Second case/ })).toBeVisible();
});
