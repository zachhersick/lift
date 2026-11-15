// The split analyzer: deterministic suggestions with an `edit` that
// applySplitEdit() applies. Each rule names its source.

import { liftProgress } from "./coach.js";
import { finished, mean, orderedDays, suggestion, trackOf, workingSets } from "./core.js";
import { GO_TO, MAIN_MUSCLES, VOLUME_RANGE, groupOf, isCompound, isPull, isPush, lifting, secondaryGroups, splitWeeklySets } from "./volume.js";

// ---------- split analyzer ----------

// Most target sets the analyzer gives one exercise, and the most direct sets
// for one muscle in a session before more sets add little (Pelland et al.,
// 2024).
const MAX_EXERCISE_SETS = 5;
const SESSION_CAP = 10;
const GROUPS = { chest: "push", shoulders: "push", triceps: "push", back: "pull", biceps: "pull", quads: "legs", hamstrings: "legs", glutes: "legs", calves: "legs" };
const setsOf = (item) => Math.max(1, Number(item.targetSets) || 3);
const upperFirst = (text) => text.replace(/^./, (c) => c.toUpperCase());
const halves = (n) => `${Math.round(n * 2) / 2}`;
// "Triceps get", "chest gets": muscle names ending in s read as plural.
const verb = (muscle, one, many) => `${upperFirst(muscle)} ${/s$/.test(muscle) ? many : one}`;
// What to add for a muscle with no exercise to build on: the lengthened
// choices below where there's one.
const ADD_PICK = { ...GO_TO, triceps: "Overhead Cable Extension", hamstrings: "Seated Leg Curl" };

// Swaps toward exercises that load a muscle at long lengths, where the
// head-to-head trials found more growth.
const LENGTHENED = [
  {
    muscle: "triceps",
    weak: /pushdown|kickback/i,
    strong: /overhead/i,
    to: (exercise) => (exercise.equipment === "cable" ? "Overhead Cable Extension" : "Overhead Dumbbell Extension"),
    why: "Overhead extensions stretch the triceps' long head and grew the triceps about 40% more than pushdowns.",
    source: "Maeo et al., 2023"
  },
  {
    muscle: "hamstrings",
    weak: /lying leg curl/i,
    strong: /seated leg curl/i,
    to: () => "Seated Leg Curl",
    why: "Seated curls train the hamstrings at longer lengths and grew them more than lying curls.",
    source: "Maeo et al., 2021"
  },
  {
    muscle: "calves",
    weak: /seated calf/i,
    strong: /standing calf|leg press calf/i,
    to: () => "Standing Calf Raise",
    why: "Straight-knee raises train the gastrocnemius, the bigger calf muscle, which barely grew from seated raises.",
    source: "Kinoshita et al., 2023"
  }
];

// What a split gives each muscle: weekly sets (assisted muscles count half),
// direct and total sets per session, how many times a week each muscle is
// trained, and pushing vs pulling sets.
function measureSplit(plan, exerciseIndex) {
  const scale = plan.length ? 7 / plan.length : 0;
  const perDay = new Map();
  const days = new Map();
  let push = 0;
  let pull = 0;
  for (const day of plan) {
    if (day.rest) continue;
    const load = new Map();
    const add = (muscle, direct, total) => {
      const row = load.get(muscle) || { direct: 0, total: 0 };
      row.direct += direct;
      row.total += total;
      load.set(muscle, row);
    };
    for (const item of day.exercises) {
      const exercise = exerciseIndex.get(item.exerciseId);
      if (!lifting(exercise)) continue;
      const sets = setsOf(item);
      add(groupOf(exercise), sets, sets);
      for (const other of secondaryGroups(exercise)) add(other, 0, sets / 2);
      if (isPull(exercise)) pull += sets * scale;
      else if (isPush(exercise)) push += sets * scale;
    }
    perDay.set(day.id, load);
    for (const [muscle, row] of load) if (row.direct >= 2 || row.total >= 3) days.set(muscle, (days.get(muscle) || 0) + 1);
  }
  return { scale, weekly: splitWeeklySets(plan, exerciseIndex), perDay, push, pull, frequency: (muscle) => (days.get(muscle) || 0) * scale };
}

// 0–100: volume in the 10–20 set range (half the score), training each
// muscle about twice a week, pulling about as much as pushing, and rest and
// rep ranges inside what the research supports.
function scoreSplit(m, plan, muscles, exerciseIndex) {
  const [low, high] = VOLUME_RANGE;
  const volume = mean(muscles.map((muscle) => {
    const sets = m.weekly.get(muscle) || 0;
    return sets < low ? sets / low : sets > high ? Math.max(0, 1 - (sets - high) / 10) : 1;
  }));
  const often = mean(muscles.map((muscle) => Math.min(1, m.frequency(muscle) / 1.5)));
  const balance = m.push < 10 ? 1 : Math.min(1, m.pull / (m.push * 0.7));
  const items = plan.filter((day) => !day.rest).flatMap((day) => day.exercises).filter((item) => trackOf(exerciseIndex.get(item.exerciseId)) === "strength");
  const sound = items.length ? mean(items.map((item) => (restTooShort(item, exerciseIndex.get(item.exerciseId)) || repsOutside(item) ? 0 : 1))) : 1;
  return Math.round(volume * 50 + often * 20 + balance * 15 + sound * 15);
}
const restTooShort = (item, exercise) => isCompound(exercise) && Number(item.restSec) > 0 && item.restSec < 90;
const repsOutside = (item) => (item.repMax && item.repMax < 5) || (item.repMin && item.repMin > 30);

// The split analyzer: checks a split against the evidence on weekly volume,
// sets per session, frequency, push/pull balance, exercise selection, rest
// and rep ranges, plus lifts that have stalled in your logs, and works out
// the smallest edits that fix what it finds. It edits a copy one set at a
// time and re-measures after each, so the edits build on each other. Each
// suggestion is one exercise's net change with the reasons behind it, ready
// to apply with applySplitEdit.
export function analyzeSplit({ splitDays = [], exerciseIndex = new Map(), workouts = [], now = Date.now() } = {}) {
  let key = 0;
  const original = orderedDays(splitDays);
  const plan = original.map((day) => ({ ...day, exercises: (day.exercises || []).map((item, at) => ({ ...item, _k: key++, _at: at })) }));
  const training = plan.filter((day) => !day.rest);
  const present = new Set(training.flatMap((day) => day.exercises).map((item) => groupOf(exerciseIndex.get(item.exerciseId))));
  const muscles = [...MAIN_MUSCLES, ...(present.has("calves") ? ["calves"] : [])];
  const before = measureSplit(plan, exerciseIndex);
  const nameOf = (id) => exerciseIndex.get(id)?.name || "Exercise";
  const byName = (name) => [...exerciseIndex.values()].find((exercise) => exercise.name === name && !exercise.deleted) || null;
  const direct = (m, day, muscle) => m.perDay.get(day.id)?.get(muscle)?.direct || 0;
  const note = (item, priority, why, source) => {
    item._why = item._why || [];
    if (!item._why.some((reason) => reason.why === why)) item._why.push({ why, source });
    item._p = Math.min(item._p ?? priority, priority);
  };

  // Exercises you've logged most, for picking what to add.
  const logged = new Map();
  for (const workout of finished(workouts)) for (const entry of workout.entries || []) if (workingSets(entry).length) logged.set(entry.exerciseId, (logged.get(entry.exerciseId) || 0) + 1);
  const pickExercise = (muscle, day, fits) => {
    const taken = new Set(day.exercises.map((item) => item.exerciseId));
    const ok = (exercise) => exercise && !exercise.deleted && groupOf(exercise) === muscle && trackOf(exercise) === "strength" && !taken.has(exercise.id) && fits(exercise);
    const mine = [...logged.entries()].filter(([id]) => ok(exerciseIndex.get(id))).sort((a, b) => b[1] - a[1])[0];
    if (mine) return exerciseIndex.get(mine[0]);
    const go = byName(ADD_PICK[muscle]);
    return ok(go) ? go : [...exerciseIndex.values()].find(ok) || null;
  };
  const newItem = (exercise, sets) => {
    const compound = isCompound(exercise);
    return { exerciseId: exercise.id, targetSets: sets, repMin: compound ? 6 : 10, repMax: compound ? 10 : 15, restSec: compound ? 150 : 90, _k: key++, _at: null };
  };
  // How many of a day's exercises train a muscle's neighbours or assist it
  // (deadlifts for hamstrings).
  const related = (day, muscle) =>
    day.exercises.filter((item) => {
      const exercise = exerciseIndex.get(item.exerciseId);
      return GROUPS[groupOf(exercise)] === GROUPS[muscle] || secondaryGroups(exercise).includes(muscle);
    }).length;
  // The best day to add a muscle's work to, with room left: one that trains
  // related muscles, preferably not this one yet (a second weekly session).
  // `spread` puts a second session first, related or not.
  const pickDay = (muscle, m, avoid = null, spread = false) => {
    const has = (day) => Number(direct(m, day, muscle) > 0);
    const near = (day) => Number(related(day, muscle) > 0);
    return (
      training
        .filter((day) => day !== avoid && day.exercises.length < 9 && direct(m, day, muscle) < SESSION_CAP)
        .sort((a, b) => (spread ? has(a) - has(b) : 0) || near(b) - near(a) || has(a) - has(b) || related(b, muscle) - related(a, muscle) || a.exercises.length - b.exercises.length)[0] || null
    );
  };
  // One more set for a muscle: on an exercise you already do, on the day
  // where it has the fewest sets, or else a new exercise on the best day.
  // A muscle trained about once a week gets a new exercise on a second day
  // first.
  const addVolume = ({ muscle, m, priority, why, source, fits = () => true, avoid = null, sets = null }) => {
    const deficitSets = () => sets ?? Math.min(4, Math.max(2, Math.ceil((VOLUME_RANGE[0] - (m.weekly.get(muscle) || 0)) / m.scale)));
    const second = m.frequency(muscle) > 0 && m.frequency(muscle) < 1.5 ? pickDay(muscle, m, avoid, true) : null;
    const fresh = second && !direct(m, second, muscle) && pickExercise(muscle, second, fits);
    if (fresh) {
      const item = newItem(fresh, deficitSets());
      note(item, priority, why, source);
      second.exercises.push(item);
      return true;
    }
    const options = [];
    for (const day of training) {
      if (day === avoid || direct(m, day, muscle) >= SESSION_CAP) continue;
      for (const item of day.exercises) {
        const exercise = exerciseIndex.get(item.exerciseId);
        if (lifting(exercise) && groupOf(exercise) === muscle && trackOf(exercise) === "strength" && fits(exercise) && setsOf(item) < MAX_EXERCISE_SETS) options.push({ day, item });
      }
    }
    options.sort((a, b) => direct(m, a.day, muscle) - direct(m, b.day, muscle) || setsOf(a.item) - setsOf(b.item));
    if (options.length) {
      const { item } = options[0];
      item.targetSets = setsOf(item) + 1;
      note(item, priority, why, source);
      return true;
    }
    const day = pickDay(muscle, m, avoid);
    const exercise = day && pickExercise(muscle, day, fits);
    if (!exercise) return false;
    const item = newItem(exercise, deficitSets());
    note(item, priority, why, source);
    day.exercises.push(item);
    return true;
  };
  // Sets moved onto a day: added to the muscle's exercises there, then as a
  // new exercise for what's left.
  const place = (muscle, day, count, priority, why, source) => {
    let left = count;
    for (const item of day.exercises) {
      const exercise = exerciseIndex.get(item.exerciseId);
      if (groupOf(exercise) !== muscle || trackOf(exercise) !== "strength") continue;
      while (left > 0 && setsOf(item) < MAX_EXERCISE_SETS) {
        item.targetSets = setsOf(item) + 1;
        left -= 1;
        note(item, priority, why, source);
      }
    }
    const exercise = left > 0 && pickExercise(muscle, day, () => true);
    if (!exercise) return;
    const item = newItem(exercise, Math.min(MAX_EXERCISE_SETS, Math.max(2, left)));
    note(item, priority, why, source);
    day.exercises.push(item);
  };
  // One set fewer, from the isolation exercise with the most sets first.
  const removeSet = (day, muscle, priority, why, source) => {
    const item = day.exercises
      .filter((candidate) => groupOf(exerciseIndex.get(candidate.exerciseId)) === muscle && setsOf(candidate) > 2)
      .sort((a, b) => Number(isCompound(exerciseIndex.get(a.exerciseId))) - Number(isCompound(exerciseIndex.get(b.exerciseId))) || setsOf(b) - setsOf(a))[0];
    if (!item) return false;
    item.targetSets = setsOf(item) - 1;
    note(item, priority, why, source);
    return true;
  };

  // 1. Well over 20 sets a week: trim back to 20.
  for (const muscle of MAIN_MUSCLES) {
    const start = before.weekly.get(muscle) || 0;
    if (start <= 22) continue;
    const why = `${verb(muscle, "gets", "get")} about ${halves(start)} sets a week. Past about 20, each extra set adds little growth while fatigue keeps adding up.`;
    for (let guard = 0; guard < 30; guard += 1) {
      const m = measureSplit(plan, exerciseIndex);
      if ((m.weekly.get(muscle) || 0) <= VOLUME_RANGE[1]) break;
      const day = [...training].sort((a, b) => direct(m, b, muscle) - direct(m, a, muscle)).find((d) => d.exercises.some((item) => groupOf(exerciseIndex.get(item.exerciseId)) === muscle && setsOf(item) > 2));
      if (!day || !removeSet(day, muscle, 5, why, "Baz-Valle et al., 2022; Pelland et al., 2024")) break;
    }
  }

  // 2. More than about 10 direct sets for a muscle in one session: move the
  // extra to another day that trains related muscles, if there is one.
  for (const day of training) {
    for (const muscle of [...(before.perDay.get(day.id)?.keys() || [])]) {
      const start = direct(before, day, muscle);
      if (start <= SESSION_CAP) continue;
      const why = `${verb(muscle, "gets", "get")} ${start} direct sets on ${day.name}. Past about 10 in one session extra sets add little, so they do more on another day.`;
      const source = "Pelland et al., 2024 (sets per session)";
      const m = measureSplit(plan, exerciseIndex);
      const to = pickDay(muscle, m, day);
      if (!to || !related(to, muscle)) continue;
      let moved = 0;
      while (moved < direct(m, day, muscle) - SESSION_CAP && removeSet(day, muscle, 2, why, source)) moved += 1;
      if (moved) place(muscle, to, moved, 2, why, source);
    }
  }

  // 3. A muscle with real volume trained only once a week: move about a
  // third of its sets to a second day.
  for (const muscle of muscles) {
    const m = measureSplit(plan, exerciseIndex);
    if ((m.weekly.get(muscle) || 0) < 8 || m.frequency(muscle) >= 1.5 || training.length < 2) continue;
    const from = [...training].sort((a, b) => direct(m, b, muscle) - direct(m, a, muscle))[0];
    const count = Math.floor(direct(m, from, muscle) / 3);
    const to = pickDay(muscle, m, from);
    if (count < 2 || !to || direct(m, to, muscle) > 0) continue;
    const why = `${verb(muscle, "is", "are")} trained about once a week. Twice a week grows a muscle at least as well, and splitting the sets keeps them fresher.`;
    const source = "Schoenfeld et al., 2016; Schoenfeld et al., 2019";
    let moved = 0;
    while (moved < count && removeSet(from, muscle, 3, why, source)) moved += 1;
    if (moved) place(muscle, to, moved, 3, why, source);
  }

  // 4. Much more pushing than pulling: add rows, pulldowns or face pulls.
  if (before.push >= 10 && before.pull < before.push * 0.7) {
    const why = `About ${halves(before.push)} pushing sets a week against ${halves(before.pull)} pulling. Lifters who press far more than they pull tend toward weak upper backs and rear shoulders.`;
    const source = "Practical guideline; Kolber et al., 2009";
    for (let guard = 0; guard < 30; guard += 1) {
      const m = measureSplit(plan, exerciseIndex);
      if (m.pull >= m.push * 0.7) break;
      if (!addVolume({ muscle: "back", m, priority: 4, why, source, fits: isPull }) && !addVolume({ muscle: "shoulders", m, priority: 4, why, source, fits: isPull })) break;
    }
  }

  // 5. Muscles under 10 sets a week: add sets until they reach it.
  const lowWhy = (muscle) => `${verb(muscle, "gets", "get")} about ${halves(before.weekly.get(muscle) || 0)} sets a week. Growth is clearly better from about 10 hard sets a week, with most of the benefit by 20.`;
  for (let guard = 0; guard < 80; guard += 1) {
    const m = measureSplit(plan, exerciseIndex);
    const low = muscles.filter((muscle) => (m.weekly.get(muscle) || 0) < VOLUME_RANGE[0]).sort((a, b) => (m.weekly.get(a) || 0) - (m.weekly.get(b) || 0));
    if (!low.some((muscle) => addVolume({ muscle, m, priority: 1, why: lowWhy(muscle), source: "Schoenfeld et al., 2017; Baz-Valle et al., 2022; Pelland et al., 2024" }))) break;
  }

  // 6. Exercise selection: swap toward lengthened-position exercises.
  for (const rule of LENGTHENED) {
    const items = training.flatMap((day) => day.exercises.map((item) => ({ day, item, exercise: exerciseIndex.get(item.exerciseId) }))).filter(({ exercise }) => groupOf(exercise) === rule.muscle);
    if (!items.length || items.some(({ exercise }) => rule.strong.test(exercise.name))) continue;
    const pick = items.filter(({ exercise }) => rule.weak.test(exercise.name)).sort((a, b) => setsOf(a.item) - setsOf(b.item))[0];
    const target = pick && byName(rule.to(pick.exercise));
    if (!target || pick.day.exercises.some((item) => item.exerciseId === target.id)) continue;
    pick.item.exerciseId = target.id;
    note(pick.item, 6, rule.why, rule.source);
  }

  // 7. Lifts that stalled in your logs: a new rep range.
  for (const lift of liftProgress(workouts, exerciseIndex, { now, limit: 30 }).filter((row) => row.stalledFor >= 3)) {
    const found = training.flatMap((day) => day.exercises).find((item) => item.exerciseId === lift.exerciseId && !item._why);
    if (!found) continue;
    const compound = isCompound(exerciseIndex.get(lift.exerciseId));
    const [repMin, repMax] = (found.repMax || 12) <= 8 ? [8, 12] : compound ? [5, 8] : [12, 20];
    if (found.repMin === repMin && found.repMax === repMax) continue;
    Object.assign(found, { repMin, repMax });
    note(found, 7, `${lift.name} hasn't beaten its best in ${lift.stalledFor} sessions. A new rep range is a fresh stimulus, and light and heavy loads build muscle alike when sets go near failure.`, "Kassiano et al., 2022; Schoenfeld et al., 2017; your logs");
  }

  // 8. Rest and rep ranges outside the evidence.
  for (const day of training) for (const item of day.exercises) {
    const exercise = exerciseIndex.get(item.exerciseId);
    if (trackOf(exercise) !== "strength") continue;
    if (restTooShort(item, exercise)) {
      item.restSec = 150;
      note(item, 8, "Longer rests on multi-joint lifts led to more strength and muscle growth in trained lifters.", "Schoenfeld et al., 2016 (rest intervals); Singer et al., 2024");
    }
    if (repsOutside(item)) {
      const compound = isCompound(exercise);
      item.repMin = item.repMax < 5 ? (compound ? 5 : 8) : compound ? 8 : 15;
      item.repMax = item.repMin === 5 ? 8 : item.repMin === 8 ? 12 : 25;
      note(item, 9, "Sets of about 5–30 reps build similar muscle when taken near failure; outside that range sets do less or are hard to judge.", "Schoenfeld et al., 2017; Lopez et al., 2021");
    }
  }

  // Each changed exercise's net edit, most important first.
  const strip = ({ _k, _at, _why, _p, ...item }) => item;
  const suggestions = [];
  plan.forEach((day, dayIndex) => {
    for (const item of day.exercises) {
      if (!item._why) continue;
      const reasons = { why: item._why.map((reason) => reason.why).join(" "), source: [...new Set(item._why.flatMap((reason) => reason.source.split("; ")))].join("; ") };
      const base = { dayId: day.id, dayName: day.name, priority: item._p, order: dayIndex * 100 + (item._at ?? 99), ...reasons };
      if (item._at === null) {
        suggestions.push({ ...base, id: `${day.id}:add:${item.exerciseId}`, kind: "add", exerciseId: item.exerciseId, name: nameOf(item.exerciseId), changes: [], item: strip(item), edit: { dayId: day.id, add: strip(item) } });
        continue;
      }
      const was = original[dayIndex].exercises[item._at];
      const changes = [];
      const fields = {};
      if (was.exerciseId !== item.exerciseId) changes.push({ field: "exercise", from: nameOf(was.exerciseId), to: nameOf(item.exerciseId) });
      if (setsOf(was) !== setsOf(item)) changes.push({ field: "sets", from: setsOf(was), to: setsOf(item) });
      if (was.repMin !== item.repMin || was.repMax !== item.repMax) changes.push({ field: "reps", from: [was.repMin, was.repMax], to: [item.repMin, item.repMax] });
      if (was.restSec !== item.restSec) changes.push({ field: "rest", from: was.restSec, to: item.restSec });
      for (const field of ["exerciseId", "targetSets", "repMin", "repMax", "restSec"]) if (was[field] !== item[field] && !(field === "targetSets" && setsOf(was) === setsOf(item))) fields[field] = item[field];
      if (!changes.length) continue;
      suggestions.push({ ...base, id: `${day.id}:${item._at}`, kind: was.exerciseId !== item.exerciseId ? "swap" : "change", exerciseId: was.exerciseId, name: nameOf(was.exerciseId), changes, item: strip(item), edit: { dayId: day.id, index: item._at, exerciseId: was.exerciseId, fields } });
    }
  });
  suggestions.sort((a, b) => a.priority - b.priority || a.order - b.order);

  const after = measureSplit(plan, exerciseIndex);
  const changed = new Set(suggestions.map((suggestion) => suggestion.dayId));
  return {
    ready: training.some((day) => day.exercises.length),
    days: original.length,
    exercises: original.filter((day) => !day.rest).reduce((sum, day) => sum + (day.exercises || []).length, 0),
    score: training.length ? { before: scoreSplit(before, plan.map((day, i) => ({ ...day, exercises: original[i].exercises || [] })), muscles, exerciseIndex), after: scoreSplit(after, plan, muscles, exerciseIndex) } : { before: 0, after: 0 },
    muscles: muscles.map((muscle) => ({ muscle, before: before.weekly.get(muscle) || 0, after: after.weekly.get(muscle) || 0, frequency: Math.round(after.frequency(muscle) * 10) / 10 })),
    suggestions: suggestions.map(({ order, ...suggestion }) => suggestion),
    plan: plan.filter((day) => changed.has(day.id)).map((day) => ({ id: day.id, exercises: day.exercises.map(strip) }))
  };
}

// A day's exercises with one suggestion applied: a new exercise appended
// (once), or one exercise's fields replaced if it's still where the analysis
// saw it. Returns null when the split has changed under the suggestion.
export function applySplitEdit(exercises = [], edit) {
  const list = exercises.map((item) => ({ ...item }));
  if (edit.add) return list.some((item) => item.exerciseId === edit.add.exerciseId) ? list : [...list, { ...edit.add }];
  if (list[edit.index]?.exerciseId !== edit.exerciseId) return null;
  list[edit.index] = { ...list[edit.index], ...edit.fields };
  return list;
}

