import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyweightId, cardioSeconds, dailyVolume, dateKey, defaultWeeklyGoal, e1rm, FIELDS, isComplete, setDistance, trackOf, exerciseHistory, isPersonalRecord, movingAverage, muscleSets, nextInSuperset,
  nextSplitDay, personalRecords, placeholderFor, plateBreakdown, previousEntry, previousSession, restsAfter, roundLoadable,
  dailyIntake, dateKeyIn, dayTotals, estimateMaintenance, nutritionTargets, rateStatus, shiftDateKey, weightRate,
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
