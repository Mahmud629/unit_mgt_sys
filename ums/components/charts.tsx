"use client";

// Lightweight, clickable SVG charts. Every segment / bar can be clicked to drill down.
import { useState, type ReactNode } from "react";
import { colorFor } from "@/lib/colors";
import { cls } from "@/lib/utils";

export interface Datum {
  key: string;
  label: string;
  value: number;
  color?: string;
  /** optional text shown next to the value, e.g. "2+1+11" */
  sub?: string;
}

const col = (d: Datum, i: number) => d.color ?? colorFor(d.key, i);
const pct = (v: number, t: number) => (t ? Math.round((v / t) * 100) : 0);

// ------------------------------------------------------------------ donut
export function Donut({ data, size = 176, thickness = 24, center, centerSub, onSelect, empty = "No data" }: {
  data: Datum[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
  centerSub?: ReactNode;
  onSelect?: (key: string) => void;
  empty?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = data.reduce((n, d) => n + d.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  const shown = data.filter((d) => d.value > 0);
  const h = hover ? shown.find((d) => d.key === hover) : null;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-2)" strokeWidth={thickness} />
        {shown.map((d, i) => {
          const len = (d.value / total) * C;
          const gap = shown.length > 1 ? Math.min(2, len / 3) : 0;
          const el = (
            <circle key={d.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col(d, i)} strokeWidth={hover === d.key ? thickness + 6 : thickness}
              strokeDasharray={`${Math.max(len - gap, 0.01)} ${C}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ cursor: onSelect ? "pointer" : "default", transition: "stroke-width .15s" }}
              onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)} onClick={() => onSelect?.(d.key)}>
              <title>{`${d.label}: ${d.value}${d.sub ? ` (${d.sub})` : ""}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="donut-center">
        {total === 0 ? <span className="muted small">{empty}</span> : h ? (
          <><strong style={{ color: col(h, 0) }}>{h.value}</strong><span>{h.label}</span></>
        ) : (
          <><strong>{center ?? total}</strong>{centerSub && <span>{centerSub}</span>}</>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- legend
export function Legend({ data, onSelect, total, compact }: { data: Datum[]; onSelect?: (key: string) => void; total?: number; compact?: boolean }) {
  const t = total ?? data.reduce((n, d) => n + d.value, 0);
  return (
    <div className={cls("chart-legend", compact && "compact")}>
      {data.map((d, i) => (
        <button type="button" key={d.key} className="legend-row" onClick={() => onSelect?.(d.key)} disabled={!onSelect || d.value === 0}>
          <i style={{ background: col(d, i) }} />
          <span className="legend-label">{d.label}</span>
          {d.sub && <span className="legend-sub mono">{d.sub}</span>}
          <strong>{d.value}</strong>
          {!compact && <span className="legend-pct">{pct(d.value, t)}%</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------- horizontal bars
export function HBars({ data, onSelect, max }: { data: Datum[]; onSelect?: (key: string) => void; max?: number }) {
  const m = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="hbars">
      {data.map((d, i) => (
        <button type="button" key={d.key} className="hbar" onClick={() => onSelect?.(d.key)} disabled={!onSelect}>
          <span className="hbar-label">{d.label}</span>
          <span className="hbar-track"><i style={{ width: `${(d.value / m) * 100}%`, background: col(d, i) }} /></span>
          <strong className="hbar-value">{d.value}{d.sub && <small className="mono"> {d.sub}</small>}</strong>
        </button>
      ))}
    </div>
  );
}

// ----------------------------------------------------------- stacked bar
export function StackBar({ data, onSelect, height = 14, total }: { data: Datum[]; onSelect?: (key: string) => void; height?: number; total?: number }) {
  const t = total ?? data.reduce((n, d) => n + d.value, 0);
  return (
    <div className="stackbar" style={{ height }}>
      {data.filter((d) => d.value > 0).map((d, i) => (
        <button type="button" key={d.key} title={`${d.label}: ${d.value} (${pct(d.value, t)}%)`} style={{ width: `${(d.value / Math.max(t, 1)) * 100}%`, background: col(d, i) }} onClick={() => onSelect?.(d.key)} disabled={!onSelect} />
      ))}
    </div>
  );
}

// -------------------------------------------------------- grouped columns
export function Columns({ groups, onSelect, height = 170 }: {
  groups: Array<{ key: string; label: string; parts: Datum[] }>;
  onSelect?: (groupKey: string, partKey: string) => void;
  height?: number;
}) {
  const max = Math.max(1, ...groups.map((g) => g.parts.reduce((n, p) => n + p.value, 0)));
  return (
    <div className="columns" style={{ height: height + 52 }}>
      {groups.map((g) => {
        const sum = g.parts.reduce((n, p) => n + p.value, 0);
        return (
          <div className="column" key={g.key}>
            <span className="column-total">{sum}</span>
            <div className="column-stack" style={{ height: (sum / max) * height }}>
              {g.parts.filter((p) => p.value > 0).map((p, i) => (
                <button type="button" key={p.key} title={`${g.label} · ${p.label}: ${p.value}`} style={{ flex: p.value, background: col(p, i) }} onClick={() => onSelect?.(g.key, p.key)} disabled={!onSelect} />
              ))}
            </div>
            <span className="column-label">{g.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------- trend line
export function Trend({ points, height = 120, color = "#3f8f55", onSelect, suffix = "" }: {
  points: Array<{ key: string; label: string; value: number }>;
  height?: number;
  color?: string;
  onSelect?: (key: string) => void;
  suffix?: string;
}) {
  const w = Math.max(points.length * 46, 200);
  const max = Math.max(...points.map((p) => p.value), 1);
  const min = Math.min(...points.map((p) => p.value), 0);
  const y = (v: number) => 14 + (1 - (v - min) / Math.max(max - min, 1)) * (height - 34);
  const x = (i: number) => 23 + i * 46;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  return (
    <div className="trend">
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <path d={`${path} L${x(points.length - 1)},${height - 20} L${x(0)},${height - 20} Z`} fill={color} opacity={0.08} />
        <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.key} style={{ cursor: onSelect ? "pointer" : "default" }} onClick={() => onSelect?.(p.key)}>
            <circle cx={x(i)} cy={y(p.value)} r={4.5} fill="#fff" stroke={color} strokeWidth={2.5} />
            <text x={x(i)} y={y(p.value) - 9} textAnchor="middle" fontSize="10.5" fill="var(--muted)">{p.value}{suffix}</text>
            <text x={x(i)} y={height - 5} textAnchor="middle" fontSize="10.5" fill="var(--muted)">{p.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------ KPI tile
export function Tile({ label, value, sub, color, icon, onClick, active }: { label: ReactNode; value: ReactNode; sub?: ReactNode; color: string; icon?: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button type="button" className={cls("tile", onClick && "clickable", active && "active")} style={{ ["--c" as string]: color }} onClick={onClick} disabled={!onClick}>
      <span className="tile-top">{icon && <span className="tile-icon">{icon}</span>}<span className="tile-label">{label}</span></span>
      <strong className="tile-value">{value}</strong>
      {sub && <span className="tile-sub">{sub}</span>}
    </button>
  );
}
