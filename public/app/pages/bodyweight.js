// Bodyweight: log a weigh-in from a number pad, and a chart with a 7-day
// moving average. One entry per day; logging the same day again replaces it.
import { useEffect, useMemo, useState } from "preact/hooks";
import { html } from "../html.js";
import { Icon } from "../icons.js";
import { ask, Cell, Group, LineChart, NavBar, Sheet, Summary, Unavailable } from "../ui.js";
import { KeyGrid } from "../keypad.js";
import { bodyweights, logBodyweight, remove, settings } from "../store.js";
import { dateKey, fromDateKey, movingAverage } from "../model.js";
import { haptic } from "../haptics.js";
import * as format from "../format.js";

export function BodyweightSheet({ open, onClose, entry = null }) {
  const unit = settings.value.unit;
  const last = bodyweights.value[0];
  const [text, setText] = useState("");
  const [date, setDate] = useState(dateKey());
  useEffect(() => {
    if (!open) return;
    setText(entry ? String(entry.weight) : "");
    setDate(entry ? entry.date : dateKey());
  }, [open]);
  const step = unit === "kg" ? 0.1 : 0.2;
  const placeholder = last ? format.weight(last.weight) : unit === "kg" ? "80" : "180";
  const value = text === "" ? null : Number(text);

  const key = (k) => {
    haptic(4);
    if (/^\d$/.test(k)) setText((t) => (t.replace(".", "").length >= 5 ? t : t === "0" ? k : t + k));
    else if (k === ".") setText((t) => (t.includes(".") ? t : (t || "0") + "."));
    else if (k === "back") setText((t) => t.slice(0, -1));
    else if (k === "minus" || k === "plus") {
      const base = value ?? Number(placeholder);
      setText(String(Math.max(0, Math.round((base + (k === "plus" ? step : -step)) * 10) / 10)));
    }
  };

  const saveIt = async () => {
    const weight = value ?? (last ? last.weight : null);
    if (!weight) return;
    if (entry && entry.date !== date) await remove(entry.id);
    await logBodyweight(weight, date);
    onClose();
  };

  return html`
    <${Sheet} open=${open} onClose=${onClose} title=${entry ? "Edit Weigh-in" : "Log Bodyweight"} grouped
      left=${html`<button class="nav-button" onClick=${onClose}>Cancel</button>`}
      right=${html`<button class="nav-button bold" onClick=${saveIt} disabled=${value === null && !last}>Save</button>`}>
      <div style="text-align:center;padding:8px 0 0">
        <div class="num" style=${`font-size:56px;line-height:64px;font-weight:700;color:${text ? "var(--label)" : "var(--label-3)"}`}>${text || placeholder}<span style="font-size:22px;color:var(--label-2);margin-left:6px;font-family:var(--font);font-weight:600">${unit}</span></div>
      </div>
      <${Group}>
        <${Cell} title="Date"><input class="text-field" type="date" value=${date} max=${dateKey()} onInput=${(e) => e.currentTarget.value && setDate(e.currentTarget.value)} aria-label="Date" /></${Cell}>
      </${Group}>
      <${KeyGrid} onKey=${key} side=${[
        html`<button class="key fn" onClick=${() => key("minus")} aria-label=${`Minus ${step}`}>−${step}</button>`,
        html`<button class="key fn" onClick=${() => key("plus")} aria-label=${`Plus ${step}`}>+${step}</button>`,
        html`<button class="key fn" disabled aria-hidden="true"></button>`,
        html`<button class="key next" onClick=${saveIt}>Save</button>`
      ]} />
      ${entry ? html`<${Group}><${Cell} title="Delete Weigh-in" destructive class="centered" onClick=${async () => {
        if (await ask({ title: "Delete Weigh-in?", confirm: "Delete", danger: true })) {
          await remove(entry.id);
          onClose();
        }
      }} /></${Group}>` : null}
    </${Sheet}>`;
}

const RANGES = [
  { value: 30, label: "1M" },
  { value: 90, label: "3M" },
  { value: 365, label: "1Y" },
  { value: 0, label: "All" }
];

export function BodyweightPage() {
  const [sheet, setSheet] = useState(null); // "new" | entry
  const [range, setRange] = useState(90);
  const unit = settings.value.unit;
  const list = bodyweights.value;
  const avg = useMemo(() => movingAverage(list), [list]);
  const from = range ? dateKey(Date.now() - range * 86_400_000) : "";
  const shown = [...list].reverse().filter((p) => p.date >= from);
  const shownAvg = avg.filter((p) => p.date >= from);
  const latestAvg = avg[avg.length - 1]?.value;
  const monthAgo = [...list].reverse().filter((p) => p.date <= dateKey(Date.now() - 30 * 86_400_000)).pop();
  const change = list.length && monthAgo ? list[0].weight - monthAgo.weight : null;

  return html`
    <div class="page">
      <${NavBar} title="Bodyweight" backTo="progress" backLabel="Progress"
        trailing=${html`<button class="nav-button" onClick=${() => setSheet("new")} aria-label="Log bodyweight"><${Icon} name="plus" size=${24} stroke=${2.2} /></button>`} />
      ${!list.length ? html`<${Unavailable} icon="scale" title="No Weigh-ins" action=${html`<button class="btn tinted small" onClick=${() => setSheet("new")}>Log Bodyweight</button>`}>Log your weight to see the trend. The 7-day average smooths out daily swings.</${Unavailable}>` : html`
        <div class="chart-card">
          <${LineChart} points=${shown.map((p) => ({ x: fromDateKey(p.date), y: p.weight }))} secondary=${shownAvg.map((p) => ({ x: fromDateKey(p.date), y: p.value }))}
            unit=${` ${unit}`} caption="Latest" label=${(v) => format.weight(Math.round(v * 10) / 10)} />
          <div class="segmented" role="radiogroup" aria-label="Range">${RANGES.map((r) => html`<button role="radio" aria-checked=${r.value === range} class=${r.value === range ? "on" : ""} onClick=${() => setRange(r.value)}>${r.label}</button>`)}</div>
        </div>
        <${Summary} items=${[
          { label: "Latest", value: format.weight(list[0].weight), unit },
          { label: "7-day avg", value: format.weight(Math.round(latestAvg * 10) / 10), unit },
          { label: "30 days", value: change === null ? "–" : `${change > 0 ? "+" : ""}${format.weight(Math.round(change * 10) / 10)}`, unit: change === null ? "" : unit }
        ]} />
        <${Group} header="All Weigh-ins" footer="The faint line on the chart is your 7-day average.">
          ${list.map((entry) => html`<${Cell} key=${entry.id} title=${format.date(fromDateKey(entry.date), { weekday: "short", month: "short", day: "numeric", year: "numeric" })} chevron onClick=${() => setSheet(entry)}>
            <span class="cell-value num">${format.weight(entry.weight)} ${unit}</span></${Cell}>`)}
        </${Group}>`}
      <${BodyweightSheet} open=${sheet !== null} onClose=${() => setSheet(null)} entry=${sheet && sheet !== "new" ? sheet : null} />
    </div>`;
}

