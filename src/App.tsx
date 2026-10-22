import { useEffect, useMemo, useRef, useState } from 'react';
import { calculate } from '../engine';
import { InputPanel } from './components/InputPanel';
import { MediationView } from './components/MediationView';
import { ResultsPanel } from './components/ResultsPanel';
import { InputError, newCase, newId, toEngineInput, type CaseFile } from './model/case';
import { formatDate, usd } from './model/format';
import { EXAMPLES } from './model/samples';
import { downloadBlob, exportCaseJson, importCaseJson, safeFilename } from './model/storage';
import { useCases } from './model/useCases';

type View = 'calculator' | 'mediation';

/** Set to false once results have been checked against ICSP (see DECISIONS.md). */
const BETA = true;

export function App() {
  const { cases, current, loaded, storageError, update, open, remove } = useCases();
  const [view, setView] = useState<View>(() => (sessionGet('view') === 'mediation' ? 'mediation' : 'calculator'));
  useEffect(() => sessionSet('view', view), [view]);

  const { input, result, error } = useMemo(() => {
    try {
      const input = toEngineInput(current, current.options);
      return { input, result: calculate(input), error: null };
    } catch (e) {
      return {
        input: null,
        result: null,
        error: e instanceof InputError ? e.message : `Can’t calculate: ${(e as Error).message}`,
      };
    }
  }, [current]);

  if (!loaded) return <div className="loading">Loading…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true">§</span>
          <div>
            <div className="brand-name">Idaho Child Support</div>
            <div className="brand-sub">I.R.F.L.P. Rule 120 · eff. July 1, 2025</div>
          </div>
        </div>
        <nav className="tabs" aria-label="View">
          <button type="button" className={view === 'calculator' ? 'on' : ''} aria-current={view === 'calculator'} onClick={() => setView('calculator')}>
            Calculator
          </button>
          <button type="button" className={view === 'mediation' ? 'on' : ''} aria-current={view === 'mediation'} onClick={() => setView('mediation')}>
            Mediation
          </button>
        </nav>
        <div className="topbar-right">
        <ThemeToggle />
        <CaseMenu
          cases={cases}
          current={current}
          onOpen={(c) => void open(c)}
          onNew={() => void open(newCase())}
          onExample={(c) => void open(c, { save: true })}
          onDelete={(id) => void remove(id)}
          onImport={(c) => void open(c, { save: true })}
        />
        </div>
      </header>

      {BETA && (
        <div className="banner beta" role="note">
          <strong>Beta</strong> Results haven’t yet been checked against ICSP. Verify before filing.
        </div>
      )}
      {storageError && <div className="banner warn">{storageError}</div>}

      <main className={view}>
        {view === 'calculator' ? (
          <div className="calc-layout">
            <InputPanel c={current} update={update} result={result} />
            <aside className="results-col" aria-label="Results" id="results">
              <ResultsPanel c={current} input={input} result={result} error={error} />
            </aside>
            {result && (
              <button
                type="button"
                className="mobile-total"
                onClick={() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <span className="who-line">
                  {result.result.payer
                    ? `${current.parents[result.result.payer].name} pays ${current.parents[result.result.recipient!].name}`
                    : 'No support'}{' '}
                  · see worksheet ↓
                </span>
                <strong>{usd(result.result.totalMonthly, result.options.rounding)}/mo</strong>
              </button>
            )}
          </div>
        ) : (
          <MediationView c={current} update={update} />
        )}
      </main>

      <footer className="footer">
        <span>
          Calculations run in this browser. Case data is saved only on this device and is never sent anywhere.
        </span>
        <span className="muted">
          Not affiliated with the State of Idaho. Verify results before filing.
        </span>
      </footer>
    </div>
  );
}

function CaseMenu(props: {
  cases: CaseFile[];
  current: CaseFile;
  onOpen: (c: CaseFile) => void;
  onNew: () => void;
  onExample: (c: CaseFile) => void;
  onDelete: (id: string) => void;
  onImport: (c: CaseFile) => void;
}) {
  const [openMenu, setOpenMenu] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const saved = props.cases.some((c) => c.id === props.current.id);

  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpenMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpenMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [openMenu]);

  return (
    <div className="case-menu" ref={menuRef}>
      <button type="button" className="case-button" aria-haspopup="menu" aria-expanded={openMenu} onClick={() => setOpenMenu(!openMenu)}>
        <span className="case-title">{props.current.title || 'Untitled case'}</span>
        <span className="case-status">{saved ? 'Saved on this device' : 'Not saved yet'}</span>
        <span className="caret" aria-hidden="true">▾</span>
      </button>
      {openMenu && (
        <div className="menu" role="menu">
          <div className="menu-actions">
            <button type="button" role="menuitem" className="btn small primary" onClick={() => { props.onNew(); setOpenMenu(false); }}>
              New case
            </button>
            <button
              type="button"
              role="menuitem"
              className="btn small"
              onClick={() => {
                const copy = { ...structuredClone(props.current), id: newId(), title: `${props.current.title} (copy)`, createdAt: new Date().toISOString() };
                props.onImport(copy);
                setOpenMenu(false);
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              role="menuitem"
              className="btn small"
              onClick={() => downloadBlob(exportCaseJson(props.current), `${safeFilename(props.current.title)}.json`)}
            >
              Export JSON
            </button>
            <button type="button" role="menuitem" className="btn small" onClick={() => fileRef.current?.click()}>
              Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  const c = await importCaseJson(file);
                  // Importing a case that already exists here keeps both.
                  if (props.cases.some((x) => x.id === c.id)) c.id = newId();
                  props.onImport(c);
                  setErr(null);
                  setOpenMenu(false);
                } catch (x) {
                  setErr((x as Error).message);
                }
              }}
            />
          </div>
          {err && <p className="hint error">{err}</p>}
          <div className="menu-label">Saved cases</div>
          {props.cases.length === 0 && <p className="muted small menu-empty">Nothing saved yet. Cases save automatically as you type.</p>}
          <ul className="case-list">
            {props.cases.map((c) => (
              <li key={c.id} className={c.id === props.current.id ? 'current' : ''}>
                <button type="button" role="menuitem" className="case-open" onClick={() => { props.onOpen(c); setOpenMenu(false); }}>
                  <span>{c.title || 'Untitled case'}</span>
                  <span className="muted small">{formatDate(c.updatedAt.slice(0, 10))}</span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Delete ${c.title}`}
                  title="Delete"
                  onClick={() => {
                    if (confirm(`Delete “${c.title}”? This can’t be undone.`)) props.onDelete(c.id);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="menu-label">Examples</div>
          <div className="menu-actions">
            {EXAMPLES.map((ex) => (
              <button key={ex.label} type="button" role="menuitem" className="btn small ghost" onClick={() => { props.onExample(ex.make()); setOpenMenu(false); }}>
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
  );
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        document.documentElement.setAttribute('data-theme', next);
        try {
          localStorage.setItem('theme', next);
        } catch {
          /* storage unavailable: the choice lasts for this page only */
        }
        setTheme(next);
      }}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7Z" /></svg>
      )}
    </button>
  );
}

function sessionGet(k: string) {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function sessionSet(k: string, v: string) {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
}
