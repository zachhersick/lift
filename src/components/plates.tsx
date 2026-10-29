// The plate calculator: one sleeve of the bar with the plates sliding on.
import { motion } from "motion/react";
import { barFor, plateBreakdown } from "@/lib/model.js";
import { settings } from "@/lib/store.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { Card, Row, Section, Sheet } from "./kit";

// Bumper-plate colors by size rank, heaviest first.
const COLORS = ["#3b82f6", "#facc15", "#22c55e", "#a1a1aa", "#ef4444", "#d4d4d8", "#71717a"];

export function Barbell({ perSide, plates }: { perSide: number[]; plates: number[] }) {
  const sizes = [...plates].sort((a, b) => b - a);
  const W = 320;
  const H = 140;
  const mid = H / 2;
  let x = 72;
  const drawn = perSide.map((plate, i) => {
    const rank = sizes.indexOf(plate);
    const height = Math.max(36, 124 - rank * 15);
    const width = Math.max(8, 22 - rank * 2.6);
    const rect = { key: `${i}-${plate}`, x, y: mid - height / 2, width, height, fill: COLORS[rank] || COLORS[COLORS.length - 1], i };
    x += width + 2.5;
    return rect;
  });
  return (
    <svg aria-label={perSide.length ? `Per side: ${perSide.join(", ")}` : "Empty bar"} className="h-auto w-full" role="img" viewBox={`0 0 ${W} ${H}`}>
      <rect fill="var(--muted-foreground)" height="8" opacity="0.5" rx="3" width="66" x="0" y={mid - 4} />
      <rect fill="var(--muted-foreground)" height="34" rx="3" width="10" x="60" y={mid - 17} />
      <rect fill="var(--input)" height="16" rx="4" width={W - 72} x="70" y={mid - 8} />
      {drawn.map((r) => (
        <motion.rect
          animate={{ x: r.x, opacity: 1 }}
          fill={r.fill}
          height={r.height}
          initial={{ x: W, opacity: 0 }}
          key={r.key}
          rx="4"
          transition={{ type: "spring", stiffness: 300, damping: 26, delay: r.i * 0.06 }}
          width={r.width}
          y={r.y}
        />
      ))}
    </svg>
  );
}

// Plate-loaded machines use the same plates with no bar, so they start at 0.
export function PlatesSheet({ open, onClose, weight, equipment }: { open: boolean; onClose: () => void; weight: number; equipment?: string }) {
  const s = useValue(settings);
  const bar = barFor(equipment, s.barWeight);
  const result = plateBreakdown(weight, { bar, plates: s.plates });
  const counts = new Map<number, number>();
  for (const plate of result.perSide) counts.set(plate, (counts.get(plate) || 0) + 1);
  const footer =
    result.leftover > 0
      ? `${format.weight(weight)} can't be loaded exactly with your plates. This loads ${format.weight(result.loaded)} ${s.unit}, ${format.weight(result.leftover)} ${s.unit} short.`
      : result.leftover < 0
        ? `That's less than the ${format.weight(bar)} ${s.unit} bar.`
        : bar
          ? `On a ${format.weight(bar)} ${s.unit} bar. Change the bar and plates in Settings.`
          : "Plate loaded, so no bar: the weight is just the plates. Change your plates in Settings.";
  return (
    <Sheet onClose={onClose} open={open} title={`${format.weight(weight)} ${s.unit}`}>
      <Card className="px-3 py-4">
        <Barbell key={`${weight}-${open}`} perSide={result.perSide} plates={s.plates} />
      </Card>
      <Section footer={footer} title="Each side">
        <Card className="divide-y divide-border">
          {result.perSide.length ? [...counts.entries()].map(([plate, count]) => <Row key={plate} title={`${format.weight(plate)} ${s.unit}`} value={`× ${count}`} />) : <Row title={bar ? "Just the bar" : "No plates"} />}
        </Card>
      </Section>
    </Sheet>
  );
}
