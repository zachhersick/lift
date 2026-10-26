import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyweightId, cardioSeconds, dailyVolume, dateKey, defaultWeeklyGoal, e1rm, FIELDS, isComplete, setDistance, trackOf, exerciseHistory, isPersonalRecord, movingAverage, muscleSets, nextInSuperset,
  nextSplitDay, personalRecords, placeholderFor, plateBreakdown, previousEntry, previousSession, restsAfter, roundLoadable,
  coachingContext, exerciseInUse, indirectMuscles, splitWeeklySets, dailyIntake, dateKeyIn, fromDateKey, insights, mealMicro, MICROS, microAverages, dayTotals, estimateMaintenance, nutritionTargets, rateStatus, shiftDateKey, weightRate,
  splitDiff, startOfWeek, suggestion, supersetLabels, trend, warmupSets, weekStreak, weekSummary, workoutFromDay, workoutVolume
} from "../src/lib/model.js";

const day = (id, position, extra = {}) => ({ id, kind: "splitDay", name: id, position, exercises: [], ...extra });
const set = (weight, reps, extra = {}) => ({ id: `${weight}-${reps}-${Math.random()}`, weight, reps, type: "working", done: true, ...extra });
const workout = (id, startedAt, splitDayId, entries = [], extra = {}) => ({ id, kind: "workout", splitDayId, startedAt, finishedAt: startedAt + 3_600_000, entries, ...extra });
const entry = (exerciseId, sets, extra = {}) => ({ id: `e-${exerciseId}-${Math.random()}`, exerciseId, sets, ...extra });

test("the rotation starts at day one and follows the last logged day", () => {
  const days = [day("push", 0), day("pull", 1), day("legs", 2), day("rest", 3, { rest: true })];
  assert.equal(nextSplitDay(days, []).day.id, "push");
  assert.equal(nextSplitDay(days, [workout("a", 1, "push")]).day.id, "pull");
  assert.equal(nextSplitDay(days, [workout("a", 1, "push"), workout("b", 2, "legs")]).day.id, "rest");
  assert.equal(nextSplitDay(days, [workout("a", 1, "rest", [], { rest: true })]).day.id, "push", "wraps around after rest");
  assert.equal(nextSplitDay([...days].reverse(), [workout("a", 5, "rest")]).day.id, "push", "order comes from position");
});

test("unfinished and deleted workouts don't move the rotation", () => {
  const days = [day("push", 0), day("pull", 1)];
  assert.equal(nextSplitDay(days, [{ ...workout("a", 1, "push"), finishedAt: null }]).day.id, "push");
  assert.equal(nextSplitDay(days, [{ ...workout("a", 1, "push"), deleted: true }]).day.id, "push");
  assert.equal(nextSplitDay([], []), null);
});

test("estimated 1RM uses Epley, and a single is the weight itself", () => {
  assert.equal(e1rm(200, 1), 200);
  assert.equal(Math.round(e1rm(185, 8)), 234);
  assert.equal(e1rm(0, 10), 0);
  assert.equal(e1rm(100, 0), 0);
});

test("volume counts completed working sets only", () => {
  const w = workout("a", 1, "push", [entry("bench", [set(100, 10), set(45, 10, { type: "warmup" }), set(100, 8, { done: false })])]);
  assert.equal(workoutVolume(w), 1000);
});

test("previous entry is the latest finished workout with that exercise", () => {
  const list = [
    workout("old", 1, "push", [entry("bench", [set(100, 8)])]),
    workout("new", 2, "push", [entry("bench", [set(110, 8)])]),
    workout("other", 3, "pull", [entry("row", [set(90, 10)])]),
    { ...workout("live", 4, "push", [entry("bench", [set(200, 1)])]), finishedAt: null }
  ];
  assert.equal(previousEntry(list, "bench").workout.id, "new");
  assert.equal(previousEntry(list, "bench", { excludeId: "new" }).workout.id, "old");
  assert.equal(previousEntry(list, "bench", { before: 2 }).workout.id, "old");
  assert.equal(previousEntry(list, "squat"), null);
});

test("double progression: add weight once every set hits the top of the range", () => {
  const target = { repMin: 8, repMax: 12 };
  assert.deepEqual(pick(suggestion(entry("b", [set(100, 12), set(100, 12), set(100, 13)]), target, 5)), { kind: "up", weight: 105, reps: 8 });
  assert.deepEqual(pick(suggestion(entry("b", [set(100, 12), set(100, 10), set(100, 9)]), target, 5)), { kind: "reps", weight: 100, reps: 10 });
  assert.deepEqual(pick(suggestion(entry("b", [set(100, 9), set(100, 7)]), target, 5)), { kind: "hold", weight: 100, reps: 8 });
  assert.equal(suggestion(entry("b", [set(0, 12)]), target).kind, "reps", "bodyweight asks for more reps");
  assert.equal(suggestion(entry("b", [set(100, 5, { done: false })]), target), null);
  assert.equal(suggestion(null, target), null);
});

const pick = ({ kind, weight, reps }) => ({ kind, weight, reps });

test("placeholders line up with last time's sets of the same type", () => {
  const previous = entry("b", [set(45, 10, { type: "warmup" }), set(100, 8), set(100, 7)]);
  const current = { sets: [{ type: "warmup" }, { type: "working" }, { type: "working" }, { type: "working" }] };
  assert.deepEqual(strip(placeholderFor(current, 0, previous, null)), { weight: 45, reps: 10 });
  assert.deepEqual(strip(placeholderFor(current, 1, previous, null)), { weight: 100, reps: 8 });
  assert.deepEqual(strip(placeholderFor(current, 2, previous, null)), { weight: 100, reps: 7 });
  assert.deepEqual(strip(placeholderFor(current, 3, previous, null)), { weight: 100, reps: 7 }, "extra sets repeat the last one");
  assert.deepEqual(strip(placeholderFor(current, 1, previous, { kind: "up", weight: 105, reps: 8 })), { weight: 105, reps: 8 });
  assert.deepEqual(strip(placeholderFor(current, 0, previous, { kind: "up", weight: 105, reps: 8 })), { weight: 45, reps: 10 }, "warm-ups don't jump");
  assert.deepEqual(strip(placeholderFor({ sets: [{ type: "warmup" }] }, 0, entry("b", [set(100, 8)]), null)), { weight: null, reps: null });
});

const strip = ({ weight, reps }) => ({ weight, reps });

test("history, PRs and PR detection", () => {
  const list = [
    workout("a", 1, "push", [entry("bench", [set(185, 5), set(185, 5)])]),
    workout("b", 2, "push", [entry("bench", [set(190, 3), set(170, 10)])])
  ];
  const history = exerciseHistory(list, "bench");
  assert.equal(history.length, 2);
  assert.equal(history[1].topWeight, 190);
  const records = personalRecords(history);
  assert.equal(records.weight.weight, 190);
  assert.equal(Math.round(records.e1rm.value), 227); // 170 × 10
  assert.equal(records.repsAtWeight.get(185).reps, 5);
  assert.equal(records.volume.value, 2270);
  assert.ok(isPersonalRecord(set(195, 1), records), "heavier");
  assert.ok(isPersonalRecord(set(175, 10), records), "higher e1RM");
  assert.ok(!isPersonalRecord(set(185, 5), records));
  assert.ok(!isPersonalRecord(set(195, 1, { type: "warmup" }), records), "warm-ups never count");
  assert.ok(!isPersonalRecord(set(500, 1), personalRecords([])), "nothing to beat the first time");
});

test("trend compares recent sessions with earlier ones", () => {
  const points = (values) => values.map((v) => ({ bestE1rm: v }));
  assert.equal(trend(points([200])), "new");
  assert.equal(trend(points([200, 200, 200, 210, 215, 220])), "up");
  assert.equal(trend(points([220, 220, 220, 200, 200, 200])), "down");
  assert.equal(trend(points([200, 201, 200, 200])), "flat");
});

test("a workout from a split day has one empty row per target set", () => {
  const w = workoutFromDay({ id: "push", name: "Push", exercises: [{ exerciseId: "bench", targetSets: 4, repMin: 5, repMax: 8, restSec: 180 }] }, { now: 10 });
  assert.equal(w.name, "Push");
  assert.equal(w.startedAt, 10);
  assert.equal(w.finishedAt, null);
  assert.equal(w.entries[0].sets.length, 4);
  assert.equal(w.entries[0].restSec, 180);
  assert.ok(w.entries[0].sets.every((s) => !s.done && s.weight === null));
});

test("weeks start on Monday", () => {
  const wednesday = new Date(2026, 9, 21, 15).getTime();
  const monday = new Date(startOfWeek(wednesday));
  assert.equal(monday.getDay(), 1);
  assert.equal(monday.getDate(), 19);
  const sunday = new Date(2026, 9, 25, 9).getTime();
  assert.equal(new Date(startOfWeek(sunday)).getDate(), 19);
});


test('plate breakdown per side, with leftover when it can\'t be loaded exactly', () => {
  assert.deepEqual(plateBreakdown(225).perSide, [45, 45]);
  assert.equal(plateBreakdown(225).leftover, 0);
  assert.deepEqual(plateBreakdown(227.5).perSide, [45, 45]);
  assert.equal(plateBreakdown(227.5).leftover, 2.5);
  assert.deepEqual(plateBreakdown(185).perSide, [45, 25]);
  assert.deepEqual(plateBreakdown(140, { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] }).perSide, [25, 25, 10]);
  assert.deepEqual(plateBreakdown(135, { plates: [25, 10] }).perSide, [25, 10, 10]);
  assert.equal(plateBreakdown(30).leftover, -15, 'below the bar');
});

test('loadable rounding and warm-up ramps', () => {
  assert.equal(roundLoadable(91, { equipment: 'barbell' }), 90);
  assert.equal(roundLoadable(20, { equipment: 'barbell' }), 45, 'never below the bar');
  assert.equal(roundLoadable(24, { equipment: 'dumbbell', step: 5 }), 25);
  assert.deepEqual(warmupSets(225, { equipment: 'barbell' }), [{ weight: 45, reps: 10 }, { weight: 90, reps: 8 }, { weight: 135, reps: 5 }, { weight: 180, reps: 3 }]);
  assert.deepEqual(warmupSets(60, { equipment: 'dumbbell', step: 5 }), [{ weight: 25, reps: 8 }, { weight: 35, reps: 5 }, { weight: 50, reps: 3 }]);
  assert.deepEqual(warmupSets(95, { equipment: 'barbell' }), [{ weight: 45, reps: 10 }, { weight: 55, reps: 5 }, { weight: 75, reps: 3 }], 'duplicates of the bar are dropped');
  assert.deepEqual(warmupSets(10, { equipment: 'dumbbell', step: 5 }), [{ weight: 5, reps: 8 }], 'nothing at or above working weight');
  assert.deepEqual(warmupSets(0, {}), []);
});

test('superset labels, rest and next exercise', () => {
  const entries = [{ supersetId: null }, { supersetId: 'x' }, { supersetId: 'x' }, { supersetId: 'y' }, { supersetId: 'z' }, { supersetId: 'z' }, { supersetId: 'z' }];
  const labels = supersetLabels(entries);
  assert.equal(labels[0], null);
  assert.deepEqual([labels[1].group, labels[1].position, labels[2].position], ['A', 1, 2]);
  assert.equal(labels[3], null, 'a group of one is not a superset');
  assert.deepEqual([labels[4].group, labels[6].position, labels[6].size], ['B', 3, 3]);
  assert.equal(restsAfter(entries, 0), true);
  assert.equal(restsAfter(entries, 1), false);
  assert.equal(restsAfter(entries, 2), true);
  assert.equal(nextInSuperset(entries, 1), 2);
  assert.equal(nextInSuperset(entries, 2), 1, 'back to the first after the last');
  assert.equal(nextInSuperset(entries, 0), null);
});

test('muscle sets, daily volume and week streak', () => {
  const index = new Map([['bench', { muscle: 'chest' }], ['fly', { muscle: 'chest' }], ['row', { muscle: 'back' }]]);
  const day = 86_400_000;
  const now = new Date(2026, 9, 21, 12).getTime(); // a Wednesday
  const list = [
    workout('a', now - day, 'push', [entry('bench', [set(100, 8), set(100, 8), set(45, 10, { type: 'warmup' })]), entry('fly', [set(30, 12)])]),
    workout('b', now - 2 * day, 'pull', [entry('row', [set(90, 10), set(90, 10, { done: false })])]),
    workout('c', now - 9 * day, 'pull', [entry('row', [set(90, 10)])]),
    workout('r', now - 3 * day, 'rest', [], { rest: true })
  ];
  assert.deepEqual(muscleSets(list, index, startOfWeek(now)), [{ muscle: 'chest', sets: 3 }, { muscle: 'back', sets: 1 }]);
  const days = dailyVolume(list);
  assert.equal(days.get(dateKey(now - day)).volume, 1960);
  assert.equal(days.has(dateKey(now - 3 * day)), false, 'rest days are not training days');
  assert.equal(weekStreak(list, now), 2);
  assert.equal(weekStreak(list, now + 7 * day), 2, 'an empty current week does not break it yet');
  assert.equal(weekStreak(list, now + 14 * day), 0);
});

test('bodyweight: one id per day and a 7-day moving average', () => {
  assert.equal(bodyweightId('2026-10-19'), bodyweightId('2026-10-19'));
  const avg = movingAverage([{ date: '2026-10-01', weight: 180 }, { date: '2026-10-03', weight: 182 }, { date: '2026-10-10', weight: 184 }]);
  assert.deepEqual(avg.map((p) => p.value), [180, 181, 184]);
});

test('split diff describes what changed and keeps targets', () => {
  const day = { exercises: [{ exerciseId: 'bench', targetSets: 3, repMin: 5, repMax: 8, restSec: 180 }, { exerciseId: 'dip', targetSets: 3 }] };
  const done = { entries: [entry('bench', [set(45, 10, { type: 'warmup' }), set(185, 8), set(185, 8), set(185, 8), set(185, 7)]), entry('fly', [set(30, 12)])] };
  const diff = splitDiff(day, done);
  assert.deepEqual(diff.changes, ['Add fly', 'Remove dip', 'bench: 4 sets']);
  assert.deepEqual(diff.exercises[0], { exerciseId: 'bench', targetSets: 4, repMin: 5, repMax: 8, restSec: 180, supersetId: null });
  const same = splitDiff({ exercises: [{ exerciseId: 'bench', targetSets: 1 }] }, { entries: [entry('bench', [set(100, 5)])] });
  assert.deepEqual(same.changes, []);
});

test('previous session is the last one of the same split day', () => {
  const list = [workout('a', 1, 'push'), workout('b', 2, 'pull'), workout('c', 3, 'push'), workout('d', 4, 'push')];
  assert.equal(previousSession(list, list[3]).id, 'c');
  assert.equal(previousSession(list, list[0]), null);
});


test('weekly goal defaults to the training days the rotation fits into a week', () => {
  assert.equal(defaultWeeklyGoal([day('push', 0), day('pull', 1), day('legs', 2), day('rest', 3, { rest: true })]), 5);
  assert.equal(defaultWeeklyGoal([day('upper', 0), day('lower', 1), day('rest', 2, { rest: true })]), 5);
  assert.equal(defaultWeeklyGoal([day('a', 0), day('r1', 1, { rest: true }), day('b', 2), day('r2', 3, { rest: true })]), 4);
  assert.equal(defaultWeeklyGoal([]), 3);
});

test('week summary counts sessions in range, not rest days', () => {
  const list = [
    workout('a', 10, 'push', [entry('bench', [set(100, 10), set(100, 8)])]),
    workout('b', 20, 'pull', [entry('row', [set(50, 10)])]),
    workout('r', 15, 'rest', [], { rest: true }),
    workout('old', 1, 'push', [entry('bench', [set(100, 10)])])
  ];
  assert.deepEqual(weekSummary(list, 5, 25), { count: 2, sets: 3, volume: 2300, cardioMinutes: 0 });
  assert.deepEqual(weekSummary(list, 30), { count: 0, sets: 0, volume: 0, cardioMinutes: 0 });
});


const cardioSet = (incline, speed, seconds, extra = {}) => ({ id: 'c' + Math.random(), incline, speed, seconds, type: 'working', done: true, ...extra });
const timedSet = (seconds, reps = null, extra = {}) => ({ id: 't' + Math.random(), seconds, reps, type: 'working', done: true, ...extra });

test('tracking types and their fields', () => {
  assert.equal(trackOf({}), 'strength');
  assert.equal(trackOf({ track: 'cardio' }), 'cardio');
  assert.equal(trackOf({ track: 'nonsense' }), 'strength');
  assert.deepEqual(FIELDS.cardio, ['incline', 'speed', 'seconds']);
  assert.deepEqual(FIELDS.timed, ['seconds', 'reps']);
});

test('completion: reps for strength, time for cardio and timed', () => {
  assert.equal(isComplete({ weight: 0, reps: 10 }), true);
  assert.equal(isComplete({ weight: null, reps: 10 }), false);
  assert.equal(isComplete({ seconds: 1200 }, 'cardio'), true, 'incline and speed are optional');
  assert.equal(isComplete({ incline: 12, speed: 3 }, 'cardio'), false);
  assert.equal(isComplete({ seconds: 30 }, 'timed'), true);
  assert.equal(isComplete({ reps: 12 }, 'timed'), false);
});

test('distance comes from speed and time', () => {
  assert.equal(setDistance({ speed: 3, seconds: 1200 }), 1);
  assert.equal(setDistance({ seconds: 600 }), 0);
});

test('placeholders carry cardio and timed fields from last time', () => {
  const prevCardio = entry('walk', [cardioSet(12, 3.2, 1200)]);
  const ph = placeholderFor({ sets: [{ type: 'working' }] }, 0, prevCardio, null);
  assert.deepEqual([ph.incline, ph.speed, ph.seconds], [12, 3.2, 1200]);
  const prevTimed = entry('box', [timedSet(30), timedSet(45, 12)]);
  const second = placeholderFor({ sets: [{ type: 'working' }, { type: 'working' }] }, 1, prevTimed, null);
  assert.deepEqual([second.seconds, second.reps], [45, 12]);
  assert.equal(placeholderFor({ sets: [{ type: 'working' }] }, 0, prevTimed, null).reps, null, 'reps stay empty when not logged');
});

test('cardio and timed history, records and PRs', () => {
  const list = [
    workout('a', 1, 'cardio', [entry('walk', [cardioSet(10, 3, 1200)])]),
    workout('b', 2, 'cardio', [entry('walk', [cardioSet(12, 3.2, 900)])])
  ];
  const history = exerciseHistory(list, 'walk');
  assert.equal(history[0].seconds, 1200);
  assert.equal(history[0].distance, 1);
  assert.equal(history[1].maxIncline, 12);
  const records = personalRecords(history);
  assert.equal(records.longest.seconds, 1200);
  assert.equal(records.distance.value, 1);
  assert.equal(records.speed.value, 3.2);
  assert.ok(isPersonalRecord(cardioSet(12, 3.2, 1500), records, 'cardio'), 'longer');
  assert.ok(isPersonalRecord(cardioSet(13, 3, 600), records, 'cardio'), 'steeper');
  assert.ok(!isPersonalRecord(cardioSet(10, 3, 600), records, 'cardio'));
  assert.ok(!isPersonalRecord(cardioSet(10, 3, 600), personalRecords([]), 'cardio'), 'nothing to beat the first time');

  const box = personalRecords(exerciseHistory([workout('c', 1, 'plyo', [entry('box', [timedSet(30, 10), timedSet(40)])])], 'box'));
  assert.equal(box.longest.seconds, 40);
  assert.equal(box.reps.reps, 10);
  assert.ok(isPersonalRecord(timedSet(45), box, 'timed'));
  assert.ok(isPersonalRecord(timedSet(20, 12), box, 'timed'), 'more reps');
  assert.ok(!isPersonalRecord(timedSet(20), box, 'timed'));
});

test('hints for cardio and timed', () => {
  const cardio = suggestion(entry('walk', [cardioSet(12, 3.2, 1200)]), {}, 5, 'cardio', 'mph');
  assert.equal(cardio.kind, 'cardio');
  assert.match(cardio.text, /20:00 at 12% · 3.2 mph/);
  assert.equal(suggestion(entry('box', [timedSet(30), timedSet(45)]), {}, 5, 'timed').text, 'Beat 0:45');
});

test('cardio minutes in the week, and no cardio in muscle sets', () => {
  const index = new Map([['walk', { track: 'cardio', muscle: 'cardio' }], ['box', { track: 'timed', muscle: 'full body' }], ['bench', { muscle: 'chest' }]]);
  const list = [workout('a', 10, 'mix', [entry('walk', [cardioSet(12, 3, 1200)]), entry('box', [timedSet(30), timedSet(30)]), entry('bench', [set(100, 8)])])];
  assert.equal(weekSummary(list, 0, Infinity, index).cardioMinutes, 20);
  assert.equal(cardioSeconds(list[0]), 1200, 'without an index, speed/incline marks cardio');
  assert.deepEqual(muscleSets(list, index, 0), [{ muscle: 'full body', sets: 2 }, { muscle: 'chest', sets: 1 }]);
  assert.equal(workoutVolume(list[0]), 800, 'volume stays lifting only');
});

// ---------- nutrition ----------

const meal = (date, calories, extra = {}) => ({ id: `m-${date}-${Math.random()}`, kind: "meal", date, calories, protein: 0, carbs: 0, fat: 0, ...extra });
const days = (count, start = "2026-09-01") => Array.from({ length: count }, (_, i) => shiftDateKey(start, i));

test("daily intake adds meals per date and leaves unlogged days out", () => {
  const intake = dailyIntake([meal("2026-09-01", 600, { protein: 40 }), meal("2026-09-01", 900, { protein: 60 }), meal("2026-09-03", 2000), { ...meal("2026-09-03", 500), deleted: true }]);
  assert.deepEqual([...intake.keys()], ["2026-09-01", "2026-09-03"]);
  assert.equal(intake.get("2026-09-01").calories, 1500);
  assert.equal(intake.get("2026-09-01").protein, 100);
  assert.equal(intake.get("2026-09-01").meals, 2);
  assert.equal(intake.get("2026-09-03").calories, 2000, "deleted meals don't count");
  assert.equal(dayTotals([meal("x", "450", { fat: "12.5" })]).fat, 12.5);
});

test("date keys shift across months and resolve in a time zone", () => {
  assert.equal(shiftDateKey("2026-02-27", 3), "2026-03-02");
  assert.equal(shiftDateKey("2026-01-01", -1), "2025-12-31");
  // 03:00 UTC on Oct 21 is still Oct 20 in Chicago.
  assert.equal(dateKeyIn(Date.UTC(2026, 9, 21, 3), "America/Chicago"), "2026-10-20");
  assert.equal(dateKeyIn(Date.UTC(2026, 9, 21, 3), "UTC"), "2026-10-21");
});

test("maintenance comes from intake and the weight trend once there's enough data", () => {
  // 2,800 kcal a day while gaining 0.5 lb a week → about 2,550 maintenance.
  const span = days(28);
  const meals = span.map((date) => meal(date, 2800));
  const weights = span.map((date, i) => ({ id: bodyweightId(date), kind: "bodyweight", date, weight: 180 + (0.5 / 7) * i }));
  const today = shiftDateKey(span[span.length - 1], 1);
  const estimate = estimateMaintenance(meals, weights, { today });
  assert.equal(estimate.method, "adaptive");
  assert.equal(estimate.confidence, "high");
  assert.equal(estimate.calories, 2550);
  assert.ok(Math.abs(estimate.weightPerWeek - 0.5) < 0.01);
});

test("maintenance falls back to a rough guess, and gaps don't drag the average down", () => {
  const weights = [{ id: "a", date: "2026-09-01", weight: 200 }];
  const rough = estimateMaintenance([meal("2026-09-01", 2500)], weights, { today: "2026-09-05" });
  assert.equal(rough.method, "bodyweight");
  assert.equal(rough.calories, 3000);
  assert.equal(rough.avgIntake, 2500);
  assert.equal(estimateMaintenance([], [], { today: "2026-09-05" }).calories, null);
  // Logging only every other day still averages the logged days.
  const span = days(28);
  const sparse = span.filter((_, i) => i % 2 === 0).map((date) => meal(date, 2400));
  const flat = span.map((date) => ({ id: date, date, weight: 180 }));
  const estimate = estimateMaintenance(sparse, flat, { today: shiftDateKey(span[27], 1) });
  assert.equal(estimate.calories, 2400);
  assert.equal(estimate.loggedDays, 14);
  assert.equal(estimate.confidence, "medium");
});

test("targets follow the goal unless set by hand", () => {
  assert.equal(nutritionTargets({ goal: "maintain" }, 2500, 180).calories, 2500);
  assert.equal(nutritionTargets({ goal: "cut" }, 2500, 180).calories, 2000);
  assert.equal(nutritionTargets({ goal: "leanBulk" }, 2500, 180).calories, 2750);
  const manual = nutritionTargets({ goal: "cut", calorieTarget: 2200, proteinTarget: 170 }, 2500, 180);
  assert.equal(manual.calories, 2200);
  assert.equal(manual.protein, 170);
  assert.equal(manual.autoCalories, false);
  const auto = nutritionTargets({ goal: "maintain", unit: "lb" }, 2500, 180);
  assert.equal(auto.protein, 180);
  assert.equal(auto.fat, Math.round((2500 * 0.25) / 9));
  assert.equal(auto.carbs, Math.round((2500 - 180 * 4 - auto.fat * 9) / 4));
  assert.equal(nutritionTargets({ unit: "kg" }, 2500, 80).protein, 176);
  assert.equal(nutritionTargets({}, null, null).calories, null);
});

test("weight rate is checked against the goal's band", () => {
  const span = days(21);
  const gaining = span.map((date, i) => ({ id: date, date, weight: 200 + (0.8 / 7) * i }));
  const rate = weightRate(gaining, { today: span[20] });
  assert.ok(Math.abs(rate.perWeek - 0.8) < 0.05);
  assert.ok(Math.abs(rate.percent - 0.4) < 0.03);
  assert.equal(rateStatus(rate, "leanBulk"), "in");
  assert.equal(rateStatus(rate, "maintain"), "above");
  assert.equal(rateStatus(rate, "cut"), "above");
  assert.equal(weightRate(gaining.slice(0, 3), { today: span[2] }), null, "needs a week of data");
});

// ---------- coach ----------

const NOW = new Date(2026, 9, 25, 21, 0).getTime();
const TODAY = dateKey(NOW);
const at = (date, hour) => fromDateKey(date) + hour * 3_600_000;
const bench = (id, date, weight, reps = 5) => workout(id, at(date, 18), "push", [entry("bench", [set(weight, reps), set(weight, reps)])]);
const flatWeights = (count, weight = 180) => Array.from({ length: count }, (_, i) => ({ id: `bw${i}`, date: shiftDateKey(TODAY, -i - 1), weight }));
const ids = (result) => result.cards.map((card) => card.id);

test("the coach stays quiet without data", () => {
  assert.deepEqual(insights({ now: NOW }), { headline: null, cards: [] });
  const few = insights({ meals: [meal(shiftDateKey(TODAY, -1), 2500)], now: NOW });
  assert.deepEqual(ids(few), [], "one logged day is too little for any rule");
});

test("strength and pre-workout meals are compared across fed and under-fed weeks", () => {
  // Eight weeks alternating 2,900 and 2,100 kcal with a flat weight, so
  // maintenance lands near 2,500. Fed weeks add a carb snack before lifting
  // and bench goes up; under-fed weeks it holds.
  const meals = [];
  const workouts = [];
  let weight = 200;
  for (let i = 55; i >= 1; i -= 1) {
    const date = shiftDateKey(TODAY, -i);
    const fedWeek = Math.floor((i - 1) / 7) % 2 === 0;
    meals.push(meal(date, fedWeek ? 2300 : 2100, { eatenAt: at(date, 12), protein: 190 }));
    if (fedWeek) meals.push(meal(date, 600, { eatenAt: at(date, 15), carbs: 80 }));
    if (i % 2 === 0) {
      if (fedWeek) weight += 5;
      workouts.push(bench(`w${i}`, date, weight));
    }
  }
  const result = insights({ workouts, meals, bodyweights: flatWeights(28), settings: { goal: "maintain" }, now: NOW });
  const fuel = result.cards.find((card) => card.id === "fuel-strength");
  assert.ok(fuel, "fuel vs strength fires");
  assert.match(fuel.body, /per session in weeks at or above maintenance/);
  const pre = result.cards.find((card) => card.id === "pre-workout");
  assert.ok(pre, "pre-workout fuel fires");
  assert.match(pre.body, /^\d+% of sessions with 40 g\+ carbs/);
  assert.equal(result.cards.find((card) => card.id === "stall"), undefined, "bench is still moving");
  assert.match(result.headline.title, /^This week: \d+ sessions?, on target \d+ of \d+ days$/);
});

test("a stalled lift is blamed on under-eating, low protein or fatigue, in that order", () => {
  const workouts = Array.from({ length: 6 }, (_, i) => bench(`s${i}`, shiftDateKey(TODAY, -2 * i - 1), 225));
  const days = (calories, protein) => Array.from({ length: 10 }, (_, i) => meal(shiftDateKey(TODAY, -i - 1), calories, { protein }));
  const settings = { calorieTarget: 2600, proteinTarget: 180 };
  const hungry = insights({ workouts, meals: days(2000, 190), settings, now: NOW }).cards.find((card) => card.id === "stall");
  assert.equal(hungry.tone, "warn");
  assert.match(hungry.title, /bench has stalled/);
  assert.match(hungry.body, /\(5 sessions\)/);
  assert.match(hungry.action, /Eat about 400 kcal more on training days/);
  const lowProtein = insights({ workouts, meals: days(2600, 120), settings, now: NOW }).cards.find((card) => card.id === "stall");
  assert.match(lowProtein.action, /Get protein to 180 g/);
  const tired = insights({ workouts, meals: days(2600, 190), settings, now: NOW }).cards.find((card) => card.id === "stall");
  assert.match(tired.action, /deload/);
});

test("the weight rate card says how many calories to change", () => {
  const meals = Array.from({ length: 20 }, (_, i) => meal(shiftDateKey(TODAY, -i - 1), 2700, { protein: 185 }));
  const slow = insights({ meals, bodyweights: flatWeights(21), settings: { goal: "leanBulk" }, now: NOW }).cards.find((card) => card.id === "rate");
  assert.equal(slow.title, "Gaining too slowly for a lean bulk");
  assert.match(slow.action, /^Add about 350 kcal a day/);
  const ok = insights({ meals, bodyweights: flatWeights(21), settings: { goal: "maintain" }, now: NOW }).cards.find((card) => card.id === "rate");
  assert.equal(ok.tone, "good");
});

test("protein misses, eating less on lifting days and unlogged days get their own cards", () => {
  const meals = [];
  const workouts = [];
  for (let i = 1; i <= 28; i += 1) {
    const date = shiftDateKey(TODAY, -i);
    if (i === 2 || i === 4) continue; // two unlogged days this week
    const training = i % 2 === 1;
    if (training) workouts.push(bench(`t${i}`, date, 135 + i));
    meals.push(meal(date, training ? 2200 : 2700, { protein: 120 }));
  }
  const result = insights({ workouts, meals, settings: { calorieTarget: 2500, proteinTarget: 180 }, now: NOW });
  const protein = result.cards.find((card) => card.id === "protein");
  assert.equal(protein.title, "Protein hit 0 of 5 days");
  assert.match(protein.body, /about 60 g short/);
  const split = result.cards.find((card) => card.id === "training-days");
  assert.match(split.body, /2,200 kcal on training days vs 2,700 on rest days/);
  assert.equal(result.cards.find((card) => card.id === "gaps").title, "2 days unlogged this week");
  assert.deepEqual(result.cards.map((card) => card.tone), [...result.cards.map((card) => card.tone)].sort((a, b) => ({ warn: 0, info: 1, good: 2 })[a] - ({ warn: 0, info: 1, good: 2 })[b]), "most urgent first");
});

test("coaching context summarizes weeks, targets and lifts", () => {
  const workouts = Array.from({ length: 4 }, (_, i) => bench(`c${i}`, shiftDateKey(TODAY, -3 * i - 1), 200 + 5 * (3 - i)));
  const meals = Array.from({ length: 14 }, (_, i) => meal(shiftDateKey(TODAY, -i - 1), 2500, { protein: 180 }));
  const context = coachingContext({ workouts, meals, bodyweights: flatWeights(14), settings: { goal: "maintain", unit: "lb" }, now: NOW, weeks: 2 });
  assert.equal(context.weeks.length, 2);
  assert.equal(context.weeks[1].to, TODAY);
  assert.equal(context.weeks[0].avgCalories, 2500);
  assert.equal(context.lifts[0].name, "bench");
  assert.equal(context.lifts[0].trend, "up");
  assert.equal(context.lifts[0].stalledFor, 0);
  assert.equal(context.maintenance.method, "adaptive");
});

// ---------- micronutrients ----------

test("micronutrients add up per day, and a meal that didn't report one leaves it partial", () => {
  const day = dayTotals([
    meal("2026-10-20", 600, { fiber: 8, micros: { sodium: 900, vitaminC: 40 } }),
    meal("2026-10-20", 800, { micros: { sodium: 1200 } }),
    meal("2026-10-20", 300)
  ]);
  assert.equal(day.micros.sodium, 2100);
  assert.equal(day.microMeals.sodium, 2);
  assert.equal(day.micros.fiber, 8, "fiber counts as a micronutrient too");
  assert.equal(day.microMeals.fiber, 1);
  assert.equal(day.micros.potassium, undefined, "never reported, so unknown");
  assert.equal(mealMicro({ micros: { iron: "" } }, "iron"), null);
  assert.ok(MICROS.find((m) => m.key === "sodium").kind === "limit");
});

test("micronutrient averages only use days where every meal reported the nutrient", () => {
  const days = [...dailyIntake([
    meal("2026-10-20", 600, { micros: { potassium: 1000 } }),
    meal("2026-10-21", 600, { micros: { potassium: 3000 } }),
    meal("2026-10-22", 600, { micros: { potassium: 500 } }),
    meal("2026-10-22", 700)
  ]).values()];
  const potassium = microAverages(days).find((m) => m.key === "potassium");
  assert.equal(potassium.days, 2, "Oct 22 had a meal without it");
  assert.equal(potassium.avg, 2000);
  assert.equal(Math.round(potassium.pct), 43);
});

test("the coach flags micronutrients far from their Daily Value", () => {
  const meals = Array.from({ length: 6 }, (_, i) => meal(shiftDateKey(TODAY, -i - 1), 2500, { protein: 180, fiber: 10, micros: { sodium: 4200, potassium: 1500, vitaminC: 120 } }));
  const card = insights({ meals, settings: { proteinTarget: 180 }, now: NOW }).cards.find((c) => c.id === "micros");
  assert.equal(card.title, "Low on potassium and fiber, high on sodium");
  assert.match(card.body, /Sodium 4,200 mg a day, 183% of the 2300 mg Daily Value/);
  assert.match(card.action, /Sauces, deli meat/);
  const fine = Array.from({ length: 6 }, (_, i) => meal(shiftDateKey(TODAY, -i - 1), 2500, { fiber: 30, micros: { sodium: 2000 } }));
  assert.equal(insights({ meals: fine, now: NOW }).cards.find((c) => c.id === "micros"), undefined);
  const context = coachingContext({ meals, now: NOW, weeks: 1 });
  assert.deepEqual(context.micros.find((m) => m.nutrient === "Sodium"), { nutrient: "Sodium", perDay: 4200, unit: "mg", dailyValue: 2300, percentDV: 183, kind: "limit" });
});

// ---------- training coach ----------

const lib = new Map([
  ["bp", { id: "bp", name: "Bench Press", muscle: "chest", equipment: "barbell" }],
  ["fly", { id: "fly", name: "Cable Fly", muscle: "chest", equipment: "cable" }],
  ["row", { id: "row", name: "Barbell Row", muscle: "back", equipment: "barbell" }],
  ["pd", { id: "pd", name: "Rope Pushdown", muscle: "triceps", equipment: "cable" }],
  ["sq", { id: "sq", name: "Back Squat", muscle: "quads", equipment: "barbell" }],
  ["lat", { id: "lat", name: "Dumbbell Lateral Raise", muscle: "shoulders", equipment: "dumbbell" }],
  ["walk", { id: "walk", name: "Incline Walk", muscle: "cardio", equipment: "machine", track: "cardio" }]
]);
const lifted = (id, at, items) => workout(id, at, "d1", items.map(([exerciseId, sets, extra = {}]) => entry(exerciseId, Array.from({ length: sets }, () => set(100, 10)), extra)));

test("presses, rows and squats count half a set for the muscles they assist", () => {
  assert.deepEqual(indirectMuscles(lib.get("bp")), ["triceps", "shoulders"]);
  assert.deepEqual(indirectMuscles(lib.get("fly")), [], "a fly doesn't train triceps");
  assert.deepEqual(indirectMuscles(lib.get("row")), ["biceps"]);
  assert.deepEqual(indirectMuscles({ name: "Deadlift", muscle: "back" }), ["hamstrings", "glutes"]);
  const list = [lifted("a", 1000, [["bp", 4], ["pd", 2]])];
  const rows = Object.fromEntries(muscleSets(list, lib, 0, { indirect: true }).map((r) => [r.muscle, r.sets]));
  assert.deepEqual(rows, { chest: 4, triceps: 4, shoulders: 2 });
  assert.deepEqual(muscleSets(list, lib, 0).map((r) => r.muscle), ["chest", "triceps"], "direct only by default");
});

test("the split's weekly sets scale the rotation to seven days", () => {
  const days = [
    { id: "push", position: 0, name: "Push", exercises: [{ exerciseId: "bp", targetSets: 3 }, { exerciseId: "pd", targetSets: 2 }] },
    { id: "pull", position: 1, name: "Pull", exercises: [{ exerciseId: "row", targetSets: 4 }] },
    { id: "rest", position: 2, name: "Rest", rest: true, exercises: [] }
  ];
  const weekly = splitWeeklySets(days, lib);
  assert.equal(Math.round(weekly.get("chest") * 10) / 10, 7, "3 sets × 7/3");
  assert.equal(Math.round(weekly.get("triceps") * 10) / 10, Math.round(((2 + 1.5) * 7) / 3 * 10) / 10);
  assert.equal(Math.round(weekly.get("biceps") * 10) / 10, Math.round((2 * 7) / 3 * 10) / 10);
});

test("a muscle under 10 sets a week gets a specific fix, on the right split day", () => {
  // Push days have bench but no direct triceps work, so triceps only gets
  // half a set per bench set: 4 × 7 sessions × ½ over two weeks = 7 a week.
  const days = [
    { id: "push", position: 0, name: "Push", exercises: [{ exerciseId: "bp", targetSets: 4 }, { exerciseId: "fly", targetSets: 2 }, { exerciseId: "lat", targetSets: 4 }] },
    { id: "legs", position: 1, name: "Legs", exercises: [{ exerciseId: "sq", targetSets: 6 }] },
    { id: "pull", position: 2, name: "Pull", exercises: [{ exerciseId: "row", targetSets: 6 }] }
  ];
  const workouts = [];
  for (let i = 1; i <= 14; i += 1) {
    const at = NOW - i * 86_400_000;
    workouts.push(i % 2 ? lifted(`p${i}`, at, [["bp", 4], ["fly", 2], ["lat", 4]]) : lifted(`l${i}`, at, [["sq", 6]]));
  }
  const card = insights({ workouts, exerciseIndex: lib, splitDays: days, now: NOW }).cards.find((c) => c.id === "volume-low");
  assert.equal(card.area, "training");
  assert.match(card.body, /^Over the last two weeks: back 0, biceps 0, hamstrings 0, triceps 7 sets a week/);
  assert.match(card.action, /^Back: add 10 sets a week, e\.g\. Lat Pulldown on Pull\./);
  assert.match(card.action, /Take each set to within 1–3 reps of failure\.$/);
  assert.match(card.source, /Schoenfeld et al., 2017/);
  assert.ok(!/chest/.test(card.body), "chest is in range");

  // Before there's two weeks of history, the split is read instead:
  // triceps = 4 sets × ½ × 7/3 ≈ 4.7 a week.
  const bySplit = insights({ exerciseIndex: lib, splitDays: days, now: NOW }).cards.find((c) => c.id === "volume-low");
  assert.match(bySplit.body, /^Your split works out to: hamstrings 0, triceps 4\.5, biceps 7, glutes 7 sets a week/);
  assert.match(bySplit.action, /Triceps: add 6 sets a week, e\.g\. Rope Pushdown on Push\./);
});

test("training rules flag one-day muscles, short rest, push/pull imbalance and dropping lifts", () => {
  const workouts = [];
  for (let i = 0; i < 4; i += 1) {
    const at = NOW - (i * 3 + 1) * 86_400_000;
    workouts.push(lifted(`w${i}`, at, i === 0 || i === 2 ? [["bp", 10, { restSec: 60 }], ["pd", 4]] : [["sq", 5]]));
  }
  workouts.push(lifted("old", NOW - 20 * 86_400_000, [["sq", 3]]));
  const result = insights({ workouts, exerciseIndex: lib, now: NOW });
  const ids = result.cards.map((c) => c.id);
  assert.ok(ids.includes("rest"));
  assert.match(result.cards.find((c) => c.id === "rest").body, /^Bench Press is set to under 90 seconds/);
  assert.ok(ids.includes("balance"), "lots of pressing, no pulling");
  assert.match(result.cards.find((c) => c.id === "balance").action, /rows, pulldowns or face pulls/);

  // Chest on days 1 and 8 only, legs in between: 10 chest sets a week, all on one day.
  const weekly = [1, 4, 8, 11].map((d) => lifted(`f${d}`, NOW - d * 86_400_000, d === 1 || d === 8 ? [["bp", 10], ["row", 10]] : [["sq", 6]]));
  weekly.push(lifted("f-old", NOW - 30 * 86_400_000, [["bp", 1]]));
  const once = insights({ workouts: weekly, exerciseIndex: lib, now: NOW }).cards.find((c) => c.id === "frequency");
  assert.ok(once, "chest gets all its sets on one day a week");

  const dropping = [180, 180, 175, 170, 165, 160].flatMap((w, i) => [workout(`d${i}`, NOW - (12 - 2 * i) * 86_400_000, "d1", [entry("bp", [set(w, 5)]), entry("sq", [set(w + 100, 5)])])]);
  const fatigue = insights({ workouts: dropping, exerciseIndex: lib, now: NOW }).cards.find((c) => c.id === "fatigue");
  assert.equal(fatigue.area, "recovery");
  assert.match(fatigue.action, /deload week/);
});

test("cardio is checked against 150 minutes a week once you log it", () => {
  const cardioSet = (minutes) => ({ id: Math.random(), seconds: minutes * 60, incline: 10, speed: 3, type: "working", done: true });
  const workouts = [
    workout("c1", NOW - 2 * 86_400_000, "d1", [entry("walk", [cardioSet(30)])]),
    workout("c2", NOW - 4 * 86_400_000, "d1", [entry("walk", [cardioSet(20)])])
  ];
  const card = insights({ workouts, exerciseIndex: lib, now: NOW }).cards.find((c) => c.id === "cardio");
  assert.equal(card.title, "Cardio: 50 of 150 minutes this week");
  assert.match(card.source, /WHO/);
  assert.equal(insights({ workouts: [lifted("x", NOW - 86_400_000, [["bp", 3]])], exerciseIndex: lib, now: NOW }).cards.find((c) => c.id === "cardio"), undefined, "no cardio logged, no nagging");
});

test("every card says where it belongs and what it's based on", () => {
  const meals = Array.from({ length: 6 }, (_, i) => meal(shiftDateKey(TODAY, -i - 1), 2500, { protein: 120 }));
  const result = insights({ meals, settings: { proteinTarget: 180 }, now: NOW });
  const protein = result.cards.find((c) => c.id === "protein");
  assert.equal(protein.area, "nutrition");
  assert.match(protein.source, /Morton et al., 2018/);
});

test("an exercise counts as in use once a set of it is completed", () => {
  const planned = workout("a", 1, "d", [entry("x", [{ id: "s", weight: 100, reps: 5, type: "working", done: false }])]);
  assert.equal(exerciseInUse([planned], "x"), false, "unchecked sets don't count");
  assert.equal(exerciseInUse([planned, workout("b", 2, "d", [entry("x", [set(100, 5)])])], "x"), true);
  assert.equal(exerciseInUse([{ ...workout("b", 2, "d", [entry("x", [set(100, 5)])]), deleted: true }], "x"), false, "deleted workouts don't count");
});
