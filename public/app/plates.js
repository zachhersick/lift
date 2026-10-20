// The plate calculator: what goes on each side of the bar for a weight,
// drawn as one sleeve of the barbell.
import { html } from "./html.js";
import { Group, Cell, Sheet } from "./ui.js";
import { settings } from "./store.js";
import { plateBreakdown } from "./model.js";
import * as format from "./format.js";

// Bumper-plate colors by size rank, heaviest first.
const COLORS = ["#0A84FF", "#FFD60A", "#30D158", "#8E8E93", "#FF453A", "#AEAEB2", "#636366"];

export function Barbell({ perSide, plates }) {
  const sizes = [...plates].sort((a, b) => b - a);
  const W = 320;
  const H = 130;
  const mid = H / 2;
  let x = 70;
  const drawn = perSide.map((plate) => {
    const rank = sizes.indexOf(plate);
    const height = Math.max(34, 118 - rank * 14);
    const width = Math.max(7, 20 - rank * 2.4);
    const rect = { x, y: mid - height / 2, width, height, fill: COLORS[rank] || COLORS[COLORS.length - 1] };
    x += width + 2;
    return rect;
  });
  return html`
    <svg class="barbell" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${perSide.length ? `Per side: ${perSide.join(", ")}` : "Empty bar"}>
      <rect x="0" y=${mid - 4} width="64" height="8" rx="2" fill="var(--label-3)" />
      <rect x="58" y=${mid - 16} width="10" height="32" rx="2" fill="var(--label-2)" />
      <rect x="68" y=${mid - 7} width=${W - 70} height="14" rx="3" fill="var(--fill-2)" />
      ${drawn.map((r) => html`<rect x=${r.x} y=${r.y} width=${r.width} height=${r.height} rx="3" fill=${r.fill} />`)}
    </svg>`;
}

export function PlatesSheet({ open, onClose, weight }) {
  const s = settings.value;
  const result = plateBreakdown(weight, { bar: s.barWeight, plates: s.plates });
  const unit = s.unit;
  const counts = new Map();
  for (const plate of result.perSide) counts.set(plate, (counts.get(plate) || 0) + 1);
  return html`
    <${Sheet} open=${open} onClose=${onClose} title=${`${format.weight(weight)} ${unit}`} grouped>
      <${Barbell} perSide=${result.perSide} plates=${s.plates} />
      <${Group} header="Each side" footer=${result.leftover > 0
        ? `${format.weight(weight)} can't be loaded exactly with your plates. This loads ${format.weight(result.loaded)} ${unit}, ${format.weight(result.leftover)} ${unit} short.`
        : result.leftover < 0 ? `That's less than the ${format.weight(s.barWeight)} ${unit} bar.` : `Bar ${format.weight(s.barWeight)} ${unit}. Change the bar and your plates in Settings.`}>
        ${result.perSide.length
          ? [...counts.entries()].map(([plate, count]) => html`<${Cell} title=${`${format.weight(plate)} ${unit}`} value=${`× ${count}`} />`)
          : html`<${Cell} title="Just the bar" />`}
      </${Group}>
    </${Sheet}>`;
}
