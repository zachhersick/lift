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

// ---------- tracking types ----------

// How an exercise is logged. Strength is weight × reps; cardio is incline,
// speed and time; timed (plyo, planks) is time with optional reps.
export const TRACKS = ["strength", "cardio", "timed"];
export const FIELDS = { strength: ["weight", "reps"], cardio: ["incline", "speed", "seconds"], timed: ["seconds", "reps"] };
export const trackOf = (exercise) => (TRACKS.includes(exercise?.track) ? exercise.track : "strength");

// A set counts once its required fields are in: reps for strength (weight
// may be 0 for bodyweight), time for cardio and timed.
export function isComplete(set, track = "strength") {
  if (track === "strength") return (Number(set?.reps) || 0) > 0 && set?.weight != null;
  return (Number(set?.seconds) || 0) > 0;
}

export const setSeconds = (set) => Number(set?.seconds) || 0;

// Distance from speed (per hour) and time, in miles or km.
export const setDistance = (set) => ((Number(set?.speed) || 0) * setSeconds(set)) / 3600;

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
      const timed = sets.some((set) => set.seconds != null);
      const top = timed ? sets.reduce((best, set) => (setSeconds(set) > setSeconds(best) ? set : best), sets[0]) : topSetOf(sets);
      const point = {
        workoutId: workout.id,
        date: workout.startedAt,
        sets,
        topSet: top,
        topWeight: Number(top.weight) || 0,
        bestE1rm: Math.max(...sets.map((set) => e1rm(set.weight, set.reps))),
        volume: sets.reduce((sum, set) => sum + setVolume(set), 0),
        totalReps: sets.reduce((sum, set) => sum + (Number(set.reps) || 0), 0),
        seconds: sets.reduce((sum, set) => sum + setSeconds(set), 0),
        longest: Math.max(...sets.map(setSeconds)),
        distance: sets.reduce((sum, set) => sum + setDistance(set), 0),
        topSpeed: Math.max(...sets.map((set) => Number(set.speed) || 0)),
        maxIncline: Math.max(...sets.map((set) => Number(set.incline) || 0)),
        maxReps: Math.max(...sets.map((set) => Number(set.reps) || 0))
      };
      // What "better" means for the trend: e1RM for lifts, distance (or time)
      // for cardio, the longest set (or reps) for timed work.
      point.score = point.bestE1rm || point.distance || point.longest || point.totalReps;
      points.push(point);
    }
  }
  return points;
}

export function personalRecords(history) {
  const records = { weight: null, e1rm: null, volume: null, reps: null, repsAtWeight: new Map(), longest: null, session: null, distance: null, speed: null, incline: null };
  for (const point of history) {
    if (point.seconds > 0) {
      if (!records.longest || point.longest > records.longest.seconds) records.longest = { seconds: point.longest, date: point.date };
      if (!records.session || point.seconds > records.session.seconds) records.session = { seconds: point.seconds, date: point.date };
      if (point.distance > 0 && (!records.distance || point.distance > records.distance.value)) records.distance = { value: point.distance, date: point.date };
      if (point.topSpeed > 0 && (!records.speed || point.topSpeed > records.speed.value)) records.speed = { value: point.topSpeed, date: point.date };
      if (point.maxIncline > 0 && (!records.incline || point.maxIncline > records.incline.value)) records.incline = { value: point.maxIncline, date: point.date };
      if (point.maxReps > 0 && (!records.reps || point.maxReps > records.reps.reps)) records.reps = { weight: 0, reps: point.maxReps, date: point.date };
      continue;
    }
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
export function isPersonalRecord(set, priorRecords, track = "strength") {
  if (!isWorking(set)) return false;
  if (track !== "strength") {
    if (!priorRecords?.longest) return false;
    if (setSeconds(set) > priorRecords.longest.seconds) return true;
    if (track === "cardio") {
      if ((Number(set.speed) || 0) > (priorRecords.speed?.value ?? Infinity)) return true;
      if ((Number(set.incline) || 0) > (priorRecords.incline?.value ?? Infinity)) return true;
      return false;
    }
    return (Number(set.reps) || 0) > (priorRecords.reps?.reps ?? Infinity);
  }
  if (!priorRecords?.weight) return false;
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
export function suggestion(previous, target = {}, step = 5, track = "strength", speedUnit = "mph") {
  const sets = workingSets(previous);
  if (!sets.length) return null;
  if (track === "cardio") {
    const top = sets.reduce((best, set) => (setSeconds(set) > setSeconds(best) ? set : best), sets[0]);
    const parts = [top.incline != null ? `${fmt(Number(top.incline))}%` : "", top.speed != null ? `${fmt(Number(top.speed))} ${speedUnit}` : ""].filter(Boolean).join(" · ");
    return { kind: "cardio", seconds: setSeconds(top), text: `Last time ${clockText(setSeconds(top))}${parts ? ` at ${parts}` : ""}. Try +1% or +2 min` };
  }
  if (track === "timed") {
    const longest = Math.max(...sets.map(setSeconds));
    return { kind: "timed", seconds: longest, text: `Beat ${clockText(longest)}` };
  }
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
  if (hint?.kind === "up" && type !== "warmup") return { weight: hint.weight, reps: hint.reps, incline: null, speed: null, seconds: null, prev };
  const value = (field) => (prev && prev[field] != null ? Number(prev[field]) : null);
  // Strength rows always had both numbers; a missing weight meant bodyweight.
  const strength = prev && prev.seconds == null;
  return {
    weight: strength ? Number(prev.weight) || 0 : value("weight"),
    reps: strength ? Number(prev.reps) || 0 : value("reps"),
    incline: value("incline"),
    speed: value("speed"),
    seconds: value("seconds"),
    prev
  };
}

const clockText = (seconds) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Up, flat or down: the average best e1RM of the last three sessions against
// the three before them.
export function trend(history) {
  if (history.length < 2) return "new";
  const values = history.map((point) => point.score ?? (point.bestE1rm || point.totalReps));
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
      const exercise = exerciseIndex.get(entry.exerciseId);
      const muscle = exercise?.muscle || "other";
      if (muscle === "cardio" || trackOf(exercise) === "cardio") continue;
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
export function weekSummary(workouts, from, to = Infinity, exerciseIndex = null) {
  const list = finished(workouts).filter((w) => !w.rest && w.startedAt >= from && w.startedAt < to);
  return {
    count: list.length,
    sets: list.reduce((sum, w) => sum + workoutSetCount(w), 0),
    volume: list.reduce((sum, w) => sum + workoutVolume(w), 0),
    cardioMinutes: list.reduce((sum, w) => sum + cardioSeconds(w, exerciseIndex), 0) / 60
  };
}

// Seconds of completed cardio in a workout. Without an exercise index, any
// set with a speed or incline counts as cardio.
export function cardioSeconds(workout, exerciseIndex = null) {
  let total = 0;
  for (const entry of workout?.entries || []) {
    const exercise = exerciseIndex?.get(entry.exerciseId);
    for (const set of workingSets(entry)) {
      const cardio = exercise ? trackOf(exercise) === "cardio" : set.speed != null || set.incline != null;
      if (cardio) total += setSeconds(set);
    }
  }
  return total;
}

// The last finished session of the same split day before this one.
export function previousSession(workouts, workout) {
  if (!workout?.splitDayId) return null;
  return finished(workouts)
    .filter((w) => !w.rest && w.id !== workout.id && w.splitDayId === workout.splitDayId && w.startedAt < workout.startedAt)
    .sort(byNewest)[0] || null;
}

// ---------- nutrition ----------

export const MACROS = ["calories", "protein", "carbs", "fat", "fiber"];
export const GOALS = ["cut", "maintain", "leanBulk"];
const DAY_MS = 86_400_000;
const amount = (value) => Math.max(0, Number(value) || 0);

// The date key `days` days after (or before) another, safe across DST.
export function shiftDateKey(key, days) {
  const [y, m, d] = String(key).split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + days).getTime());
}

// The calendar date of a moment in a given time zone, e.g. on the server.
export function dateKeyIn(time = Date.now(), timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
  } catch {
    return dateKey(time);
  }
}

// Calories and macros added up over a list of meals.
export function dayTotals(meals) {
  const totals = { meals: 0, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const meal of live(meals)) {
    for (const key of MACROS) totals[key] += amount(meal[key]);
    totals.meals += 1;
  }
  return totals;
}

// Totals per date. A day with no meals is missing from the map: a gap in the
// log, not a day you ate nothing, so averages leave it out.
export function dailyIntake(meals) {
  const byDate = new Map();
  for (const meal of live(meals)) {
    if (!meal.date) continue;
    if (!byDate.has(meal.date)) byDate.set(meal.date, []);
    byDate.get(meal.date).push(meal);
  }
  return new Map([...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => [date, { date, ...dayTotals(list) }]));
}

// Smoothed bodyweight (7-day average) with dates, oldest first.
export function trendWeights(bodyweights) {
  return movingAverage(live(bodyweights).filter((entry) => Number(entry.weight) > 0), 7);
}

// Weigh-ins in [from, to] as a straight-line fit: the change per day and the
// fitted weight at the end. A fit ignores day-to-day water swings and, unlike
// an average, doesn't lag behind. Null until the weigh-ins span `minDays`.
export function weightSlope(bodyweights, from, to, minDays = 7) {
  const points = live(bodyweights)
    .filter((entry) => Number(entry.weight) > 0 && entry.date >= from && entry.date <= to)
    .map((entry) => ({ x: fromDateKey(entry.date) / DAY_MS, y: Number(entry.weight) }));
  if (points.length < 2) return null;
  const xs = points.map((p) => p.x);
  const first = Math.min(...xs);
  const last = Math.max(...xs);
  if (last - first < minDays - 0.5) return null;
  const mx = xs.reduce((sum, x) => sum + x, 0) / points.length;
  const my = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const slope = points.reduce((sum, p) => sum + (p.x - mx) * (p.y - my), 0) / points.reduce((sum, p) => sum + (p.x - mx) ** 2, 0);
  return { perDay: slope, weight: my + slope * (last - mx), start: my + slope * (first - mx), days: Math.round(last - first), count: points.length };
}

// Weekly weight change over the last `days` days, in your unit and as a
// percentage of bodyweight. Null until the weigh-ins span a week.
export function weightRate(bodyweights, { today = dateKey(), days = 21 } = {}) {
  const fit = weightSlope(bodyweights, shiftDateKey(today, -days), today, 7);
  if (!fit) return null;
  const perWeek = fit.perDay * 7;
  return { perWeek, percent: (perWeek / fit.start) * 100, weight: fit.weight, days: fit.days };
}

// Healthy weekly rate of change for each goal, as % of bodyweight.
export const RATE_BANDS = { cut: [-1, -0.5], maintain: [-0.25, 0.25], leanBulk: [0.25, 0.5] };

export function rateStatus(rate, goal = "maintain") {
  if (!rate) return null;
  const [low, high] = RATE_BANDS[goal] || RATE_BANDS.maintain;
  return rate.percent < low ? "below" : rate.percent > high ? "above" : "in";
}

// What you actually burn, worked out from what you ate and how your weight
// moved: average intake minus the energy that went into (or came out of)
// bodyweight. Needs 10 logged days and 10 days' span of weigh-ins;
// before that it falls back to a rough bodyweight multiple. Today is left
// out because it isn't over yet.
export function estimateMaintenance(meals, bodyweights, { unit = "lb", today = dateKey(), days = 28 } = {}) {
  const from = shiftDateKey(today, -days);
  const intake = [...dailyIntake(meals).values()].filter((day) => day.date >= from && day.date < today);
  const loggedDays = intake.length;
  const avgIntake = loggedDays ? intake.reduce((sum, day) => sum + day.calories, 0) / loggedDays : null;
  const trend = trendWeights(bodyweights);
  const latest = trend.length ? trend[trend.length - 1].value : null;
  const base = { avgIntake, loggedDays, days };
  const fit = loggedDays >= 10 ? weightSlope(bodyweights, from, today, 10) : null;
  if (fit) {
    const calories = Math.round(Math.min(6000, Math.max(1200, avgIntake - fit.perDay * (unit === "kg" ? 7700 : 3500))) / 10) * 10;
    const confidence = loggedDays >= 21 && fit.count >= 10 ? "high" : "medium";
    return { ...base, calories, method: "adaptive", confidence, weightPerWeek: fit.perDay * 7 };
  }
  if (latest) return { ...base, calories: Math.round((latest * (unit === "kg" ? 33 : 15)) / 10) * 10, method: "bodyweight", confidence: "rough", weightPerWeek: null };
  return { ...base, calories: null, method: "none", confidence: "none", weightPerWeek: null };
}

// Daily targets from your goal and maintenance. A target set by hand wins.
// Protein is 1 g per lb (2.2 g/kg), fat a quarter of calories, carbs the rest.
export function nutritionTargets(settings = {}, maintenance = null, bodyweight = null) {
  const goal = GOALS.includes(settings.goal) ? settings.goal : "maintain";
  const base = Number(maintenance) || 0;
  const auto = base ? Math.round((goal === "cut" ? base * 0.8 : goal === "leanBulk" ? base + 250 : base) / 10) * 10 : null;
  const calories = Number(settings.calorieTarget) || auto;
  const protein = Number(settings.proteinTarget) || (bodyweight ? Math.round(bodyweight * (settings.unit === "kg" ? 2.2 : 1)) : null);
  const fat = calories ? Math.round((calories * 0.25) / 9) : null;
  const carbs = calories ? Math.max(0, Math.round((calories - (protein || 0) * 4 - (fat || 0) * 9) / 4)) : null;
  return { goal, calories, protein, carbs, fat, autoCalories: !Number(settings.calorieTarget), autoProtein: !Number(settings.proteinTarget) };
}

// Maintenance, targets and weight rate together, the way both the app and
// the server (for ChatGPT) use them.
export function energyPlan(meals, bodyweights, settings = {}, today = dateKey()) {
  const unit = settings.unit === "kg" ? "kg" : "lb";
  const maintenance = estimateMaintenance(meals, bodyweights, { unit, today });
  const trend = trendWeights(bodyweights);
  const targets = nutritionTargets({ ...settings, unit }, maintenance.calories, trend.length ? trend[trend.length - 1].value : null);
  const rate = weightRate(bodyweights, { today });
  return { maintenance, targets, rate, rateStatus: rateStatus(rate, targets.goal) };
}

// ---------- strength momentum ----------

const round1 = (n) => Math.round(n * 10) / 10;

// Your most-trained lifts over the last `weeks` weeks: best e1RM now, how
// much it moved (total and per week), and how many sessions since it last
// beat its best. Strength exercises with weight only.
export function liftProgress(workouts, exerciseIndex = null, { now = Date.now(), weeks = 8, limit = 6 } = {}) {
  const from = now - weeks * 7 * DAY_MS;
  const counts = new Map();
  for (const workout of finished(workouts)) {
    if (workout.rest || workout.startedAt < from || workout.startedAt > now) continue;
    for (const entry of workout.entries || []) {
      if (trackOf(exerciseIndex?.get(entry.exerciseId)) !== "strength") continue;
      if (workingSets(entry).some((set) => (Number(set.weight) || 0) > 0)) counts.set(entry.exerciseId, (counts.get(entry.exerciseId) || 0) + 1);
    }
  }
  const rows = [];
  for (const [exerciseId, sessions] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const history = exerciseHistory(workouts, exerciseId, { before: now + 1 }).filter((point) => point.bestE1rm > 0);
    const recent = history.filter((point) => point.date >= from);
    if (!recent.length) continue;
    let best = 0;
    let since = 0;
    for (const point of history) {
      if (point.bestE1rm > best + 0.01) {
        best = point.bestE1rm;
        since = 0;
      } else since += 1;
    }
    const first = recent[0];
    const last = recent[recent.length - 1];
    const change = ((last.bestE1rm - first.bestE1rm) / first.bestE1rm) * 100;
    const spanWeeks = Math.max(1, (last.date - first.date) / (7 * DAY_MS));
    rows.push({ exerciseId, name: exerciseIndex?.get(exerciseId)?.name || exerciseId, sessions, e1rm: round1(last.bestE1rm), changePct: round1(change), perWeekPct: round1(change / spanWeeks), trend: trend(history), stalledFor: since, lastDate: last.date });
    if (rows.length >= limit) break;
  }
  return rows;
}

// ---------- coaching context ----------

// A compact picture of the last few weeks of eating and training: what the
// Coach rules read, what ChatGPT gets from the connector and what the weekly
// AI review is written from. `dayOf` turns a time into a date key (the
// server passes one in your time zone).
export function coachingContext({ workouts = [], meals = [], bodyweights = [], settings = {}, exerciseIndex = null, splitDays = [], now = Date.now(), dayOf = dateKey, weeks = 4 } = {}) {
  const today = dayOf(now);
  const plan = energyPlan(meals, bodyweights, settings, today);
  const intake = dailyIntake(meals);
  const sessionList = finished(workouts).filter((workout) => !workout.rest);
  const weekRows = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const to = shiftDateKey(today, -7 * i);
    const from = shiftDateKey(to, -6);
    const days = [...intake.values()].filter((day) => day.date >= from && day.date <= to);
    const done = sessionList.filter((workout) => {
      const key = dayOf(workout.startedAt);
      return key >= from && key <= to;
    });
    const weighIns = live(bodyweights).filter((entry) => entry.date >= from && entry.date <= to);
    const avg = (list, pick) => (list.length ? Math.round(list.reduce((sum, item) => sum + pick(item), 0) / list.length) : null);
    weekRows.push({
      from,
      to,
      loggedDays: days.length,
      avgCalories: avg(days, (day) => day.calories),
      avgProtein: avg(days, (day) => day.protein),
      proteinDays: plan.targets.protein ? days.filter((day) => day.protein >= plan.targets.protein * 0.9).length : null,
      sessions: done.length,
      sets: done.reduce((sum, workout) => sum + workoutSetCount(workout), 0),
      volume: Math.round(done.reduce((sum, workout) => sum + workoutVolume(workout), 0)),
      weight: weighIns.length ? round1(weighIns.reduce((sum, entry) => sum + Number(entry.weight), 0) / weighIns.length) : null
    });
  }
  const next = nextSplitDay(splitDays, workouts);
  return {
    today,
    unit: settings.unit === "kg" ? "kg" : "lb",
    goal: plan.targets.goal,
    targets: { calories: plan.targets.calories, protein: plan.targets.protein, carbs: plan.targets.carbs, fat: plan.targets.fat },
    maintenance: { calories: plan.maintenance.calories, method: plan.maintenance.method, confidence: plan.maintenance.confidence, loggedDays: plan.maintenance.loggedDays },
    weightRate: plan.rate ? { perWeek: Math.round(plan.rate.perWeek * 100) / 100, percentPerWeek: Math.round(plan.rate.percent * 100) / 100, status: plan.rateStatus } : null,
    todayIntake: (({ meals: count, calories, protein, carbs, fat }) => ({ meals: count, calories, protein, carbs, fat }))(intake.get(today) || dayTotals([])),
    weeks: weekRows,
    lifts: liftProgress(workouts, exerciseIndex, { now }).map(({ lastDate, exerciseId, ...row }) => ({ ...row, lastDone: dayOf(lastDate) })),
    nextWorkout: next?.day ? (next.day.rest ? "Rest day" : next.day.name) : null
  };
}

// ---------- coach ----------

const mean = (list) => list.reduce((sum, n) => sum + n, 0) / list.length;
const signedPct = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n * 100) / 100)}%`;
const kcalText = (n) => Math.round(n).toLocaleString("en-US");
const roundTo = (n, step) => Math.round(n / step) * step;
const TONE_RANK = { warn: 3, info: 2, good: 1 };
const GOAL_NAME = { cut: "cut", maintain: "maintenance", leanBulk: "lean bulk" };
const RATE_TITLES = {
  leanBulk: { below: "Gaining too slowly for a lean bulk", above: "Gaining faster than a lean bulk needs" },
  cut: { below: "Losing faster than a cut should", above: "Losing too slowly for your cut" },
  maintain: { below: "Weight is drifting down", above: "Weight is drifting up" }
};

// Whether a day's eating hit the goal: calories in the goal's window and
// protein within 10% of target.
function onTarget(day, targets) {
  if (!targets.calories) return false;
  const ratio = day.calories / targets.calories;
  const calories = targets.goal === "leanBulk" ? ratio >= 0.95 && ratio <= 1.15 : targets.goal === "cut" ? ratio >= 0.8 && ratio <= 1.05 : ratio >= 0.9 && ratio <= 1.1;
  return calories && (!targets.protein || day.protein >= targets.protein * 0.9);
}

// The Coach: insight cards from your eating and training together. Each
// rule stays silent until it has enough data, and says what it's based on.
// Returns a "this week" headline and cards, most urgent first.
export function insights({ workouts = [], meals = [], bodyweights = [], settings = {}, exerciseIndex = null, now = Date.now(), dayOf = dateKey } = {}) {
  const today = dayOf(now);
  const unit = settings.unit === "kg" ? "kg" : "lb";
  const plan = energyPlan(meals, bodyweights, settings, today);
  const { targets, maintenance } = plan;
  const intake = dailyIntake(meals);
  const sessions = finished(workouts).filter((workout) => !workout.rest && workout.startedAt <= now);
  const before = (days) => Array.from({ length: days }, (_, i) => shiftDateKey(today, -i - 1));
  const logged = (days) => before(days).map((date) => intake.get(date)).filter(Boolean);
  const lifts = liftProgress(workouts, exerciseIndex, { now });
  const histories = new Map(lifts.map((lift) => [lift.exerciseId, exerciseHistory(workouts, lift.exerciseId, { before: now + 1 }).filter((point) => point.bestE1rm > 0)]));
  const cards = [];

  // 1. Strength in weeks you ate enough vs. weeks you didn't.
  if (maintenance.method === "adaptive") {
    const weeks = [];
    for (let i = 0; i < 8; i += 1) {
      const to = shiftDateKey(today, -7 * i);
      const from = shiftDateKey(to, -6);
      const days = [...intake.values()].filter((day) => day.date >= from && day.date <= to);
      if (days.length < 4) continue;
      const changes = [];
      for (const history of histories.values()) {
        for (let k = 1; k < history.length; k += 1) {
          const key = dayOf(history[k].date);
          if (key >= from && key <= to) changes.push(((history[k].bestE1rm - history[k - 1].bestE1rm) / history[k - 1].bestE1rm) * 100);
        }
      }
      if (changes.length < 2) continue;
      const avg = mean(days.map((day) => day.calories));
      weeks.push({ fed: avg >= maintenance.calories - 100, under: avg < maintenance.calories - 250, change: mean(changes) });
    }
    const fed = weeks.filter((week) => week.fed);
    const under = weeks.filter((week) => week.under);
    if (fed.length >= 2 && under.length >= 2) {
      const a = mean(fed.map((week) => week.change));
      const b = mean(under.map((week) => week.change));
      if (a - b >= 0.5) {
        cards.push({
          id: "fuel-strength",
          tone: "info",
          title: "Your lifts climb when you eat enough",
          body: `Your main lifts' estimated 1RM moved ${signedPct(a)} per session in weeks at or above maintenance, and ${signedPct(b)} in weeks under it.`,
          evidence: `${fed.length} weeks at maintenance or above, ${under.length} under`,
          action: targets.goal === "cut" ? "Keep training days closest to maintenance and take the deficit on rest days." : "Keep your weekly average at or above maintenance while you push for strength."
        });
      }
    }
  }

  // 2. Stalled lifts, and the likeliest reason.
  const stalled = lifts.filter((lift) => lift.stalledFor >= 3);
  if (stalled.length) {
    const recent = logged(14);
    const avgCalories = recent.length >= 5 ? mean(recent.map((day) => day.calories)) : null;
    const avgProtein = recent.length >= 5 ? mean(recent.map((day) => day.protein)) : null;
    let why;
    let action;
    if (avgCalories !== null && targets.calories && avgCalories < targets.calories - 150) {
      why = `Over the last two weeks you've averaged ${kcalText(avgCalories)} kcal against a ${kcalText(targets.calories)} target.`;
      action = `Eat about ${kcalText(Math.max(100, roundTo(Math.min(400, targets.calories - avgCalories), 50)))} kcal more on training days, mostly carbs before you lift.`;
    } else if (avgProtein !== null && targets.protein && avgProtein < targets.protein * 0.85) {
      why = `Protein has averaged ${Math.round(avgProtein)} g against ${targets.protein} g.`;
      action = `Get protein to ${targets.protein} g a day before changing the program.`;
    } else {
      why = avgCalories !== null ? "You're eating enough, so fatigue is the likelier cause." : "There isn't enough food logged to tell whether eating is the cause.";
      action = "Take a deload week at about 90% of your working weights, or switch rep range (e.g. 8–12 → 5–8) for a few weeks.";
    }
    cards.push({
      id: "stall",
      tone: "warn",
      title: stalled.length === 1 ? `${stalled[0].name} has stalled` : `${stalled.length} lifts have stalled`,
      body: `No new best estimated 1RM: ${stalled.slice(0, 3).map((lift) => `${lift.name} (${lift.stalledFor} sessions)`).join(", ")}. ${why}`,
      action
    });
  }

  // 3. PRs after a pre-workout meal vs. without one.
  const prSessions = new Set();
  for (const history of histories.values()) {
    let best = 0;
    history.forEach((point, k) => {
      if (k > 0 && point.bestE1rm > best + 0.01) prSessions.add(point.workoutId);
      best = Math.max(best, point.bestE1rm);
    });
  }
  const timed = live(meals).filter((meal) => meal.eatenAt);
  const fueledRuns = { yes: [], no: [] };
  for (const workout of sessions.filter((w) => w.startedAt >= now - 56 * DAY_MS)) {
    if (!intake.has(dayOf(workout.startedAt))) continue;
    const carbs = timed.filter((meal) => meal.eatenAt < workout.startedAt && meal.eatenAt >= workout.startedAt - 4 * 3_600_000).reduce((sum, meal) => sum + (Number(meal.carbs) || 0), 0);
    fueledRuns[carbs >= 40 ? "yes" : "no"].push(prSessions.has(workout.id));
  }
  if (fueledRuns.yes.length >= 3 && fueledRuns.no.length >= 3) {
    const rate = (list) => list.filter(Boolean).length / list.length;
    const a = rate(fueledRuns.yes);
    const b = rate(fueledRuns.no);
    if (a - b >= 0.2) {
      cards.push({
        id: "pre-workout",
        tone: "info",
        title: "You PR more after a pre-workout meal",
        body: `${Math.round(a * 100)}% of sessions with 40 g+ carbs in the 4 hours before hit a PR, vs ${Math.round(b * 100)}% without.`,
        evidence: `${fueledRuns.yes.length + fueledRuns.no.length} logged sessions`,
        action: "Eat a carb-heavy meal 1–3 hours before you lift."
      });
    }
  }

  // 4. Weight rate against the goal's range.
  if (plan.rate) {
    const [low, high] = RATE_BANDS[targets.goal];
    const moving = `Your trend weight is moving ${plan.rate.perWeek >= 0 ? "+" : "−"}${Math.abs(Math.round(plan.rate.perWeek * 100) / 100)} ${unit}/week (${signedPct(plan.rate.percent)})`;
    if (plan.rateStatus === "in") {
      cards.push({ id: "rate", tone: "good", title: `Right on pace for your ${GOAL_NAME[targets.goal]}`, body: `${moving}, inside the ${signedPct(low)} to ${signedPct(high)} range.` });
    } else {
      const goalPerWeek = (plan.rate.weight * ((low + high) / 2)) / 100;
      const perDay = ((goalPerWeek - plan.rate.perWeek) * (unit === "kg" ? 7700 : 3500)) / 7;
      const change = roundTo(perDay, 50) || (perDay > 0 ? 50 : -50);
      cards.push({
        id: "rate",
        tone: "warn",
        title: RATE_TITLES[targets.goal][plan.rateStatus],
        body: `${moving}. A ${GOAL_NAME[targets.goal]} aims for ${signedPct(low)} to ${signedPct(high)} a week.`,
        evidence: `${plan.rate.days} days of weigh-ins`,
        action: `${change > 0 ? "Add" : "Cut"} about ${kcalText(Math.abs(change))} kcal a day${targets.autoCalories ? "; your automatic target adjusts as the trend moves" : ""}.`
      });
    }
  }

  // 5. Protein consistency over the last week.
  const week = logged(7);
  if (targets.protein && week.length >= 4) {
    const misses = week.filter((day) => day.protein < targets.protein * 0.9);
    const hits = week.length - misses.length;
    if (hits / week.length < 0.7) {
      const short = Math.round(mean(misses.map((day) => targets.protein - day.protein)));
      cards.push({ id: "protein", tone: "warn", title: `Protein hit ${hits} of ${week.length} days`, body: `On the days you missed you were about ${short} g short of ${targets.protein} g.`, action: short <= 45 ? "A shake or 250 g of Greek yogurt closes that gap." : "Add a palm-sized portion of protein to two meals." });
    } else if (hits / week.length >= 0.85 && week.length >= 5) {
      cards.push({ id: "protein", tone: "good", title: "Protein is locked in", body: `You hit ${targets.protein} g on ${hits} of ${week.length} logged days this week.` });
    }
  }

  // 6. Eating less on training days than rest days.
  const trainingDays = new Set(sessions.map((workout) => dayOf(workout.startedAt)));
  const month = logged(28);
  const onTraining = month.filter((day) => trainingDays.has(day.date));
  const onRest = month.filter((day) => !trainingDays.has(day.date));
  if (onTraining.length >= 4 && onRest.length >= 4) {
    const a = mean(onTraining.map((day) => day.calories));
    const b = mean(onRest.map((day) => day.calories));
    if (a < b - 150) {
      cards.push({ id: "training-days", tone: "info", title: "You eat less on lifting days", body: `${kcalText(a)} kcal on training days vs ${kcalText(b)} on rest days over the last four weeks.`, action: "Move about 200 kcal of carbs from rest days to training days, around your session." });
    }
  }

  // 7. Unlogged days, which make every estimate less sure.
  if (intake.size) {
    const first = [...intake.keys()][0];
    const missing = before(7).filter((date) => date >= first && !intake.has(date)).length;
    if (missing >= 2) {
      cards.push({ id: "gaps", tone: "info", title: `${missing} days unlogged this week`, body: "Unlogged days are left out of averages, so maintenance and these insights get less sure.", action: "Ask ChatGPT to log what you remember, even roughly." });
    }
  }

  // The week at a glance.
  const weekStart = shiftDateKey(today, -6);
  const sessionsThisWeek = sessions.filter((workout) => dayOf(workout.startedAt) >= weekStart).length;
  const daysThisWeek = [...intake.values()].filter((day) => day.date >= weekStart && day.date < today);
  const fueled = daysThisWeek.filter((day) => onTarget(day, targets)).length;
  const headline = sessionsThisWeek || daysThisWeek.length
    ? {
        id: "week",
        tone: daysThisWeek.length && fueled / daysThisWeek.length >= 0.7 ? "good" : "info",
        title: `This week: ${sessionsThisWeek} ${sessionsThisWeek === 1 ? "session" : "sessions"}${daysThisWeek.length ? `, on target ${fueled} of ${daysThisWeek.length} days` : ""}`,
        body: daysThisWeek.length ? `On target means ${GOAL_NAME[targets.goal]} calories and ${targets.protein ?? "—"} g protein.` : "Log meals to see how your eating lines up with training."
      }
    : null;

  return { headline, cards: cards.map((card, index) => ({ card, index })).sort((x, y) => TONE_RANK[y.card.tone] - TONE_RANK[x.card.tone] || x.index - y.index).map((x) => x.card) };
}
