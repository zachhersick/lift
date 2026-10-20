// A line chart in the style of modern health apps: the line draws in, the
// area fades under it, and you scrub to read any point. `secondary` adds a
// faint second series (for example a moving average).
import NumberFlow from "@number-flow/react";
import { motion } from "motion/react";
import { useId, useMemo, useRef, useState } from "react";
import * as format from "@/lib/format.js";

export interface Point {
  x: number;
  y: number;
  note?: string;
}

function range(values: number[]) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= Math.max(1, Math.abs(min) * 0.05);
    max += Math.max(1, Math.abs(max) * 0.05);
  }
  const pad = (max - min) * 0.18;
  return [min - pad, max + pad];
}

export function LineChart({ points, secondary = [], unit = "", caption = "Latest", height = 190, decimals = 0 }: { points: Point[]; secondary?: Point[]; unit?: string; caption?: string; height?: number; decimals?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const id = useId();
  const W = 340;
  const H = height;
  const pad = { l: 2, r: 36, t: 12, b: 22 };

  const g = useMemo(() => {
    if (!points.length) return null;
    const xs = points.map((p) => p.x);
    const [y0, y1] = range([...points.map((p) => p.y), ...secondary.map((p) => p.y)]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const sx = (x: number) => pad.l + (x1 === x0 ? (W - pad.l - pad.r) / 2 : ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r));
    const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
    // A gentle curve through the points (monotone-ish Catmull-Rom).
    const path = (list: Point[]) => {
      const c = list.map((p) => [sx(p.x), sy(p.y)]);
      if (c.length === 1) return `M${c[0][0]},${c[0][1]}`;
      let d = `M${c[0][0].toFixed(1)},${c[0][1].toFixed(1)}`;
      for (let i = 0; i < c.length - 1; i += 1) {
        const [x1_, y1_] = c[i];
        const [x2, y2] = c[i + 1];
        const [x0_, y0_] = c[i - 1] || c[i];
        const [x3, y3] = c[i + 2] || c[i + 1];
        const t = 0.18;
        d += `C${(x1_ + (x2 - x0_) * t).toFixed(1)},${(y1_ + (y2 - y0_) * t).toFixed(1)} ${(x2 - (x3 - x1_) * t).toFixed(1)},${(y2 - (y3 - y1_) * t).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
      }
      return d;
    };
    const coords = points.map((p) => [sx(p.x), sy(p.y)]);
    const line = path(points);
    const area = `${line}L${coords[coords.length - 1][0].toFixed(1)},${H - pad.b}L${coords[0][0].toFixed(1)},${H - pad.b}Z`;
    const ticks = [0, 1, 2].map((i) => y0 + ((y1 - y0) * (i + 0.5)) / 3);
    return { coords, line, area, ticks, sy, x0, x1, second: secondary.length > 1 ? path(secondary) : "" };
  }, [points, secondary, H]);

  if (!g) return <div className="py-12 text-center text-[14px] text-muted-foreground">No data yet</div>;
  const shown = active ?? points.length - 1;
  const point = points[shown];

  const pick = (event: React.PointerEvent) => {
    const rect = svg.current!.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    let best = 0;
    g.coords.forEach(([cx], i) => {
      if (Math.abs(cx - x) < Math.abs(g.coords[best][0] - x)) best = i;
    });
    setActive(best);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-[64px] flex-col px-1">
        <span className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">{active === null ? caption : format.date(point.x)}</span>
        <span className="flex items-baseline gap-1">
          <NumberFlow className="text-[34px] leading-[1.15] font-semibold tracking-tight" format={{ maximumFractionDigits: decimals }} value={point.y} willChange />
          <span className="text-[15px] font-medium text-muted-foreground">{unit}</span>
        </span>
        <span className="text-[13px] text-muted-foreground">{active === null ? format.date(point.x) : point.note || ""}</span>
      </div>
      <svg
        aria-label={`Chart, latest ${Math.round(points[points.length - 1].y)} ${unit}`}
        className="h-auto w-full touch-pan-y overflow-visible"
        onPointerDown={pick}
        onPointerLeave={() => setActive(null)}
        onPointerMove={(e) => (e.buttons || e.pointerType === "mouse") && pick(e)}
        ref={svg}
        role="img"
        viewBox={`0 0 ${W} ${H}`}
      >
        <defs>
          <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--tint)" stopOpacity="0.32" />
            <stop offset="1" stopColor="var(--tint)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-line`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--tint-2)" />
            <stop offset="1" stopColor="var(--tint)" />
          </linearGradient>
        </defs>
        {g.ticks.map((tick) => (
          <g key={tick}>
            <line stroke="var(--border)" x1={pad.l} x2={W - pad.r + 4} y1={g.sy(tick)} y2={g.sy(tick)} />
            <text className="fill-muted-foreground text-[10.5px]" x={W - pad.r + 8} y={g.sy(tick) + 3.5}>
              {format.weight(Math.round(tick))}
            </text>
          </g>
        ))}
        <motion.path animate={{ opacity: 1 }} d={g.area} fill={`url(#${id}-area)`} initial={{ opacity: 0 }} transition={{ duration: 0.8, delay: 0.3 }} />
        {g.second ? <path d={g.second} fill="none" stroke="var(--muted-foreground)" strokeDasharray="3 4" strokeOpacity="0.6" strokeWidth="1.5" /> : null}
        <motion.path
          animate={{ pathLength: 1 }}
          d={g.line}
          fill="none"
          initial={{ pathLength: 0 }}
          key={g.line}
          stroke={`url(#${id}-line)`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
        />
        {active !== null ? <line stroke="var(--muted-foreground)" strokeOpacity="0.5" x1={g.coords[shown][0]} x2={g.coords[shown][0]} y1={pad.t} y2={H - pad.b} /> : null}
        <motion.circle animate={{ cx: g.coords[shown][0], cy: g.coords[shown][1] }} fill="var(--card)" r="5.5" stroke="var(--tint)" strokeWidth="3" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
        <text className="fill-muted-foreground text-[10.5px]" x={pad.l} y={H - 5}>
          {format.shortDate(g.x0)}
        </text>
        {g.x1 !== g.x0 ? (
          <text className="fill-muted-foreground text-[10.5px]" textAnchor="end" x={W - pad.r} y={H - 5}>
            {format.shortDate(g.x1)}
          </text>
        ) : null}
      </svg>
    </div>
  );
}

export function Sparkline({ values, width = 64, height = 26 }: { values: number[]; width?: number; height?: number }) {
  const id = useId();
  if (values.length < 2) return <svg aria-hidden="true" height={height} width={width} />;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * (width - 4) + 2).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`).join("");
  return (
    <svg aria-hidden="true" height={height} viewBox={`0 0 ${width} ${height}`} width={width}>
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0" stopColor="var(--tint-2)" />
          <stop offset="1" stopColor="var(--tint)" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={`url(#${id})`} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}
