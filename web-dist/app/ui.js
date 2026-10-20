// The UI kit: navigation bar, grouped lists, sheets, alerts, toasts,
// controls and charts, styled after iOS.
import { signal } from "@preact/signals";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { html } from "./html.js";
import { Icon } from "./icons.js";
import { back } from "./router.js";
import * as format from "./format.js";

// ---------- navigation ----------

// A bar that stays put while the large title scrolls under it; once the
// title is gone the bar turns translucent and shows the title inline.
export function NavBar({ title, subtitle, large = true, largeContent, backTo, backLabel = "Back", leading, trailing, solid = false }) {
  const titleRef = useRef(null);
  const [collapsed, setCollapsed] = useState(!large);
  useEffect(() => {
    if (!large) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const el = titleRef.current;
      if (el) setCollapsed(el.getBoundingClientRect().bottom < 44 + 8);
    };
    const onScroll = () => frame || (frame = requestAnimationFrame(check));
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [large]);
  return html`
    <header class=${`nav ${collapsed ? "collapsed" : ""} ${solid ? "solid" : ""}`}>
      <div class="nav-leading">
        ${backTo !== undefined ? html`<button class="nav-back" onClick=${() => back(backTo)} aria-label=${`Back to ${backLabel}`}><${Icon} name="chevronLeft" size=${28} stroke=${2.6} /><span>${backLabel}</span></button>` : leading || null}
      </div>
      <div class="nav-title">${title}</div>
      <div class="nav-trailing">${trailing || null}</div>
    </header>
    ${large ? html`<div class="large-title" ref=${titleRef}>${largeContent || html`<h1>${title}</h1>${subtitle ? html`<p>${subtitle}</p>` : null}`}</div>` : null}`;
}

// ---------- lists ----------

export function Group({ header, prominent = false, accessory, footer, children, class: className = "", bodyClass = "" }) {
  return html`
    <section class=${`group ${className}`}>
      ${header ? html`<h2 class=${`group-header ${prominent ? "prominent" : ""}`}><span>${header}</span>${accessory || null}</h2>` : null}
      <div class=${`group-body ${bodyClass}`}>${children}</div>
      ${footer ? html`<p class="group-footer">${footer}</p>` : null}
    </section>`;
}

export function Cell({ title, subtitle, value, icon, iconBg, chevron, onClick, href, action, destructive, bold, children, class: className = "", disabled, label }) {
  const content = html`
    ${icon ? html`<span class="cell-icon" style=${iconBg ? `background:${iconBg}` : ""}><${Icon} name=${icon} size=${18} stroke=${2.2} /></span>` : null}
    <span class="cell-main">
      ${title !== undefined ? html`<span class=${`cell-title ${bold ? "bold" : ""}`}>${title}</span>` : null}
      ${subtitle ? html`<span class="cell-subtitle">${subtitle}</span>` : null}
    </span>
    ${value !== undefined && value !== null ? html`<span class="cell-value">${value}</span>` : null}
    ${children || null}
    ${chevron ? html`<${Icon} name="chevronRight" size=${20} stroke=${2.4} class="cell-chevron" />` : null}`;
  const classes = `cell ${icon ? "has-icon" : ""} ${action ? "action" : ""} ${destructive ? "destructive" : ""} ${className}`;
  if (href) return html`<a class=${classes} href=${href} aria-label=${label}>${content}</a>`;
  if (onClick) return html`<button class=${classes} onClick=${onClick} disabled=${disabled} aria-label=${label}>${content}</button>`;
  return html`<div class=${classes}>${content}</div>`;
}

// A list of actions (what a context menu would hold on iOS).
export function ActionList({ items }) {
  return html`<${Group}>${items.filter(Boolean).map((item) => html`
    <${Cell} title=${item.label} subtitle=${item.hint} icon=${item.icon} iconBg=${item.danger ? "var(--red)" : item.iconBg || "var(--fill-2)"}
      destructive=${item.danger} onClick=${item.onClick} disabled=${item.disabled}
      value=${item.value} class=${item.active ? "selected" : ""}>
      ${item.active ? html`<${Icon} name="check" size=${20} stroke=${2.6} class="tint-check" />` : null}
    </${Cell}>`)}</${Group}>`;
}

// ---------- sheets ----------

export function Sheet({ open, onClose, title, left, right, large = false, grouped = false, children }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const sheet = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 280);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => event.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
    };
  }, [open]);

  if (!mounted) return null;

  const down = (event) => {
    if (event.target.closest("button, input, a")) return;
    drag.current = { y: event.clientY, t: performance.now(), dy: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    sheet.current.classList.add("dragging");
  };
  const move = (event) => {
    if (!drag.current) return;
    drag.current.dy = Math.max(0, event.clientY - drag.current.y);
    sheet.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const up = () => {
    if (!drag.current) return;
    const { dy, t } = drag.current;
    const velocity = dy / Math.max(1, performance.now() - t);
    drag.current = null;
    const el = sheet.current;
    el.classList.remove("dragging");
    if (dy > 110 || velocity > 0.6) {
      el.style.transition = "transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)";
      el.style.transform = "translateY(100%)";
      setTimeout(() => {
        el.style.transition = "";
        el.style.transform = "";
        onClose?.();
      }, 220);
    } else {
      el.style.transition = "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)";
      el.style.transform = "";
      setTimeout(() => (el.style.transition = ""), 300);
    }
  };

  return html`
    <div class=${`sheet-layer ${closing ? "closing" : ""}`}>
      <div class="sheet-scrim" onClick=${onClose}></div>
      <div ref=${sheet} class=${`sheet ${large ? "large" : ""} ${grouped ? "grouped" : ""}`} role="dialog" aria-modal="true" aria-label=${title || "Sheet"}>
        <div class="sheet-drag" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
          <div class="sheet-grabber"></div>
          <div class="sheet-header">
            <div class="left">${left || null}</div>
            <h2>${title || ""}</h2>
            <div class="right">${right === undefined ? html`<button class="circle-btn" onClick=${onClose} aria-label="Close"><${Icon} name="x" size=${14} stroke=${3} /></button>` : right}</div>
          </div>
        </div>
        <div class="sheet-body">${children}</div>
      </div>
    </div>`;
}

// ---------- alerts ----------

const alertState = signal(null);

// An iOS alert. `actions` are { label, value, style: "cancel" | "danger" | "primary" }.
export function choose({ title, message = "", actions }) {
  return new Promise((resolve) => {
    alertState.value = { title, message, actions, resolve };
  });
}

export async function ask({ title, message = "", confirm = "OK", cancel = "Cancel", danger = false }) {
  return choose({ title, message, actions: [{ label: cancel, value: false, style: "cancel" }, { label: confirm, value: true, style: danger ? "danger" : "primary" }] });
}

export function AlertHost() {
  const a = alertState.value;
  if (!a) return null;
  const close = (value) => {
    alertState.value = null;
    a.resolve(value);
  };
  const stacked = a.actions.length > 2 || a.actions.some((item) => item.label.length > 12);
  const actions = stacked ? [...a.actions.filter((x) => x.style !== "cancel"), ...a.actions.filter((x) => x.style === "cancel")] : a.actions;
  return html`
    <div class="alert-layer" onClick=${(e) => e.target === e.currentTarget && close(a.actions.find((x) => x.style === "cancel")?.value ?? false)}>
      <div class="alert" role="alertdialog" aria-modal="true" aria-label=${a.title}>
        <div class="alert-text"><h2>${a.title}</h2>${a.message ? html`<p>${a.message}</p>` : null}</div>
        <div class=${`alert-actions ${stacked ? "stacked" : ""}`}>
          ${actions.map((item) => html`<button class=${item.style === "danger" ? "danger" : item.style === "cancel" && !stacked ? "" : item.style === "primary" ? "primary" : item.style === "cancel" ? "primary" : ""} onClick=${() => close(item.value)}>${item.label}</button>`)}
        </div>
      </div>
    </div>`;
}

// ---------- toasts ----------

const toasts = signal([]);

export function toast(text, { icon = "check", tone = "" } = {}) {
  const id = Math.random();
  toasts.value = [...toasts.value.slice(-2), { id, text, icon, tone }];
  setTimeout(() => (toasts.value = toasts.value.filter((item) => item.id !== id)), 2400);
}

export function ToastHost() {
  return html`<div class="toasts" aria-live="polite">${toasts.value.map((item) => html`
    <div class=${`toast ${item.tone}`} key=${item.id}>${item.icon ? html`<${Icon} name=${item.icon} size=${18} stroke=${2.4} />` : null}<span>${item.text}</span></div>`)}</div>`;
}

// ---------- controls ----------

export function Segmented({ options, value, onChange, label }) {
  return html`<div class="segmented" role="radiogroup" aria-label=${label}>${options.map((option) => html`
    <button role="radio" aria-checked=${option.value === value} class=${option.value === value ? "on" : ""} onClick=${() => onChange(option.value)}>${option.label}</button>`)}</div>`;
}

export function Switch({ checked, onChange, label }) {
  return html`<button class=${`switch ${checked ? "on" : ""}`} role="switch" aria-checked=${checked} aria-label=${label} onClick=${() => onChange(!checked)}><span></span></button>`;
}

export function Stepper({ value, onChange, min = 0, max = 99, step = 1, label }) {
  return html`
    <span class="row">
      <span class="stepper-value num">${value}</span>
      <span class="stepper" role="group" aria-label=${label}>
        <button onClick=${() => onChange(Math.max(min, value - step))} disabled=${value <= min} aria-label=${`Fewer ${label}`}><${Icon} name="minus" size=${18} stroke=${2.4} /></button>
        <i></i>
        <button onClick=${() => onChange(Math.min(max, value + step))} disabled=${value >= max} aria-label=${`More ${label}`}><${Icon} name="plus" size=${18} stroke=${2.4} /></button>
      </span>
    </span>`;
}

export function SearchField({ value, onInput, placeholder = "Search" }) {
  return html`
    <label class="search">
      <${Icon} name="search" size=${17} stroke=${2.2} />
      <input type="search" placeholder=${placeholder} value=${value} onInput=${(e) => onInput(e.currentTarget.value)} autocomplete="off" />
      ${value ? html`<button class="circle-btn" style="width:18px;height:18px;background:var(--label-3);color:var(--cell)" onClick=${(e) => { e.preventDefault(); onInput(""); }} aria-label="Clear"><${Icon} name="x" size=${10} stroke=${3.4} /></button>` : null}
    </label>`;
}

export function Unavailable({ icon = "today", title, children, action }) {
  return html`<div class="unavailable"><${Icon} name=${icon} size=${48} stroke=${1.6} /><h3>${title}</h3>${children ? html`<p>${children}</p>` : null}${action || null}</div>`;
}

export function Summary({ items }) {
  return html`<div class="summary" style=${`--cols:${items.length}`}>${items.map((item) => html`
    <div><span>${item.label}</span><strong>${item.value}${item.unit ? html`<small>${item.unit}</small>` : null}</strong></div>`)}</div>`;
}

export function TrendText({ trend }) {
  const map = { up: ["arrowUp", "Up"], down: ["arrowDown", "Down"], flat: ["minus", "Flat"], new: [null, "New"] };
  const [icon, text] = map[trend] || map.new;
  return html`<span class=${`trend ${trend}`}>${icon ? html`<${Icon} name=${icon} size=${14} stroke=${2.6} />` : null}${text}</span>`;
}

// ---------- charts ----------

function range(values) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= Math.max(1, Math.abs(min) * 0.05);
    max += Math.max(1, Math.abs(max) * 0.05);
  }
  const pad = (max - min) * 0.15;
  return [min - pad, max + pad];
}

// A line chart in the style of Swift Charts: y-axis on the right, light
// gridlines, scrubbing to read any point. `secondary` draws a faint second
// series (for example a moving average).
export function LineChart({ points, secondary = [], unit = "", label = (v) => format.weight(v), height = 180, caption = "" }) {
  const [active, setActive] = useState(null);
  const svg = useRef(null);
  const W = 340;
  const H = height;
  const pad = { l: 4, r: 40, t: 10, b: 22 };
  const g = useMemo(() => {
    if (!points.length) return null;
    const xs = points.map((p) => p.x);
    const [y0, y1] = range([...points.map((p) => p.y), ...secondary.map((p) => p.y)]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const sx = (x) => pad.l + (x1 === x0 ? (W - pad.l - pad.r) / 2 : ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r));
    const sy = (y) => pad.t + (1 - (y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
    const path = (list) => list.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
    const coords = points.map((p) => [sx(p.x), sy(p.y)]);
    const line = path(points);
    const area = `${line}L${coords[coords.length - 1][0].toFixed(1)},${H - pad.b}L${coords[0][0].toFixed(1)},${H - pad.b}Z`;
    const ticks = [0, 1, 2].map((i) => y0 + ((y1 - y0) * (i + 0.5)) / 3);
    return { coords, line, area, ticks, sy, x0, x1, second: secondary.length > 1 ? path(secondary) : "" };
  }, [points, secondary, H]);

  if (!g) return html`<div class="chart-empty">No data yet</div>`;
  const shown = active ?? points.length - 1;
  const point = points[shown];

  const pick = (event) => {
    const rect = svg.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    let best = 0;
    g.coords.forEach(([cx], i) => {
      if (Math.abs(cx - x) < Math.abs(g.coords[best][0] - x)) best = i;
    });
    setActive(best);
  };

  return html`
    <div class="chart">
      <div class="chart-readout">
        <span>${active === null ? caption || "Latest" : format.date(point.x)}</span>
        <strong>${label(point.y)}<small>${unit}</small></strong>
        <em>${active === null ? format.date(point.x) : point.note || ""}</em>
      </div>
      <svg ref=${svg} viewBox=${`0 0 ${W} ${H}`} class="chart-svg" role="img" aria-label=${`Chart, latest ${label(points[points.length - 1].y)} ${unit}`}
        onPointerDown=${pick} onPointerMove=${(e) => (e.buttons || e.pointerType === "mouse") && pick(e)} onPointerLeave=${() => setActive(null)}>
        <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="chart-area-a" /><stop offset="1" class="chart-area-b" /></linearGradient></defs>
        ${g.ticks.map((tick) => html`
          <line class="chart-grid" x1=${pad.l} x2=${W - pad.r + 4} y1=${g.sy(tick)} y2=${g.sy(tick)} />
          <text class="chart-tick" x=${W - pad.r + 8} y=${g.sy(tick) + 4}>${format.weight(Math.round(tick))}</text>`)}
        <line class="chart-grid" x1=${pad.l} x2=${W - pad.r + 4} y1=${H - pad.b} y2=${H - pad.b} />
        <path d=${g.area} fill="url(#area)" />
        ${g.second ? html`<path d=${g.second} class="chart-line faint" />` : null}
        <path d=${g.line} class="chart-line" />
        ${points.length <= 24 ? g.coords.map(([x, y], i) => i === shown ? null : html`<circle cx=${x} cy=${y} r="2.5" class="chart-dot" />`) : null}
        ${active !== null ? html`<line class="chart-cursor" x1=${g.coords[shown][0]} x2=${g.coords[shown][0]} y1=${pad.t} y2=${H - pad.b} />` : null}
        <circle cx=${g.coords[shown][0]} cy=${g.coords[shown][1]} r="5" class="chart-point" />
        <text class="chart-tick" x=${pad.l} y=${H - 5}>${format.shortDate(g.x0)}</text>
        ${g.x1 !== g.x0 ? html`<text class="chart-tick" x=${W - pad.r} y=${H - 5} text-anchor="end">${format.shortDate(g.x1)}</text>` : null}
      </svg>
    </div>`;
}

export function Sparkline({ values, width = 56, height = 24 }) {
  if (values.length < 2) return html`<svg width=${width} height=${height} class="spark" aria-hidden="true"></svg>`;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * (width - 4) + 2).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`).join("");
  return html`<svg width=${width} height=${height} viewBox=${`0 0 ${width} ${height}`} class="spark" aria-hidden="true"><path d=${d} /></svg>`;
}
