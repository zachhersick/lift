// Shared building blocks: page header, bottom sheet, confirm dialog, toasts,
// number inputs, segmented control and the SVG charts.
import { signal } from "@preact/signals";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { html } from "./html.js";
import { Icon } from "./icons.js";
import { back } from "./router.js";
import * as format from "./format.js";

export function Header({ title, subtitle, backTo, action, large = true }) {
  return html`
    <header class=${`page-header ${large ? "large" : ""}`}>
      <div class="page-header-row">
        ${backTo !== undefined ? html`<button class="icon-btn back" onClick=${() => back(backTo)} aria-label="Back"><${Icon} name="left" /></button>` : null}
        <div class="page-title">
          <h1>${title}</h1>
          ${subtitle ? html`<p>${subtitle}</p>` : null}
        </div>
        ${action || null}
      </div>
    </header>`;
}

export function Sheet({ open, onClose, title, children, tall = false }) {
  const [visible, setVisible] = useState(open);
  useEffect(() => {
    if (open) setVisible(true);
    else {
      const t = setTimeout(() => setVisible(false), 220);
      return () => clearTimeout(t);
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => event.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    document.body.classList.add("sheet-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("sheet-open");
    };
  }, [open]);
  if (!visible) return null;
  return html`
    <div class=${`sheet-layer ${open ? "in" : "out"}`}>
      <div class="sheet-backdrop" onClick=${onClose}></div>
      <div class=${`sheet ${tall ? "tall" : ""}`} role="dialog" aria-modal="true" aria-label=${title || "Dialog"}>
        <div class="sheet-grip"></div>
        ${title ? html`<div class="sheet-head"><h2>${title}</h2><button class="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} name="x" /></button></div>` : null}
        <div class="sheet-body">${children}</div>
      </div>
    </div>`;
}

// A list of actions inside a sheet.
export function Menu({ items }) {
  return html`<div class="menu">${items.filter(Boolean).map((item) => html`
    <button class=${`menu-item ${item.danger ? "danger" : ""} ${item.active ? "active" : ""}`} onClick=${item.onClick} disabled=${item.disabled}>
      ${item.icon ? html`<${Icon} name=${item.icon} size=${20} />` : null}
      <span>${item.label}</span>
      ${item.hint ? html`<small>${item.hint}</small>` : null}
      ${item.active ? html`<${Icon} name="check" size=${18} class="menu-check" />` : null}
    </button>`)}</div>`;
}

// ---------- confirm ----------
const question = signal(null);

export function ask({ title, message = "", confirm = "OK", cancel = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    question.value = { title, message, confirm, cancel, danger, resolve };
  });
}

export function ConfirmHost() {
  const q = question.value;
  const close = (answer) => {
    q?.resolve(answer);
    question.value = q ? { ...q, closing: true } : null;
    setTimeout(() => (question.value = null), 0);
  };
  return html`
    <${Sheet} open=${Boolean(q && !q.closing)} onClose=${() => close(false)}>
      ${q ? html`
        <div class="confirm">
          <h2>${q.title}</h2>
          ${q.message ? html`<p>${q.message}</p>` : null}
          <div class="confirm-actions">
            <button class=${`btn ${q.danger ? "danger" : "primary"} block`} onClick=${() => close(true)}>${q.confirm}</button>
            <button class="btn ghost block" onClick=${() => close(false)}>${q.cancel}</button>
          </div>
        </div>` : null}
    </${Sheet}>`;
}

// ---------- toasts ----------
const toasts = signal([]);

export function toast(text, { icon = null, tone = "" } = {}) {
  const id = Math.random();
  toasts.value = [...toasts.value, { id, text, icon, tone }];
  setTimeout(() => (toasts.value = toasts.value.filter((item) => item.id !== id)), 2600);
}

export function ToastHost() {
  return html`<div class="toasts" aria-live="polite">${toasts.value.map((item) => html`
    <div class=${`toast ${item.tone}`} key=${item.id}>${item.icon ? html`<${Icon} name=${item.icon} size=${18} />` : null}${item.text}</div>`)}</div>`;
}

// ---------- inputs ----------
// Keeps the typed text (so "102." survives) and reports numbers upward.
export function NumInput({ value, placeholder, onChange, decimal = true, class: className = "", label, onEnter }) {
  const [text, setText] = useState(value ?? "");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value ?? "");
  }, [value]);
  return html`<input
    class=${`num ${className}`}
    type="text"
    inputmode=${decimal ? "decimal" : "numeric"}
    enterkeyhint="done"
    autocomplete="off"
    aria-label=${label}
    value=${text}
    placeholder=${placeholder ?? ""}
    onFocus=${(event) => {
      focused.current = true;
      event.currentTarget.select();
    }}
    onBlur=${() => {
      focused.current = false;
      setText(value ?? "");
    }}
    onKeyDown=${(event) => {
      if (event.key === "Enter") {
        event.currentTarget.blur();
        onEnter?.();
      }
    }}
    onInput=${(event) => {
      const raw = event.currentTarget.value.replace(",", ".").replace(decimal ? /[^0-9.]/g : /[^0-9]/g, "");
      setText(raw);
      if (raw === "" || raw === ".") onChange(null);
      else if (!Number.isNaN(Number(raw))) onChange(Number(raw));
    }}
  />`;
}

export function Stepper({ value, onChange, min = 0, max = 99, step = 1, format: show = (v) => v, label }) {
  return html`
    <div class="stepper" role="group" aria-label=${label}>
      <button onClick=${() => onChange(Math.max(min, value - step))} disabled=${value <= min} aria-label=${`Less ${label || ""}`}>−</button>
      <span>${show(value)}</span>
      <button onClick=${() => onChange(Math.min(max, value + step))} disabled=${value >= max} aria-label=${`More ${label || ""}`}>+</button>
    </div>`;
}

export function Segmented({ options, value, onChange, small = false }) {
  return html`<div class=${`segmented ${small ? "small" : ""}`} role="tablist">${options.map((option) => html`
    <button role="tab" aria-selected=${option.value === value} class=${option.value === value ? "on" : ""} onClick=${() => onChange(option.value)}>${option.label}</button>`)}</div>`;
}

export function Toggle({ checked, onChange, label }) {
  return html`<button class=${`toggle ${checked ? "on" : ""}`} role="switch" aria-checked=${checked} aria-label=${label} onClick=${() => onChange(!checked)}><span></span></button>`;
}

export function Empty({ icon = "today", title, children }) {
  return html`<div class="empty"><div class="empty-icon"><${Icon} name=${icon} size=${28} /></div><h3>${title}</h3>${children ? html`<div class="empty-body">${children}</div>` : null}</div>`;
}

export function Stat({ label, value, sub }) {
  return html`<div class="stat"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong>${sub ? html`<span class="stat-sub">${sub}</span>` : null}</div>`;
}

// ---------- charts ----------
function niceRange(min, max) {
  if (min === max) return [min * 0.9, max * 1.1 || 1];
  const pad = (max - min) * 0.12;
  return [Math.max(0, min - pad), max + pad];
}

export function LineChart({ points, unit = "", height = 190, label = (v) => format.weight(v) }) {
  const [active, setActive] = useState(null);
  const box = useRef(null);
  const W = 340;
  const H = height;
  const pad = { l: 38, r: 12, t: 14, b: 24 };
  const geometry = useMemo(() => {
    if (!points.length) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const [y0, y1] = niceRange(Math.min(...ys), Math.max(...ys));
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const sx = (x) => pad.l + (x1 === x0 ? (W - pad.l - pad.r) / 2 : ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r));
    const sy = (y) => pad.t + (1 - (y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
    const coords = points.map((p) => [sx(p.x), sy(p.y)]);
    const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
    const area = `${line}L${coords[coords.length - 1][0].toFixed(1)},${H - pad.b}L${coords[0][0].toFixed(1)},${H - pad.b}Z`;
    const ticks = [y0, (y0 + y1) / 2, y1];
    return { coords, line, area, ticks, sy, x0, x1 };
  }, [points, H]);

  if (!geometry) return html`<div class="chart-empty">No data yet</div>`;
  const shown = active ?? points.length - 1;
  const point = points[shown];

  const pick = (event) => {
    const rect = box.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    let best = 0;
    geometry.coords.forEach(([cx], i) => {
      if (Math.abs(cx - x) < Math.abs(geometry.coords[best][0] - x)) best = i;
    });
    setActive(best);
  };

  return html`
    <div class="chart">
      <div class="chart-readout">
        <strong>${label(point.y)}<small> ${unit}</small></strong>
        <span>${format.date(point.x)}${point.note ? ` · ${point.note}` : ""}</span>
      </div>
      <svg ref=${box} viewBox=${`0 0 ${W} ${H}`} class="chart-svg" role="img" aria-label="Progress chart"
        onPointerDown=${pick} onPointerMove=${(e) => e.buttons && pick(e)} onPointerLeave=${() => setActive(null)}>
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="chart-stop-a" />
            <stop offset="1" class="chart-stop-b" />
          </linearGradient>
        </defs>
        ${geometry.ticks.map((tick) => html`
          <line class="chart-grid" x1=${pad.l} x2=${W - pad.r} y1=${geometry.sy(tick)} y2=${geometry.sy(tick)} />
          <text class="chart-tick" x=${pad.l - 6} y=${geometry.sy(tick) + 4} text-anchor="end">${Math.round(tick)}</text>`)}
        <path d=${geometry.area} fill="url(#chart-fill)" />
        <path d=${geometry.line} class="chart-line" />
        ${geometry.coords.map(([x, y], i) => html`<circle cx=${x} cy=${y} r=${i === shown ? 5 : points.length > 40 ? 0 : 2.5} class=${i === shown ? "chart-dot on" : "chart-dot"} />`)}
        <line class="chart-cursor" x1=${geometry.coords[shown][0]} x2=${geometry.coords[shown][0]} y1=${pad.t} y2=${H - pad.b} />
        <text class="chart-tick" x=${pad.l} y=${H - 6}>${format.shortDate(geometry.x0)}</text>
        <text class="chart-tick" x=${W - pad.r} y=${H - 6} text-anchor="end">${format.shortDate(geometry.x1)}</text>
      </svg>
    </div>`;
}

export function Sparkline({ values, width = 72, height = 26 }) {
  if (values.length < 2) return html`<svg width=${width} height=${height} class="spark"></svg>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * (width - 4) + 2).toFixed(1)},${(height - 3 - ((v - min) / range) * (height - 6)).toFixed(1)}`).join("");
  return html`<svg width=${width} height=${height} viewBox=${`0 0 ${width} ${height}`} class="spark" aria-hidden="true"><path d=${d} /></svg>`;
}

export function TrendChip({ trend }) {
  const map = { up: ["arrowUp", "Up"], down: ["arrowDown", "Down"], flat: ["arrowRight", "Flat"], new: ["plus", "New"] };
  const [icon, text] = map[trend] || map.new;
  return html`<span class=${`trend ${trend}`}><${Icon} name=${icon} size=${13} stroke=${2.6} />${text}</span>`;
}
