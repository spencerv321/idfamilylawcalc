import { describe, expect, it } from 'vitest';
import { ROUTES } from '../src/site/pages';
import { renderPage } from './prerender';

const assets = { js: '/assets/island.js', css: ['/assets/island.css'] };

describe('prerendered pages', () => {
  it('ship the estimator script exactly when the page contains the estimator', () => {
    for (const r of ROUTES) {
      const html = renderPage(r, assets);
      expect(html.includes('data-island="quick-calc"'), r.path).toBe(!!r.estimator);
      expect(html.includes(assets.js), r.path).toBe(!!r.estimator);
    }
  });

  it('have unique titles and descriptions of search-friendly length', () => {
    const titles = new Set(ROUTES.map((r) => r.title));
    expect(titles.size).toBe(ROUTES.length);
    for (const r of ROUTES) {
      expect(r.title.length, r.path).toBeLessThanOrEqual(70);
      expect(r.description.length, r.path).toBeGreaterThanOrEqual(80);
      expect(r.description.length, r.path).toBeLessThanOrEqual(170);
    }
  });

  it('every page carries the not-legal-advice and not-the-state disclaimers', () => {
    for (const r of ROUTES) {
      const html = renderPage(r, assets);
      expect(html, r.path).toContain('Not legal advice.');
      expect(html, r.path).toContain('not affiliated with the State of Idaho');
    }
  });

  it('escapes structured data so content cannot close the script tag', () => {
    const html = renderPage({ ...ROUTES[1]!, faq: [{ q: 'x', a: '</script><script>alert(1)</script>' }] }, assets);
    expect(html).not.toContain('</script><script>alert(1)');
  });
});
