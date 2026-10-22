import { APP_PATH, SITE_NAME } from './config';
import type { Route } from './pages';

export function Layout({ route, crumbs }: { route: Route; crumbs: { href: string; label: string }[] }) {
  return (
    <div className="site">
      <header className="site-header">
        <a className="site-brand" href="/">
          <span className="mark" aria-hidden="true">
            §
          </span>
          {SITE_NAME}
        </a>
        <nav aria-label="Site">
          <a href="/idaho/child-support-calculator/">Idaho calculator</a>
          <a href="/idaho/how-child-support-is-calculated/">How it works</a>
          <a href="/idaho/for-attorneys/">For attorneys</a>
          <a className="button primary small" href={APP_PATH}>
            Open calculator
          </a>
        </nav>
      </header>

      <main className="site-main">
        {crumbs.length > 1 && (
          <nav className="crumbs" aria-label="Breadcrumb">
            <ol>
              {crumbs.map((c, i) => (
                <li key={c.href}>{i === crumbs.length - 1 ? <span aria-current="page">{c.label}</span> : <a href={c.href}>{c.label}</a>}</li>
              ))}
            </ol>
          </nav>
        )}
        <h1>{route.h1}</h1>
        {route.body}
        {route.faq && (
          <section className="faq" aria-labelledby="faq">
            <h2 id="faq">Frequently asked questions</h2>
            {route.faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </section>
        )}
      </main>

      <footer className="site-footer">
        <p>
          <strong>Not legal advice.</strong> This calculator implements the Idaho Child Support Guidelines (I.R.F.L.P. 120) for estimates and
          worksheet preparation. The court sets the final amount and may deviate from the guidelines. Verify results before filing.
        </p>
        <p>
          Independent; not affiliated with the State of Idaho, the Idaho courts or the Idaho Department of Health and Welfare. Looking to make a
          payment or reach Child Support Services? Visit the{' '}
          <a href="https://healthandwelfare.idaho.gov/">Idaho Department of Health and Welfare</a>.
        </p>
        <p className="muted">Calculations run in your browser. Nothing you enter is sent to a server.</p>
      </footer>
    </div>
  );
}
