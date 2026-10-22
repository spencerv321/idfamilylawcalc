/** Mounts the quick estimator into the static content pages. */
import { createRoot } from 'react-dom/client';
import { QuickCalc } from './QuickCalc';
import './site.css';

for (const el of document.querySelectorAll<HTMLElement>('[data-island="quick-calc"]')) {
  createRoot(el).render(<QuickCalc />);
}
