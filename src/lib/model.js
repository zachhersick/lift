// Pure workout logic: split rotation, previous sets, estimated 1RM, PRs and
// progression hints. No browser APIs here, so it runs under node --test too.

export const SET_TYPES = ["working", "warmup", "drop", "failure"];

export function uid(prefix = "r") {
  const random = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16) : Math.random().toString(36).slice(2, 18);
  return `${prefix}_${random}`;
}

export const live = (records) => [...records].filter((record) => record && !record.deleted);

export function orderedDays(splitDays) {
  return live(splitDays).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.id).localeCompare(String(b.id)));
}

export const finished = (workouts) => live(workouts).filter((workout) => workout.finishedAt);
export const byNewest = (a, b) => (b.startedAt || 0) - (a.startedAt || 0);
export const byOldest = (a, b) => (a.startedAt || 0) - (b.startedAt || 0);

// A rotating split: whatever came after the last day you logged is next, so
// doing a different day than suggested simply moves the cycle along.
export function nextSplitDay(splitDays, workouts) {
  const days = orderedDays(splitDays);
  if (!days.length) return null;
  const ids = new Set(days.map((day) => day.id));
  const last = finished(workouts).filter((workout) => ids.has(workout.splitDayId)).sort(byNewest)[0];
  const index = last ? (days.findIndex((day) => day.id === last.splitDayId) + 1) % days.length : 0;
  return { day: days[index], index, count: days.length, lastDoneAt: lastDoneAt(days[index].id, workouts) };
}

export function lastDoneAt(splitDayId, workouts) {
  const last = finished(workouts).filter((workout) => workout.splitDayId === splitDayId).sort(byNewest)[0];
  return last ? last.startedAt : null;
}

export const isWorking = (set) => Boolean(set?.done) && set.type !== "warmup";
export const workingSets = (entry) => (entry?.sets || []).filter(isWorking);

export function e1rm(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

export const setVolume = (set) => (Number(set.weight) || 0) * (Number(set.reps) || 0);

export function entryVolume(entry) {
  return workingSets(entry).reduce((sum, set) => sum + setVolume(set), 0);
}

export function workoutVolume(workout) {
  return (workout?.entries || []).reduce((sum, entry) => sum + entryVolume(entry), 0);
}

export function workoutSetCount(workout) {
  return (workout?.entries || []).reduce((sum, entry) => sum + workingSets(entry).length, 0);
}

// The most recent finished workout (other than `excludeId`) where this
// exercise had at least one completed set.
export function previousEntry(workouts, exerciseId, { before = Infinity, excludeId = null } = {}) {
  for (const workout of finished(workouts).sort(byNewest)) {
    if (workout.id === excludeId || (workout.startedAt || 0) >= before) continue;
    const entry = (workout.entries || []).find((item) => item.exerciseId === exerciseId && item.sets?.some((set) => set.done));
    if (entry) return { entry, workout };
  }
  return null;
}

function topSetOf(sets) {
  return sets.reduce((best, set) => {
    if (!best) return set;
    const w = Number(set.weight) || 0;
    const bw = Number(best.weight) || 0;
    return w > bw || (w === bw && (Number(set.reps) || 0) > (Number(best.reps) || 0)) ? set : best;
  }, null);
}

// One point per finished workout that included the exercise, oldest first.
export function exerciseHistory(workouts, exerciseId, { excludeId = null, before = Infinity } = {}) {
  const points = [];
  for (const workout of finished(workouts).sort(byOldest)) {
    if (workout.id === excludeId || (workout.startedAt || 0) >= before) continue;
    for (const entry of workout.entries || []) {
      if (entry.exerciseId !== exerciseId) continue;
      const sets = workingSets(entry);
      if (!sets.length) continue;
      const top = topSetOf(sets);
      points.push({
        workoutId: workout.id,
        date: workout.startedAt,
        sets,
        topSet: top,
        topWeight: Number(top.weight) || 0,
        bestE1rm: Math.max(...sets.map((set) => e1rm(set.weight, set.reps))),
        volume: sets.reduce((sum, set) => sum + setVolume(set), 0),
        totalReps: sets.reduce((sum, set) => sum + (Number(set.reps) || 0), 0)
      });
    }
  }
  return points;
}

export function personalRecords(history) {
  const records = { weight: null, e1rm: null, volume: null, reps: null, repsAtWeight: new Map() };
  for (const point of history) {
    for (const set of point.sets) {
      const weight = Number(set.weight) || 0;
      const reps = Number(set.reps) || 0;
      const est = e1rm(weight, reps);
      if (!records.weight || weight > records.weight.weight || (weight === records.weight.weight && reps > records.weight.reps)) records.weight = { weight, reps, date: point.date };
      if (est > 0 && (!records.e1rm || est > records.e1rm.value)) records.e1rm = { value: est, weight, reps, date: point.date };
      if (!records.reps || reps > records.reps.reps) records.reps = { weight, reps, date: point.date };
      if (reps > (records.repsAtWeight.get(weight)?.reps || 0)) records.repsAtWeight.set(weight, { reps, date: point.date });
    }
    if (!records.volume || point.volume > records.volume.value) records.volume = { value: point.volume, date: point.date };
  }
  return records;
}

// Whether a completed set beats everything logged before this workout. The
// first time you do an exercise there's nothing to beat, so no PR yet.
export function isPersonalRecord(set, priorRecords) {
  if (!isWorking(set) || !priorRecords?.weight) return false;
  const weight = Number(set.weight) || 0;
  const reps = Number(set.reps) || 0;
  if (weight > 0 && weight > priorRecords.weight.weight) return true;
  if (e1rm(weight, reps) > (priorRecords.e1rm?.value || 0) + 0.01) return true;
  if (weight === 0 && priorRecords.weight.weight === 0 && reps > (priorRecords.reps?.reps || 0)) return true;
  return false;
}

const fmt = (n) => String(Math.round(n * 100) / 100);

// Double progression: work up to the top of the rep range on every set, then
// add weight and start back at the bottom of the range.
export function suggestion(previous, target = {}, step = 5) {
  const sets = workingSets(previous);
  if (!sets.length) return null;
  const top = Math.max(...sets.map((set) => Number(set.weight) || 0));
  const atTop = sets.filter((set) => (Number(set.weight) || 0) === top);
  const reps = atTop.map((set) => Number(set.reps) || 0);
  const minReps = Math.min(...reps);
  const maxReps = Math.max(...reps);
  const { repMin, repMax } = target;
  if (top === 0) return { kind: "reps", weight: 0, reps: maxReps + 1, text: `Beat ${maxReps} reps` };
  if (!repMin || !repMax) return { kind: "reps", weight: top, reps: minReps + 1, text: `Beat ${fmt(top)} × ${maxReps}` };
  if (minReps >= repMax) return { kind: "up", weight: top + step, reps: repMin, text: `You hit ${repMax}+ on every set. Go up to ${fmt(top + step)}` };
  if (minReps < repMin) return { kind: "hold", weight: top, reps: repMin, text: `Stay at ${fmt(top)} and get ${repMin}+ on every set` };
  return { kind: "reps", weight: top, reps: minReps + 1, text: `Stay at ${fmt(top)} and aim for ${minReps + 1}+ reps` };
}

// What a set row shows greyed out before you type: the matching set from last
// time, or the suggested weight when it's time to go up. `entry` is the
// current exercise, so the 2nd working set lines up with last time's 2nd.
export function placeholderFor(entry, setIndex, previous, hint) {
  const set = entry.sets[setIndex];
  const type = set.type || "working";
  const typeIndex = entry.sets.slice(0, setIndex).filter((item) => (item.type || "working") === type).length;
  const done = previous?.sets?.filter((item) => item.done) || [];
  const sameType = done.filter((item) => (item.type || "working") === type);
  const prev = sameType[Math.min(typeIndex, sameType.length - 1)] || (type === "warmup" ? null : done[Math.min(setIndex, done.length - 1)]) || null;
  if (hint?.kind === "up" && type !== "warmup") return { weight: hint.weight, reps: hint.reps, prev };
  return { weight: prev ? Number(prev.weight) || 0 : null, reps: prev ? Number(prev.reps) || 0 : null, prev };
}

// Up, flat or down: the average best e1RM of the last three sessions against
// the three before them.
export function trend(history) {
  if (history.length < 2) return "new";
  const values = history.map((point) => point.bestE1rm || point.totalReps);
  const recent = values.slice(-3);
  const earlier = values.slice(-6, -3).length ? values.slice(-6, -3) : values.slice(0, 1);
  const avg = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
  const change = (avg(recent) - avg(earlier)) / (avg(earlier) || 1);
  return change > 0.01 ? "up" : change < -0.01 ? "down" : "flat";
}

export function startOfWeek(time = Date.now()) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime();
}

export const newSet = (type = "working") => ({ id: uid("s"), weight: null, reps: null, type, done: false });

export function newEntry(exerciseId, target = {}, defaultRest = 120) {
  const count = Math.max(1, Number(target.targetSets) || 3);
  return {
    id: uid("e"),
    exerciseId,
    repMin: target.repMin ?? null,
    repMax: target.repMax ?? null,
    restSec: target.restSec ?? defaultRest,
    supersetId: target.supersetId ?? null,
    notes: "",
    sets: Array.from({ length: count }, () => newSet())
  };
}

// A new workout from a split day: one empty row per target set.
export function workoutFromDay(day, { now = Date.now(), defaultRest = 120 } = {}) {
  return {
    id: uid("w"),
    kind: "workout",
    splitDayId: day?.id || null,
    name: day?.name || "Workout",
    startedAt: now,
    finishedAt: null,
    notes: "",
    entries: (day?.exercises || []).map((item) => newEntry(item.exerciseId, item, defaultRest))
  };
}

// Newest edit wins, record by record. Used when sync brings in a copy.
export function newer(local, incoming) {
  if (!incoming) return local;
  if (!local) return incoming;
  return (incoming.updatedAt || 0) > (local.updatedAt || 0) ? incoming : local;
}

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

// The nearest weight you can actually load: bar + pairs of the smallest plate
// for barbells, otherwise a multiple of your weight jump.
export function roundLoadable(weight, { equipment, bar = 45, plates = PLATES.lb, step = 5 } = {}) {
  if (equipment === "barbell") {
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

// ---------- weekly volume, consistency, bodyweight ----------

export function dateKey(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromDateKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

// Working sets per muscle group for workouts since `from`.
export function muscleSets(workouts, exerciseIndex, from = 0) {
  const counts = new Map();
  for (const workout of finished(workouts)) {
    if (workout.rest || (workout.startedAt || 0) < from) continue;
    for (const entry of workout.entries || []) {
      const muscle = exerciseIndex.get(entry.exerciseId)?.muscle || "other";
      const sets = workingSets(entry).length;
      if (sets) counts.set(muscle, (counts.get(muscle) || 0) + sets);
    }
  }
  return [...counts.entries()].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}

// Volume and set count per calendar day.
export function dailyVolume(workouts) {
  const days = new Map();
  for (const workout of finished(workouts)) {
    if (workout.rest) continue;
    const key = dateKey(workout.startedAt);
    const day = days.get(key) || { volume: 0, sets: 0, workouts: 0 };
    day.volume += workoutVolume(workout);
    day.sets += workoutSetCount(workout);
    day.workouts += 1;
    days.set(key, day);
  }
  return days;
}

// Weeks in a row with at least one workout. The current week only breaks
// the streak once it's over.
export function weekStreak(workouts, now = Date.now()) {
  const weeks = new Set(finished(workouts).filter((w) => !w.rest).map((w) => startOfWeek(w.startedAt)));
  const halfWeek = 3.5 * 86_400_000;
  let week = startOfWeek(now);
  if (!weeks.has(week)) week = startOfWeek(week - halfWeek);
  let streak = 0;
  while (weeks.has(week)) {
    streak += 1;
    week = startOfWeek(week - halfWeek);
  }
  return streak;
}

// One record per day, so logging twice on the same day replaces the first.
export const bodyweightId = (key) => `bw_${key}`;

// Average of the entries in the `days` days ending on each entry's date.
export function movingAverage(points, days = 7) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const span = (days - 1) * 86_400_000;
  return sorted.map((point) => {
    const end = fromDateKey(point.date);
    const window = sorted.filter((other) => {
      const t = fromDateKey(other.date);
      return t <= end && t >= end - span;
    });
    return { date: point.date, value: window.reduce((sum, item) => sum + item.weight, 0) / window.length };
  });
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

// ---------- weekly rings ----------

// How many training days a rotating split fits into a week, e.g.
// Push/Pull/Legs/Rest → 5. Used until you set your own weekly goal.
export function defaultWeeklyGoal(splitDays) {
  const days = orderedDays(splitDays);
  if (!days.length) return 3;
  const training = days.filter((day) => !day.rest).length;
  return Math.max(1, Math.round((training / days.length) * 7));
}

// Workouts, working sets and volume for sessions in [from, to).
export function weekSummary(workouts, from, to = Infinity) {
  const list = finished(workouts).filter((w) => !w.rest && w.startedAt >= from && w.startedAt < to);
  return {
    count: list.length,
    sets: list.reduce((sum, w) => sum + workoutSetCount(w), 0),
    volume: list.reduce((sum, w) => sum + workoutVolume(w), 0)
  };
}

// The last finished session of the same split day before this one.
export function previousSession(workouts, workout) {
  if (!workout?.splitDayId) return null;
  return finished(workouts)
    .filter((w) => !w.rest && w.id !== workout.id && w.splitDayId === workout.splitDayId && w.startedAt < workout.startedAt)
    .sort(byNewest)[0] || null;
}
