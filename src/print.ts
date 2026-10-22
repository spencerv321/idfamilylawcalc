/**
 * Print one of the hidden print layouts (rendered by PrintArea). The browser's
 * print dialog also offers "Save as PDF".
 */
export function printView(kind: 'summary' | 'comparison') {
  document.body.dataset.print = kind;
  const done = () => {
    delete document.body.dataset.print;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}
