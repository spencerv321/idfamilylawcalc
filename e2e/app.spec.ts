import { expect, test } from '@playwright/test';

const shot = (name: string) => `test-results/screens/${name}.png`;

async function loadExample(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('button', { name: /Untitled case|Example|Saved on this device|Not saved/ }).first().click();
  await page.getByRole('menuitem', { name: label }).click();
}

test('primary example: Rule 120 numbers, worksheet and step-down', async ({ page }) => {
  await page.goto('/');
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
  await page.goto('/');
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
  await page.goto('/');
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
  await page.goto('/');
  await loadExample(page, 'Split custody');
  await page.reload();
  await expect(page.locator('.case-title')).toHaveText('Example: split custody (2 + 1)');
});

test('mediation: two scenarios, sliders and delta', async ({ page }) => {
  await page.goto('/');
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
  await page.goto('/');
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
  await page.goto('/');
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
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: shot('dark') });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
