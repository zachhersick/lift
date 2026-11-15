// Plate math: plates per side, the nearest loadable weight and warm-up sets.

// ---------- plates and warm-ups ----------

export const PLATES = { lb: [45, 35, 25, 10, 5, 2.5], kg: [25, 20, 15, 10, 5, 2.5, 1.25] };
export const BARS = { lb: [45, 35, 25, 15], kg: [20, 15, 10] };

const round3 = (n) => Math.round(n * 1000) / 1000;

// Plates per side for a barbell weight, heaviest first. `leftover` is what
// can't be loaded with the plates you have (positive = short of target).
export function plateBreakdown(target, { bar = 45, plates = PLATES.lb } = {}) {
  const weight = Number(target) || 0;
  if (weight < bar) return { bar, perSide: [], loaded: bar, leftover: round3(weight - bar) };
  let remaining = (weight - bar) / 2;
  const perSide = [];
  for (const plate of [...plates].sort((a, b) => b - a)) {
    while (remaining >= plate - 1e-9) {
      perSide.push(plate);
      remaining = round3(remaining - plate);
    }
  }
  const loaded = round3(bar + 2 * perSide.reduce((sum, plate) => sum + plate, 0));
  return { bar, perSide, loaded, leftover: round3(weight - loaded) };
}

// The bar under the plates: plate-loaded machines start at zero.
export const barFor = (equipment, bar) => (equipment === "plate loaded" ? 0 : bar);

// The nearest weight you can actually load: bar + pairs of the smallest plate
// for barbells and plate-loaded machines, otherwise a multiple of your weight
// jump.
export function roundLoadable(weight, { equipment, bar = 45, plates = PLATES.lb, step = 5 } = {}) {
  if (equipment === "barbell" || equipment === "plate loaded") {
    bar = barFor(equipment, bar);
    const pair = 2 * Math.min(...plates);
    return Math.max(bar, round3(bar + Math.round((weight - bar) / pair) * pair));
  }
  return Math.max(step, round3(Math.round(weight / step) * step));
}

const RAMP = [[0.4, 8], [0.6, 5], [0.8, 3]];

// Warm-up sets that ramp to the working weight: the empty bar for barbell
// lifts, then 40/60/80%, each loadable and heavier than the one before.
export function warmupSets(working, options = {}) {
  const target = Number(working) || 0;
  if (target <= 0) return [];
  const barbell = options.equipment === "barbell";
  const bar = options.bar ?? 45;
  const sets = [];
  if (barbell && target > bar) sets.push({ weight: bar, reps: 10 });
  for (const [pct, reps] of RAMP) {
    const weight = roundLoadable(target * pct, options);
    const last = sets.length ? sets[sets.length - 1].weight : 0;
    if (weight <= last || weight >= target) continue;
    sets.push({ weight, reps });
  }
  return sets;
}

