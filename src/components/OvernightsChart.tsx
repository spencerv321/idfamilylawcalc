/**
 * Support across overnights: the signed monthly total (parent A pays B above
 * zero, B pays A below) as every child's overnights with A move from 0 to 365.
 * Shows mediators the 25% cliffs (91 -> 92 nights) at a glance.
 */
import { useMemo, useRef, useState } from 'react';
import { calculate, Decimal, type CaseInput } from '../../engine';
import { usd } from '../model/format';

interface Point {
  nights: number;
  value: number; // signed: + A pays B
}

const SAMPLE = (() => {
  const xs = new Set<number>();
  for (let n = 0; n <= 365; n += 5) xs.add(n);
  [91, 92, 273, 274, 365].forEach((n) => xs.add(n));
  return [...xs].sort((a, b) => a - b);
})();

function curve(input: CaseInput): Point[] {
  const pts: Point[] = [];
  for (const nights of SAMPLE) {
    try {
      const r = calculate({ ...input, children: input.children.map((c) => ({ ...c, overnightsWithA: nights })) });
      pts.push({ nights, value: r.result.signedTotal.toNumber() });
    } catch {
      // skip impossible points
    }
  }
  return pts;
}

const W = 520;
const H = 200;
const PAD = { l: 56, r: 14, t: 14, b: 30 };

export function OvernightsChart(props: {
  input: CaseInput;
  current: number;
  /** Exact signed total at `current` (positive: A pays B). */
  currentValue: number;
  names: { A: string; B: string };
  rounding: 'rule-example' | 'exact';
}) {
  // Recompute only when something other than overnights changes.
  const key = JSON.stringify({ ...props.input, children: props.input.children.map((c) => ({ ...c, overnightsWithA: 0 })) });
  const pts = useMemo(() => curve(props.input), [key]);
  const [hover, setHover] = useState<Point | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (pts.length < 2) return null;
  const vals = [...pts.map((p) => p.value), props.currentValue];
  const maxAbs = Math.max(100, ...vals.map(Math.abs));
  const step = niceStep(maxAbs);
  const yMax = Math.max(0, Math.ceil(Math.max(...vals) / step) * step);
  const yMin = Math.min(0, Math.floor(Math.min(...vals) / step) * step);
  const x = (n: number) => PAD.l + (n / 365) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((yMax - v) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(v);

  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.nights).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const shown = hover ?? null;

  const onMove = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const n = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * 365);
    setHover(nearest(pts, Math.max(0, Math.min(365, n))));
  };

  const money = (v: number) => usd(new Decimal(Math.abs(v)), props.rounding);
  const describe = (p: Point) => (p.value === 0 ? 'No support' : `${p.value > 0 ? props.names.A : props.names.B} pays ${money(p.value)}`);

  return (
    <figure className="ov-chart">
      <figcaption>
        Support as overnights with {props.names.A} change
        <span className="muted"> · above $0 {props.names.A} pays, below {props.names.B} pays · all children together</span>
      </figcaption>
      <div className="chart-wrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Line chart of monthly support from 0 to 365 overnights with ${props.names.A}. ${describe(pts[0]!)} at 0 nights; ${describe(pts[pts.length - 1]!)} at 365.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {/* Shared-custody band: more than 25% with each parent */}
          <rect className="zone" x={x(91.5)} y={PAD.t} width={x(273.5) - x(91.5)} height={H - PAD.t - PAD.b} />
          <text className="zone-label" x={(x(91.5) + x(273.5)) / 2} y={PAD.t + 11} textAnchor="middle">shared</text>
          <text className="zone-label" x={(x(0) + x(91.5)) / 2} y={PAD.t + 11} textAnchor="middle">with {props.names.B}</text>
          <text className="zone-label" x={(x(273.5) + x(365)) / 2} y={PAD.t + 11} textAnchor="middle">with {props.names.A}</text>
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'axis' : 'grid'} x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
              <text className="tick" x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end">
                {compact(t)}
              </text>
            </g>
          ))}
          {[0, 91, 183, 274, 365].map((n) => (
            <text key={n} className="tick" x={x(n)} y={H - 10} textAnchor="middle">
              {n}
            </text>
          ))}
          <path className="series" d={path} />
          {shown && <line className="crosshair" x1={x(shown.nights)} x2={x(shown.nights)} y1={PAD.t} y2={H - PAD.b} />}
          <circle className="marker" cx={x(props.current)} cy={y(props.currentValue)} r={5} />
          {shown && <circle className="marker hover" cx={x(shown.nights)} cy={y(shown.value)} r={4.5} />}
        </svg>
        {shown && (
          <div className="chart-tip" style={{ left: `${(x(shown.nights) / W) * 100}%` }}>
            <strong>{money(shown.value)}</strong>
            <span>
              {shown.value === 0 ? 'no support' : `${shown.value > 0 ? props.names.A : props.names.B} pays`} · {shown.nights} nights with {props.names.A}
            </span>
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Show as table</summary>
        <table className="sheet">
          <thead>
            <tr>
              <th>Nights with {props.names.A}</th>
              <th>Payer</th>
              <th>Monthly</th>
            </tr>
          </thead>
          <tbody>
            {pts
              .filter((p) => p.nights % 30 === 0 || [91, 92, 273, 274, 365].includes(p.nights))
              .map((p) => (
                <tr key={p.nights}>
                  <td>{p.nights}</td>
                  <td>{p.value === 0 ? '—' : p.value > 0 ? props.names.A : props.names.B}</td>
                  <td>{money(p.value)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function nearest(pts: Point[], n: number): Point {
  return pts.reduce((best, p) => (Math.abs(p.nights - n) < Math.abs(best.nights - n) ? p : best), pts[0]!);
}

function niceStep(maxAbs: number) {
  const raw = maxAbs / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}

function compact(v: number) {
  const a = Math.abs(v);
  const s = a >= 1000 ? `${(a / 1000).toFixed(a % 1000 === 0 ? 0 : 1)}K` : String(a);
  return `${v < 0 ? '−' : ''}$${s}`;
}
