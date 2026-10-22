/**
 * Runs after `vite build`: renders the content pages (src/site/pages.tsx) to
 * static HTML in dist/, linking the hashed estimator bundle and CSS from the
 * Vite manifest, and writes sitemap.xml, robots.txt and 404.html.
 *
 * The domain comes from SITE_URL (see src/site/config.ts).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { SITE_NAME, SITE_URL } from '../src/site/config';
import { Layout } from '../src/site/Layout';
import { ROUTES, type Route } from '../src/site/pages';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

interface ManifestEntry {
  file: string;
  css?: string[];
  isEntry?: boolean;
}

export function islandAssets(manifest: Record<string, ManifestEntry>) {
  const entry = manifest['src/site/island.tsx'];
  if (!entry) throw new Error('Vite manifest has no entry for src/site/island.tsx; check build.rollupOptions.input.');
  return { js: `/${entry.file}`, css: (entry.css ?? []).map((c) => `/${c}`) };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** JSON for a <script type="application/ld+json"> block; "<" escaped so text can't close the tag. */
const ld = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');

function crumbsFor(route: Route) {
  const home = { href: '/', label: 'Home' };
  if (route.path === '/') return [home];
  const idaho = ROUTES.find((r) => r.path === '/idaho/child-support-calculator/')!;
  if (route.path === idaho.path) return [home, { href: route.path, label: route.crumb }];
  return [home, { href: idaho.path, label: 'Idaho' }, { href: route.path, label: route.crumb }];
}

function structuredData(route: Route, crumbs: { href: string; label: string }[]) {
  const url = `${SITE_URL}${route.path}`;
  const data: unknown[] = [];
  if (crumbs.length > 1) {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: `${SITE_URL}${c.href}` })),
    });
  }
  if (route.faq) {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: route.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }
  if (route.app) {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: route.h1,
      url,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Any (web browser)',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      description: route.description,
    });
  }
  return data;
}

export function renderPage(route: Route, assets: { js: string; css: string[] }, opts: { noindex?: boolean } = {}): string {
  const crumbs = crumbsFor(route);
  const body = renderToStaticMarkup(<Layout route={route} crumbs={crumbs} />);
  const url = `${SITE_URL}${route.path}`;
  const head = [
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
    opts.noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${esc(url)}" />`,
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:title" content="${esc(route.title)}" />`,
    `<meta property="og:description" content="${esc(route.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    '<meta name="twitter:card" content="summary" />',
    '<script src="/theme.js"></script>',
    ...assets.css.map((c) => `<link rel="stylesheet" href="${c}" />`),
    ...structuredData(route, crumbs).map((d) => `<script type="application/ld+json">${ld(d)}</script>`),
  ];
  // The estimator script only ships on pages that have the estimator; CSS ships everywhere.
  const script = route.estimator ? `<script type="module" src="${assets.js}"></script>` : '';
  return `<!doctype html>\n<html lang="en">\n<head>\n${head.join('\n')}\n</head>\n<body>\n${body}\n${script}\n</body>\n</html>\n`;
}

const NOT_FOUND: Route = {
  path: '/404',
  title: 'Page not found',
  description: 'This page does not exist.',
  h1: 'Page not found',
  crumb: 'Not found',
  body: (
    <p>
      That page doesn’t exist. Try the <a href="/idaho/child-support-calculator/">Idaho child support calculator</a> or the{' '}
      <a href="/">home page</a>.
    </p>
  ),
};

function main() {
  const manifest = JSON.parse(readFileSync(join(DIST, '.vite', 'manifest.json'), 'utf8')) as Record<string, ManifestEntry>;
  const assets = islandAssets(manifest);

  for (const route of ROUTES) {
    const dir = join(DIST, route.path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), renderPage(route, assets));
  }
  // Cloudflare Pages serves 404.html for unknown paths (instead of a soft-200 SPA fallback).
  writeFileSync(join(DIST, '404.html'), renderPage(NOT_FOUND, assets, { noindex: true }));

  const today = new Date().toISOString().slice(0, 10);
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...ROUTES.map((r) => `  <url><loc>${SITE_URL}${r.path}</loc><lastmod>${today}</lastmod></url>`),
    '</urlset>',
    '',
  ].join('\n');
  writeFileSync(join(DIST, 'sitemap.xml'), sitemap);
  writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  console.log(`prerendered ${ROUTES.length} pages + 404 for ${SITE_URL}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
