// Records, splits and rotation, tracking types, history, PRs, progression,
// dates and the newest-edit-wins merge. Everything else builds on this.

export function uid(prefix = "r") {
  const random = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16) : Math.random().toString(36).slice(2, 18);
  return `${prefix}_${random}`;
}

export const live = (records) => [...records].filter((record) => record && !record.deleted);

export function orderedDays(splitDays) {
  return live(splitDays).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.id).localeCompare(String(b.id)));
}

// ---------- splits ----------

// You can keep several splits and train through one, the current one
// (settings.currentSplit). A day belongs to the split in its `splitId`. Days
// without one, every day from before there were several splits, belong to the
// main split, which needs no record until it's renamed. Rotation position comes
// from the workouts logged against a split's own days, so each split keeps its
// place while another one is current.
export const MAIN_SPLIT = "split_main";
export const MAIN_SPLIT_NAME = "My split";
export const splitIdOf = (day) => day?.splitId || MAIN_SPLIT;

// Every split with its ordered `days`, oldest first, one marked `current`.
export function listSplits(splits = [], splitDays = [], settings = {}) {
  const days = live(splitDays);
  const daysOf = (id) => orderedDays(days.filter((day) => splitIdOf(day) === id));
  const list = live(splits).map((split) => ({ ...split, days: daysOf(split.id) }));
  const chosen = settings?.currentSplit;
  if (!list.some((split) => split.id === MAIN_SPLIT) && (daysOf(MAIN_SPLIT).length || !chosen || chosen === MAIN_SPLIT || !list.length)) {
    list.push({ id: MAIN_SPLIT, kind: "split", name: MAIN_SPLIT_NAME, days: daysOf(MAIN_SPLIT) });
  }
  list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
  const current = list.find((split) => split.id === chosen) || list[0];
  return list.map((split) => ({ ...split, current: split.id === current.id }));
}

export const findCurrentSplit = (splits, splitDays, settings) => listSplits(splits, splitDays, settings).find((split) => split.current);

// Whether a record was written by an AI assistant through the connector.
export const fromAssistant = (record) => record?.source === "chatgpt" || record?.source === "claude";

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

// Whether any logged workout has a completed set of this exercise. Once it
// does, the exercise's tracking type is fixed, since those sets were
// recorded with that type's fields.
export function exerciseInUse(workouts, exerciseId) {
  return live(workouts).some((workout) => (workout.entries || []).some((entry) => entry.exerciseId === exerciseId && entry.sets?.some((set) => set.done)));
}
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

export function topSetOf(sets) {
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


export function dateKey(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromDateKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

// Average of a non-empty list.
export const mean = (list) => list.reduce((sum, n) => sum + n, 0) / list.length;
