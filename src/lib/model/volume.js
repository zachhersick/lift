// Muscles and training volume: weekly sets per muscle group (secondary
// muscles count half), daily volume, streaks, rings and the bodyweight average.

import { byNewest, dateKey, finished, fromDateKey, orderedDays, setSeconds, startOfWeek, trackOf, workingSets, workoutSetCount, workoutVolume } from "./core.js";

// ---------- weekly volume, consistency, bodyweight ----------

// Working sets per muscle group for workouts since `from`. With `indirect`,
// each set also adds half a set to the groups the exercise assists (see
// secondaryGroups), the way the hypertrophy research counts volume.
export function muscleSets(workouts, exerciseIndex, from = 0, { indirect = false } = {}) {
  const counts = new Map();
  for (const workout of finished(workouts)) {
    if (workout.rest || (workout.startedAt || 0) < from) continue;
    for (const entry of workout.entries || []) {
      const exercise = exerciseIndex.get(entry.exerciseId);
      const muscle = groupOf(exercise) || "other";
      if (muscle === "cardio" || trackOf(exercise) === "cardio") continue;
      const sets = workingSets(entry).length;
      if (!sets) continue;
      counts.set(muscle, (counts.get(muscle) || 0) + sets);
      if (indirect) for (const other of secondaryGroups(exercise)) counts.set(other, (counts.get(other) || 0) + sets / 2);
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


// ---------- training volume ----------

// Specific muscles you can pick for an exercise, and the group each counts
// toward. Weekly volume, the Coach and the split analyzer work in groups, the
// level the volume research measures: lats and mid back are back, the delt
// heads are shoulders, and the hip abductors (glute medius and minimus) are
// glutes.
export const MUSCLE_GROUP = { lats: "back", "mid back": "back", traps: "back", "lower back": "back", "front delts": "shoulders", "side delts": "shoulders", "rear delts": "shoulders", abductors: "glutes" };
export const muscleGroup = (muscle) => MUSCLE_GROUP[muscle] || muscle;
export const groupOf = (exercise) => muscleGroup(exercise?.muscle);

// The groups an exercise's secondary muscles add half a set to: one share per
// group, and none for its own group (a row's lats don't double its back sets).
export function secondaryGroups(exercise) {
  const own = groupOf(exercise);
  return [...new Set(indirectMuscles(exercise).map(muscleGroup))].filter((group) => group !== own);
}

// Secondary muscles: what an exercise trains besides its primary one. Each
// set counts as half a set for these, the fractional counting that best fits
// the hypertrophy data (Pelland et al., 2024). An exercise's own `secondary`
// list (set when editing it) wins; otherwise they're inferred from the name.
const SECONDARY_SKIP = new Set(["cardio", "full body"]);
export function indirectMuscles(exercise) {
  if (Array.isArray(exercise?.secondary)) return [...new Set(exercise.secondary)].filter((muscle) => typeof muscle === "string" && muscle && muscle !== exercise.muscle && !SECONDARY_SKIP.has(muscle));
  return inferredSecondary(exercise);
}

// The secondary muscles a lift's name implies: presses work triceps and
// shoulders, rows and pulldowns biceps, squats and hinges glutes.
export function inferredSecondary(exercise) {
  const name = String(exercise?.name || "").toLowerCase();
  switch (groupOf(exercise)) {
    case "chest":
      return /press|push-up|pushup|dip/.test(name) ? ["triceps", "shoulders"] : [];
    case "shoulders":
      return /press/.test(name) ? ["triceps"] : [];
    case "back":
      if (/deadlift|rack pull|back extension/.test(name)) return ["hamstrings", "glutes"];
      return /row|pull-up|pullup|chin|pulldown/.test(name) && !/straight-arm/.test(name) ? ["biceps"] : [];
    case "triceps":
      return /close-grip|dip/.test(name) ? ["chest"] : [];
    case "quads":
      return /squat|lunge|leg press|step-up/.test(name) ? ["glutes"] : [];
    case "hamstrings":
      return /deadlift|good morning/.test(name) ? ["glutes"] : [];
    default:
      return [];
  }
}

// The muscles every program should cover, and the weekly hard-set range with
// the best evidence for growth: about 10 sets or more (Schoenfeld et al.,
// 2017), with most of the benefit reached by about 20 (Baz-Valle et al., 2022).
export const MAIN_MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes"];
export const VOLUME_RANGE = [10, 20];

// Sets a week each muscle gets from your rotating split: every day's target
// sets (plus half for assisted muscles), scaled from the rotation's length to
// a 7-day week.
export function splitWeeklySets(splitDays, exerciseIndex) {
  const days = orderedDays(splitDays);
  const out = new Map();
  if (!days.length) return out;
  const scale = 7 / days.length;
  for (const day of days) {
    if (day.rest) continue;
    for (const item of day.exercises || []) {
      const exercise = exerciseIndex?.get(item.exerciseId);
      if (!exercise || exercise.muscle === "cardio" || trackOf(exercise) === "cardio") continue;
      const sets = Math.max(1, Number(item.targetSets) || 3) * scale;
      const muscle = groupOf(exercise);
      out.set(muscle, (out.get(muscle) || 0) + sets);
      for (const other of secondaryGroups(exercise)) out.set(other, (out.get(other) || 0) + sets / 2);
    }
  }
  return out;
}

export const isPull = (exercise) =>
  (groupOf(exercise) === "back" && !["traps", "lower back"].includes(exercise.muscle) && !/deadlift|rack pull|back extension|shrug/i.test(exercise.name)) ||
  ["biceps", "rear delts"].includes(exercise?.muscle) ||
  /rear|face pull|reverse pec/i.test(exercise?.name || "");
export const isPush = (exercise) => ["chest", "triceps"].includes(exercise?.muscle) || (groupOf(exercise) === "shoulders" && !isPull(exercise));
export const isCompound = (exercise) => trackOf(exercise) === "strength" && (indirectMuscles(exercise).length > 0 || /squat|deadlift|press|row/i.test(exercise?.name || ""));

// Exercises to suggest when a muscle needs more sets.
export const GO_TO = { chest: "Incline Dumbbell Press", back: "Lat Pulldown", shoulders: "Dumbbell Lateral Raise", biceps: "Dumbbell Curl", triceps: "Rope Pushdown", quads: "Leg Press", hamstrings: "Lying Leg Curl", glutes: "Hip Thrust", calves: "Standing Calf Raise" };


// Whether an exercise is lifted rather than cardio.
export const lifting = (exercise) => Boolean(exercise) && exercise.muscle !== "cardio" && trackOf(exercise) !== "cardio";
