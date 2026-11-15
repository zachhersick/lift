// A workout in progress: supersets, focus-view steps, and the split day
// rewritten to match what you actually did.

// ---------- supersets ----------

// Consecutive entries sharing a supersetId form a group. For each entry this
// gives its group letter and position (A1, A2…), or null when it stands alone.
export function supersetLabels(entries) {
  const labels = entries.map(() => null);
  let letter = 0;
  for (let i = 0; i < entries.length; ) {
    const id = entries[i].supersetId;
    let j = i + 1;
    while (id && j < entries.length && entries[j].supersetId === id) j += 1;
    if (id && j - i > 1) {
      const group = String.fromCharCode(65 + (letter % 26));
      for (let k = i; k < j; k += 1) labels[k] = { group, position: k - i + 1, size: j - i, first: k === i, last: k === j - 1 };
      letter += 1;
    }
    i = j;
  }
  return labels;
}

// The screens of a workout's focus view: each exercise on its own, or a
// whole superset together since you alternate between its exercises.
export function workoutSteps(entries) {
  const labels = supersetLabels(entries);
  const steps = [];
  entries.forEach((entry, index) => {
    if (labels[index] && !labels[index].first) {
      const step = steps[steps.length - 1];
      step.entryIds.push(entry.id);
      step.end = index;
    } else steps.push({ entryIds: [entry.id], start: index, end: index });
  });
  return steps;
}

// Checked and total sets in a step; it's done when every set is checked.
export function stepProgress(step, entries) {
  const sets = entries.filter((entry) => step.entryIds.includes(entry.id)).flatMap((entry) => entry.sets || []);
  const done = sets.filter((set) => set.done).length;
  return { done, total: sets.length, complete: sets.length > 0 && done === sets.length };
}

// Rest only after the last exercise of a superset (or any standalone one).
export function restsAfter(entries, index) {
  const label = supersetLabels(entries)[index];
  return !label || label.last;
}

// The exercise to do next inside a superset: the following one, or back to
// the first after the last.
export function nextInSuperset(entries, index) {
  const label = supersetLabels(entries)[index];
  if (!label) return null;
  return label.last ? index - (label.size - 1) : index + 1;
}


// ---------- split vs. what you actually did ----------

// The split day's exercise list rewritten to match a workout as you set it
// up (pass it before unchecked sets are dropped): same order, exercises and
// working-set rows. Targets already set (rep range, rest) are kept.
// `changes` describes what's different.
export function splitDiff(day, workout, nameOf = (id) => id) {
  const before = day?.exercises || [];
  const entries = (workout?.entries || []).filter((entry) => entry.sets?.some((set) => set.type !== "warmup"));
  const after = entries.map((entry) => {
    const existing = before.find((item) => item.exerciseId === entry.exerciseId) || {};
    return {
      ...existing,
      exerciseId: entry.exerciseId,
      targetSets: entry.sets.filter((set) => set.type !== "warmup").length,
      repMin: existing.repMin ?? entry.repMin ?? 8,
      repMax: existing.repMax ?? entry.repMax ?? 12,
      restSec: existing.restSec ?? entry.restSec ?? 120,
      supersetId: entry.supersetId ?? null
    };
  });
  const changes = [];
  const beforeIds = before.map((item) => item.exerciseId);
  const afterIds = after.map((item) => item.exerciseId);
  for (const id of afterIds) if (!beforeIds.includes(id)) changes.push(`Add ${nameOf(id)}`);
  for (const id of beforeIds) if (!afterIds.includes(id)) changes.push(`Remove ${nameOf(id)}`);
  if (afterIds.filter((id) => beforeIds.includes(id)).join() !== beforeIds.filter((id) => afterIds.includes(id)).join()) changes.push("New exercise order");
  for (const item of after) {
    const old = before.find((b) => b.exerciseId === item.exerciseId);
    if (old && (Number(old.targetSets) || 3) !== item.targetSets) changes.push(`${nameOf(item.exerciseId)}: ${item.targetSets} ${item.targetSets === 1 ? "set" : "sets"}`);
  }
  const groups = (list) => list.map((item) => (item.supersetId ? list.filter((o) => o.supersetId === item.supersetId).map((o) => o.exerciseId).join("+") : "")).join("|");
  if (groups(before) !== groups(after)) changes.push("Supersets changed");
  return { changes, exercises: after };
}

