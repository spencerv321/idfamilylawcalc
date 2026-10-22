import { useId, useState, type ReactNode } from 'react';
import { isValidMoney, parseMoney } from '../model/case';

export function MoneyInput(props: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  hint?: ReactNode;
  placeholder?: string;
  ariaLabel?: string;
  compact?: boolean;
}) {
  const id = useId();
  const invalid = !isValidMoney(props.value);
  return (
    <div className={`field${props.compact ? ' compact' : ''}`}>
      {props.label && <label htmlFor={id}>{props.label}</label>}
      <div className={`money${invalid ? ' invalid' : ''}`}>
        <span aria-hidden="true">$</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={props.value}
          placeholder={props.placeholder ?? '0'}
          aria-label={props.label ? undefined : props.ariaLabel}
          aria-invalid={invalid || undefined}
          onChange={(e) => props.onChange(e.target.value)}
          onBlur={() => {
            const n = parseMoney(props.value);
            if (n === null || props.value.trim() === '') return;
            const [int, frac] = n.split('.');
            const pretty = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? `.${frac}` : '');
            if (pretty !== props.value) props.onChange(pretty);
          }}
        />
      </div>
      {invalid ? <div className="hint error">Enter a number</div> : props.hint ? <div className="hint">{props.hint}</div> : null}
    </div>
  );
}

export function TextInput(props: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  ariaLabel?: string;
  type?: 'text' | 'date' | 'number' | 'email' | 'tel';
  placeholder?: string;
  min?: number;
  max?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`field ${props.className ?? ''}`}>
      {props.label && <label htmlFor={id}>{props.label}</label>}
      <input
        id={id}
        type={props.type ?? 'text'}
        value={props.value}
        min={props.min}
        max={props.max}
        placeholder={props.placeholder}
        aria-label={props.label ? undefined : props.ariaLabel}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: 'sm';
}) {
  return (
    <div className={`segmented${props.size ? ` ${props.size}` : ''}`} role="radiogroup" aria-label={props.ariaLabel}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          className={props.value === o.value ? 'on' : ''}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="toggle">
      <input id={id} type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <label htmlFor={id}>
        {props.label}
        {props.hint && <span className="hint">{props.hint}</span>}
      </label>
    </div>
  );
}

export function Section(props: {
  title: string;
  cite?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  actions?: ReactNode;
  id?: string;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  const shown = !props.collapsible || open;
  return (
    <section className="section" id={props.id}>
      <header>
        {props.collapsible ? (
          <button type="button" className="section-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span className={`chev${open ? ' open' : ''}`} aria-hidden="true">›</span>
            <h2>{props.title}</h2>
          </button>
        ) : (
          <h2>{props.title}</h2>
        )}
        {props.cite && <span className="cite">{props.cite}</span>}
        {props.actions && <div className="section-actions">{props.actions}</div>}
      </header>
      {shown && <div className="section-body">{props.children}</div>}
    </section>
  );
}

export function Cite({ children }: { children: ReactNode }) {
  return <span className="cite">{children}</span>;
}
