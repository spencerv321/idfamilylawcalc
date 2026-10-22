import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const shot = (name: string) => `test-results/screens/${name}.png`;

test('landing page: content, estimator, handoff to the full calculator', async ({ page }) => {
  await page.goto('/idaho/child-support-calculator/');
  await expect(page).toHaveTitle(/Idaho Child Support Calculator \(2026\)/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Idaho Child Support Calculator');
  // The rule's own example, computed by the engine at build time.
  await expect(page.getByText('$709 a month')).toBeVisible();
  await expect(page.getByText('$506 a month')).toBeVisible();

  const est = page.locator('.qc');
  await est.getByLabel('Parent A gross income, monthly').fill('2083.33');
  await est.getByLabel('Parent B gross income, monthly').fill('833.33');
  await est.getByLabel('Children').selectOption('2');
  await est.getByLabel('Schedule').selectOption('none');
  await expect(est.locator('.qc-amount')).toContainText('$506'); // matches the rule's example
  await page.screenshot({ path: shot('site-landing'), fullPage: true });

  await est.getByRole('link', { name: /Continue in the full calculator/ }).click();
  await expect(page).toHaveURL(/\/app\/$/); // fragment cleared after reading
  await expect(page.locator('.case-title')).toHaveText('New case from estimate');
  await expect(page.getByText('Enter a birth date for Child 1.')).toBeVisible();
});

test('every page renders, has one h1, a canonical link and valid structured data', async ({ page }) => {
  const sitemap = readFileSync('dist/sitemap.xml', 'utf8');
  const paths = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]!);
  expect(paths.length).toBeGreaterThanOrEqual(8);
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', new RegExp(`${path.replace(/\//g, '\\/')}$`));
    for (const block of await page.locator('script[type="application/ld+json"]').allTextContents()) {
      expect(() => JSON.parse(block)).not.toThrow();
    }
  }
});

test('internal links all resolve', async ({ page, request }) => {
  const seen = new Set<string>();
  const queue = ['/'];
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    if (!path.endsWith('/') || path.startsWith('/app')) continue;
    await page.goto(path);
    for (const href of await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
      const clean = href.split('#')[0]!;
      if (!seen.has(clean)) queue.push(clean);
    }
  }
  expect(seen.size).toBeGreaterThanOrEqual(9);
});

test('content pages work under the production Content-Security-Policy', async ({ page }) => {
  const csp = readFileSync('public/_headers', 'utf8').match(/Content-Security-Policy: (.*)/)![1]!;
  const violations: string[] = [];
  page.on('console', (m) => m.text().includes('Content Security Policy') && violations.push(m.text()));
  await page.route('**/*', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp } });
  });
  await page.goto('/idaho/shared-custody-child-support/');
  await expect(page.locator('.qc-amount')).toBeVisible();
  expect(violations).toEqual([]);
});

test('phone width: no sideways scroll on content pages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/idaho/child-support-calculator/', '/idaho/how-child-support-is-calculated/']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
  }
  await page.goto('/idaho/child-support-calculator/');
  await page.screenshot({ path: shot('site-mobile'), fullPage: true });
});
