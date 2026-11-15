import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyweightId, cardioSeconds, dailyVolume, dateKey, defaultWeeklyGoal, e1rm, FIELDS, isComplete, setDistance, trackOf, exerciseHistory, isPersonalRecord, movingAverage, muscleSets, nextInSuperset,
  badges, cleanUsername, compareLifts, leaderboard, nameProblem, profileSummary, shareFilter, usernameProblem, barFor, muscleGroup, secondaryGroups, nextSplitDay, personalRecords, placeholderFor, plateBreakdown, previousEntry, previousSession, restsAfter, roundLoadable,
  analyzeSplit, applySplitEdit, inferredSecondary, liftsThisWeek, REVIEW_MIN_LIFTS, coachingContext, exerciseInUse, stepProgress, workoutSteps, indirectMuscles, splitWeeklySets, dailyIntake, dateKeyIn, fromDateKey, insights, mealMicro, MICROS, microAverages, dayTotals, estimateMaintenance, nutritionTargets, rateStatus, shiftDateKey, weightRate,
  splitDiff, startOfWeek, suggestion, supersetLabels, trend, warmupSets, weekStreak, weekSummary, workoutFromDay, workoutVolume
} from "../src/lib/model.js";
import { BUILT_IN, slug, TEMPLATES } from "../src/lib/exercises.js";
import { findCurrentSplit, fromAssistant, listSplits, MAIN_SPLIT, MAIN_SPLIT_NAME, splitIdOf } from "../src/lib/model.js";

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
  assert.equal(roundLoadable(91, { equipment: 'plate loaded' }), 90, 'plates with no bar');
  assert.equal(roundLoadable(3, { equipment: 'plate loaded' }), 5);
  assert.deepEqual(warmupSets(180, { equipment: 'plate loaded' }), [{ weight: 70, reps: 8 }, { weight: 110, reps: 5 }, { weight: 145, reps: 3 }], 'no empty-bar set');
  assert.deepEqual(plateBreakdown(180, { bar: barFor('plate loaded', 45) }).perSide, [45, 45]);
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
  assert.match(card.action, /Take each set to within 1–3 reps of failure\. For exact edits, analyze your split on the Coach tab\.$/);
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

test("a workout's focus steps keep a superset on one screen", () => {
  const entries = [
    { id: "a", sets: [set(100, 5), { ...set(100, 5), done: false }] },
    { id: "b", supersetId: "ss", sets: [set(50, 10)] },
    { id: "c", supersetId: "ss", sets: [set(30, 12)] },
    { id: "d", sets: [] }
  ];
  assert.deepEqual(workoutSteps(entries), [
    { entryIds: ["a"], start: 0, end: 0 },
    { entryIds: ["b", "c"], start: 1, end: 2 },
    { entryIds: ["d"], start: 3, end: 3 }
  ]);
  assert.deepEqual(workoutSteps([]), []);
  const [first, pair, empty] = workoutSteps(entries);
  assert.deepEqual(stepProgress(first, entries), { done: 1, total: 2, complete: false });
  assert.deepEqual(stepProgress(pair, entries), { done: 2, total: 2, complete: true });
  assert.equal(stepProgress(empty, entries).complete, false, "no sets isn't done");
});

// ---------- split analyzer ----------

const LIB = new Map(BUILT_IN.map((exercise) => [exercise.id, exercise]));
const b = (name) => `b_${slug(name)}`;
const lift = (name, targetSets = 3, repMin = 8, repMax = 12, restSec = 120) => ({ exerciseId: b(name), targetSets, repMin, repMax, restSec });
const rotation = (...list) => list.map((extra, i) => day(extra.name || `d${i}`, i, extra));
const analyze = (splitDays, workouts = []) => analyzeSplit({ splitDays, exerciseIndex: LIB, workouts, now: NOW });
const find = (result, name) => result.suggestions.find((s) => s.name === name || s.item.exerciseId === b(name));
// Every suggestion applied, the way "Apply all" writes the split.
const applied = (splitDays, result) => splitDays.map((d) => ({ ...d, exercises: result.plan.find((p) => p.id === d.id)?.exercises || d.exercises }));

test("the analyzer adds sets to an exercise you already do, up to five", () => {
  // Triceps: 2 sets × 7/2 = 7 a week, so one more set (3.5) reaches 10.
  const days = rotation({ name: "Upper", exercises: [lift("Overhead Cable Extension", 2), lift("Lat Pulldown", 3), lift("Dumbbell Curl", 3), lift("Pec Deck", 3), lift("Dumbbell Lateral Raise", 3)] }, { name: "Rest", rest: true });
  const result = analyze(days);
  const tri = find(result, "Overhead Cable Extension");
  assert.deepEqual(tri.changes, [{ field: "sets", from: 2, to: 3 }]);
  assert.equal(tri.priority, 1);
  assert.match(tri.why, /^Triceps get about 7 sets a week/);
  assert.match(tri.source, /Schoenfeld et al., 2017/);
  assert.deepEqual(tri.edit, { dayId: "Upper", index: 0, exerciseId: b("Overhead Cable Extension"), fields: { targetSets: 3 } });
  assert.ok(result.suggestions.every((s) => s.item.targetSets <= 5), "no exercise past five sets");
  assert.ok(result.muscles.find((m) => m.muscle === "triceps").after >= 10);
});

test("a muscle with no exercise gets one, picking a lengthened choice", () => {
  const days = rotation({ name: "Legs", exercises: [lift("Back Squat", 4, 5, 8, 180), lift("Leg Press", 3)] }, { name: "Rest", rest: true });
  const result = analyze(days);
  const curl = find(result, "Seated Leg Curl");
  assert.equal(curl.kind, "add");
  assert.equal(curl.edit.dayId, "Legs");
  assert.ok(curl.item.targetSets >= 2 && curl.item.targetSets <= 5);
  assert.deepEqual([curl.item.repMin, curl.item.repMax, curl.item.restSec], [10, 15, 90], "isolation defaults");
  assert.ok(!find(result, "Lying Leg Curl"));
});

test("an exercise you log most is preferred over the default pick", () => {
  const days = rotation({ name: "Arms", exercises: [lift("Barbell Curl", 3)] }, { name: "Rest", rest: true });
  const workouts = [workout("w1", NOW - 86_400_000, "Arms", [entry(b("Skull Crusher"), [set(60, 10)])])];
  assert.ok(find(analyze(days, workouts), "Skull Crusher"));
});

test("well over 20 sets a week is trimmed back to 20, isolation first", () => {
  // Chest: (4 + 4) × 7/2 = 28 a week.
  const days = rotation({ name: "Chest", exercises: [lift("Bench Press", 4, 6, 10, 180), lift("Cable Fly", 4)] }, { name: "Rest", rest: true });
  const result = analyze(days);
  const fly = find(result, "Cable Fly");
  assert.equal(fly.changes[0].field, "sets");
  assert.ok(fly.changes[0].to < 4);
  assert.match(fly.source, /Baz-Valle/);
  assert.ok(result.muscles.find((m) => m.muscle === "chest").after <= 20);
});

test("more than 10 direct sets in a session move to a related day", () => {
  const days = rotation(
    { name: "Chest", exercises: [lift("Bench Press", 4, 6, 10, 180), lift("Incline Dumbbell Press", 4), lift("Cable Fly", 4)] },
    { name: "Shoulders", exercises: [lift("Overhead Press", 3, 6, 10, 180), lift("Dumbbell Lateral Raise", 3)] },
    { name: "Rest", rest: true }, { name: "Rest2", rest: true }, { name: "Rest3", rest: true }, { name: "Rest4", rest: true }, { name: "Rest5", rest: true }
  );
  const result = analyze(days);
  const moved = result.suggestions.filter((s) => s.priority === 2);
  assert.ok(moved.some((s) => s.dayId === "Chest" && s.changes[0].to < s.changes[0].from));
  const added = moved.find((s) => s.dayId === "Shoulders" && s.kind === "add");
  assert.ok(added, "the extra sets land on the shoulder day");
  assert.match(added.why, /^Chest gets 12 direct sets on Chest/);
  assert.match(added.source, /Pelland/);
});

test("a muscle trained once a week gets a second day", () => {
  // Seven-day rotation: each day is once a week. Triceps 9 sets, all on Arms.
  const days = rotation(
    { name: "Arms", exercises: [lift("Overhead Cable Extension", 3), lift("Skull Crusher", 3), lift("Dumbbell Kickback", 3), lift("Barbell Curl", 3), lift("Hammer Curl", 3), lift("Cable Curl", 3), lift("Concentration Curl", 3)] },
    { name: "Chest", exercises: [lift("Pec Deck", 4), lift("Cable Fly", 4), lift("Dumbbell Fly", 3)] },
    { name: "R1", rest: true }, { name: "R2", rest: true }, { name: "R3", rest: true }, { name: "R4", rest: true }, { name: "R5", rest: true }
  );
  const result = analyze(days);
  const second = result.suggestions.find((s) => s.dayId === "Chest" && s.kind === "add" && LIB.get(s.item.exerciseId).muscle === "triceps");
  assert.ok(second, "triceps work added to the chest day");
  assert.match(second.why, /Triceps are trained about once a week/);
  assert.ok(result.muscles.find((m) => m.muscle === "triceps").frequency >= 2);
});

test("pushdown-only triceps, lying curls and seated calf raises are swapped", () => {
  const days = rotation(
    { name: "Upper", exercises: [lift("Rope Pushdown", 4)] },
    { name: "Lower", exercises: [lift("Lying Leg Curl", 4), lift("Seated Calf Raise", 4)] }
  );
  const result = analyze(days);
  const swaps = Object.fromEntries(result.suggestions.filter((s) => s.kind === "swap").map((s) => [s.name, s.changes.find((c) => c.field === "exercise").to]));
  assert.deepEqual(swaps, { "Rope Pushdown": "Overhead Cable Extension", "Lying Leg Curl": "Seated Leg Curl", "Seated Calf Raise": "Standing Calf Raise" });
  assert.match(find(result, "Rope Pushdown").source, /Maeo et al., 2023/);
  assert.equal(find(result, "Rope Pushdown").edit.fields.exerciseId, b("Overhead Cable Extension"));
});

test("short rest on compounds and rep ranges outside 5–30 are fixed", () => {
  const days = rotation({ name: "Full", exercises: [lift("Back Squat", 3, 3, 4, 60), lift("Leg Extension", 3, 35, 50, 60)] });
  const result = analyze(days);
  const squat = find(result, "Back Squat");
  assert.deepEqual(squat.changes.filter((c) => c.field !== "sets"), [{ field: "reps", from: [3, 4], to: [5, 8] }, { field: "rest", from: 60, to: 150 }]);
  assert.match(squat.source, /Singer et al., 2024/);
  const ext = find(result, "Leg Extension");
  assert.deepEqual(ext.changes.find((c) => c.field === "reps"), { field: "reps", from: [35, 50], to: [15, 25] });
  assert.ok(!ext.changes.some((c) => c.field === "rest"), "isolation rest is left alone");
});

test("much more pushing than pulling adds pulling sets", () => {
  const days = rotation(
    { name: "Push", exercises: [lift("Bench Press", 4, 6, 10, 180), lift("Overhead Press", 4, 6, 10, 180), lift("Dumbbell Lateral Raise", 4), lift("Overhead Cable Extension", 4)] },
    { name: "Pull", exercises: [lift("Lat Pulldown", 2)] }
  );
  const result = analyze(days);
  const pulls = result.suggestions.filter((s) => s.why.includes("pushing sets a week"));
  assert.ok(pulls.length);
  assert.match(pulls[0].source, /Kolber et al., 2009/);
  const after = analyze(applied(days, result));
  assert.ok(!after.suggestions.some((s) => s.why.includes("pushing sets a week")), "balanced after applying");
});

test("a stalled lift gets a new rep range", () => {
  const days = rotation({ name: "Push", exercises: [lift("Bench Press", 4, 5, 8, 180)] }, { name: "Rest", rest: true });
  const workouts = [100, 100, 100, 100].map((w, i) => workout(`s${i}`, NOW - (10 - i) * 86_400_000, "Push", [entry(b("Bench Press"), [set(w, 5)])]));
  const bench = find(analyze(days, workouts), "Bench Press");
  assert.deepEqual(bench.changes.find((c) => c.field === "reps"), { field: "reps", from: [5, 8], to: [8, 12] });
  assert.match(bench.why, /hasn't beaten its best in 3 sessions/);
  assert.match(bench.source, /your logs/);
});

test("applying every suggestion leaves nothing for volume and raises the score", () => {
  for (const template of TEMPLATES) {
    const days = template.days.map((d, i) => day(`${template.id}-${i}`, i, d));
    const result = analyze(days);
    assert.ok(result.ready);
    assert.ok(result.score.after >= result.score.before, template.name);
    const again = analyze(applied(days, result));
    assert.ok(!again.suggestions.some((s) => s.priority === 1), `${template.name}: no volume left to fix`);
    for (const row of again.muscles) assert.ok(row.before >= 10, `${template.name}: ${row.muscle} reaches 10`);
  }
});

test("applySplitEdit adds once, changes in place and refuses a stale edit", () => {
  const list = [lift("Bench Press"), lift("Rope Pushdown")];
  assert.equal(applySplitEdit(list, { index: 1, exerciseId: b("Rope Pushdown"), fields: { targetSets: 4 } })[1].targetSets, 4);
  assert.equal(list[1].targetSets, 3, "the input isn't changed");
  assert.equal(applySplitEdit(list, { index: 1, exerciseId: b("Bench Press"), fields: { targetSets: 4 } }), null);
  const added = applySplitEdit(list, { add: lift("Hip Thrust", 2) });
  assert.equal(added.length, 3);
  assert.equal(applySplitEdit(added, { add: lift("Hip Thrust", 2) }).length, 3);
});

test("an empty split isn't ready and has nothing to suggest", () => {
  const result = analyze([day("rest", 0, { rest: true })]);
  assert.equal(result.ready, false);
  assert.deepEqual(result.suggestions, []);
});

test("lifts this week count finished lifting sessions with a completed working set", () => {
  const day = 86_400_000;
  const lifted = (id, ago, extra = {}) => workout(id, NOW - ago * day, "push", [entry("bench", [set(100, 5)])], extra);
  const workouts = [
    lifted("a", 1),
    lifted("b", 3),
    lifted("old", 8),
    lifted("rest", 2, { rest: true }),
    workout("empty", NOW - 2 * day, "push", [entry("bench", [{ ...set(100, 5), done: false }])]),
    workout("warmup", NOW - 2 * day, "push", [entry("bench", [set(45, 10, { type: "warmup" })])]),
    { ...lifted("open", 1), finishedAt: null },
    lifted("gone", 1, { deleted: true })
  ];
  assert.equal(liftsThisWeek(workouts, NOW), 2);
  assert.equal(REVIEW_MIN_LIFTS, 3);
});

test("an exercise's own secondary muscles replace the ones inferred from its name", () => {
  const press = { name: "Incline Dumbbell Press", muscle: "chest" };
  assert.deepEqual(indirectMuscles(press), ["triceps", "shoulders"], "inferred from the name");
  assert.deepEqual(inferredSecondary(press), ["triceps", "shoulders"]);
  assert.deepEqual(indirectMuscles({ ...press, secondary: ["shoulders"] }), ["shoulders"]);
  assert.deepEqual(indirectMuscles({ ...press, secondary: [] }), [], "an empty list means none");
  assert.deepEqual(indirectMuscles({ ...press, secondary: ["chest", "triceps", "triceps", "cardio", 5] }), ["triceps"], "not the primary, no repeats or junk");
  const custom = { name: "Cable Y-Raise", muscle: "shoulders", secondary: ["back"] };
  assert.deepEqual(indirectMuscles(custom), ["back"]);
});

test("secondary muscles count half a set in weekly sets and the split analyzer", () => {
  // One day a week (7-day rotation) so sets per week equal target sets.
  const index = new Map([
    ["y", { id: "y", name: "Cable Y-Raise", muscle: "shoulders", track: "strength", secondary: ["back"] }],
    ["row", { id: "row", name: "Seal Row", muscle: "back", track: "strength", secondary: [] }]
  ]);
  const days = [{ id: "d", position: 0, exercises: [{ exerciseId: "y", targetSets: 4 }, { exerciseId: "row", targetSets: 6 }] }, ...Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, position: i + 1, rest: true }))];
  const weekly = splitWeeklySets(days, index);
  assert.equal(weekly.get("back"), 6 + 4 / 2, "the Y-raise's sets count half for back");
  assert.equal(weekly.get("biceps"), undefined, "an empty list overrides the row's inferred biceps");
  const result = analyzeSplit({ splitDays: days, exerciseIndex: index, now: NOW });
  assert.equal(result.muscles.find((m) => m.muscle === "back").before, 8);
});

test("specific muscles count toward their group", () => {
  assert.equal(muscleGroup("lats"), "back");
  assert.equal(muscleGroup("side delts"), "shoulders");
  assert.equal(muscleGroup("abductors"), "glutes");
  assert.equal(muscleGroup("adductors"), "adductors", "adductors are their own group");
  assert.equal(muscleGroup("chest"), "chest");
  const pulldown = BUILT_IN.find((e) => e.name === "Lat Pulldown");
  assert.equal(pulldown.muscle, "lats");
  assert.deepEqual(indirectMuscles(pulldown), ["biceps"], "inferred by group");
  assert.deepEqual(secondaryGroups({ name: "Seal Row", muscle: "mid back", secondary: ["lats", "biceps", "rear delts"] }), ["biceps", "shoulders"], "no half sets for its own group");
  const index = new Map([
    ["row", { id: "row", name: "Seal Row", muscle: "mid back", track: "strength", secondary: ["lats", "biceps"] }],
    ["raise", { id: "raise", name: "Cable Lateral Raise", muscle: "side delts", track: "strength" }],
    ["add", { id: "add", name: "Hip Adduction", muscle: "adductors", track: "strength" }]
  ]);
  const days = [{ id: "d", position: 0, exercises: [{ exerciseId: "row", targetSets: 4 }, { exerciseId: "raise", targetSets: 3 }, { exerciseId: "add", targetSets: 2 }] }, ...Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, position: i + 1, rest: true }))];
  const weekly = splitWeeklySets(days, index);
  assert.equal(weekly.get("back"), 4);
  assert.equal(weekly.get("biceps"), 2);
  assert.equal(weekly.get("shoulders"), 3);
  assert.equal(weekly.get("adductors"), 2);
  assert.equal(weekly.get("lats"), undefined);
  const result = analyzeSplit({ splitDays: days, exerciseIndex: index, now: NOW });
  assert.equal(result.muscles.find((m) => m.muscle === "back").before, 4);
});

const sessionAt = (id, startedAt, entries) => ({ id, kind: "workout", startedAt, finishedAt: startedAt + 3_600_000, name: "Lift", entries });
const liftSet = (exerciseId, weight, reps = 5) => ({ exerciseId, sets: [{ done: true, weight, reps }] });

test("badges are earned on the workout that crosses the line, with kg converted", () => {
  const t0 = Date.UTC(2026, 0, 5, 15);
  const week = 7 * 86_400_000;
  const workouts = [0, 1, 2, 3].map((i) => sessionAt(`w${i}`, t0 + i * week, [liftSet("b_bench-press", [135, 185, 225, 230][i])]));
  const byId = new Map(badges(workouts, { unit: "lb", timeZone: "UTC" }).map((b) => [b.id, b]));
  assert.equal(byId.get("first").earnedAt, t0);
  assert.equal(byId.get("bench-1").earnedAt, t0);
  assert.equal(byId.get("bench-2").earnedAt, t0 + 2 * week);
  assert.equal(byId.get("streak-4").earnedAt, t0 + 3 * week);
  assert.equal(byId.get("bench-3").earnedAt, null);
  assert.equal(byId.get("bench-3").progress, 230 / 315);
  assert.equal(byId.get("sessions-10").progress, 0.4);

  const kg = new Map(badges([sessionAt("k", t0, [liftSet("b_bench-press", 103)])], { unit: "kg" }).map((b) => [b.id, b]));
  assert.ok(kg.get("bench-2").earnedAt, "103 kg is over 225 lb");
  const ratio = new Map(badges([sessionAt("r", t0, [liftSet("b_deadlift", 300)])], { bodyweights: [{ date: "2026-01-01", weight: 150 }] }).map((b) => [b.id, b]));
  assert.ok(ratio.get("deadlift-bw").earnedAt, "twice bodyweight");
  const early = badges([sessionAt("e", Date.UTC(2026, 0, 5, 11), [liftSet("b_bench-press", 95)])], { timeZone: "America/New_York" }).find((b) => b.id === "early-10");
  assert.equal(early.progress, 0.1, "6am in New York counts as early");
});

test("profile summaries, sharing filters and comparing lifts across units", () => {
  const index = new Map(BUILT_IN.map((e) => [e.id, e]));
  index.set("x_y", { id: "x_y", name: "Cable Y-Raise", muscle: "side delts", track: "strength" });
  const t0 = Date.UTC(2026, 0, 5, 15);
  const workouts = [sessionAt("a", t0, [liftSet("b_bench-press", 200), liftSet("x_y", 20, 12)]), sessionAt("b", t0 + 86_400_000, [liftSet("b_bench-press", 210)])];
  const mine = profileSummary({ workouts, exerciseIndex: index, bodyweights: [{ date: "2026-01-01", weight: 200 }], settings: { unit: "lb" }, now: t0 + 2 * 86_400_000 });
  assert.equal(mine.totalSessions, 2);
  assert.deepEqual(mine.lifts.map((l) => l.key), ["b_bench-press", "name:cable y-raise"], "most-trained first");
  assert.deepEqual(mine.lifts[0].heaviest, { weight: 210, reps: 5 });
  assert.equal(mine.ratios["b_bench-press"], 1.23);
  assert.equal(mine.recent[0].exercises[0].weight, 210);
  assert.deepEqual(shareFilter(mine, { lifts: false, ratios: false }).lifts, null);
  assert.equal(shareFilter(mine, {}).lifts, mine.lifts);

  const theirs = { unit: "kg", lifts: [{ key: "b_bench-press", name: "Bench Press", e1rm: 100 }, { key: "name:cable y-raise", name: "Cable Y-Raise", e1rm: 10 }], ratios: null };
  const rows = compareLifts(mine, theirs);
  assert.deepEqual(rows.map((r) => [r.key, r.theirs]), [["b_bench-press", 220.46], ["name:cable y-raise", 22.05]]);
  assert.equal(rows[0].theirRatio, null);
  assert.deepEqual(compareLifts(mine, { ...theirs, lifts: null }), []);
});

test("the VIP badge is held while you're a VIP, and a pinned lift carries its PRs", () => {
  const index = new Map(BUILT_IN.map((e) => [e.id, e]));
  const t0 = Date.UTC(2026, 0, 5, 15);
  const workouts = [sessionAt("a", t0, [liftSet("b_squat", 0), liftSet("b_back-squat", 275, 3)]), sessionAt("b", t0 + 86_400_000, [liftSet("b_back-squat", 265, 6)])];
  const vip = badges(workouts, { vip: true, now: 42 }).find((b) => b.id === "vip");
  assert.equal(vip.earnedAt, 42);
  assert.equal(vip.status, "VIP member");
  assert.equal(badges(workouts).find((b) => b.id === "vip").earnedAt, null);
  const summary = profileSummary({ workouts, exerciseIndex: index, settings: { pinnedLift: "b_back-squat" }, vip: true, now: t0 + 2 * 86_400_000 });
  assert.equal(summary.pinned.name, "Back Squat");
  assert.deepEqual(summary.pinned.heaviest, { weight: 275, reps: 3, date: t0 });
  assert.equal(summary.pinned.e1rm.value, 318);
  assert.equal(summary.pinned.e1rm.date, t0 + 86_400_000);
  assert.equal(shareFilter(summary, { lifts: false }).pinned, summary.pinned, "pinned survives the share filter");
  assert.equal(profileSummary({ workouts, exerciseIndex: index, settings: {} }).pinned, null);
});

test("leaderboard ranks friends by workouts and by a lift in your unit", () => {
  const person = (username, sessionsThisWeek, unit, lifts, pinned = null, me = false) => ({ username, name: username, me, summary: { sessionsThisWeek, unit, lifts, pinned } });
  const board = leaderboard([person("me", 2, "lb", [{ key: "b_bench-press", name: "Bench Press", e1rm: 220 }], null, true), person("kg", 3, "kg", [{ key: "b_bench-press", name: "Bench Press", e1rm: 110 }]), person("hidden", 1, "lb", null, { key: "b_bench-press", name: "Bench Press", e1rm: { value: 300 } }), person("none", 0, "lb", [])], "b_bench-press", "lb");
  assert.deepEqual(board.week.map((r) => r.username), ["kg", "me", "hidden", "none"]);
  assert.deepEqual(board.lift.rows.map((r) => [r.username, r.value]), [["hidden", 300], ["kg", 242.51], ["me", 220]]);
  assert.equal(board.lift.name, "Bench Press");
  assert.equal(leaderboard([], "").lift, null);
  assert.equal(usernameProblem(cleanUsername(" @Zach_H ")), "");
  assert.notEqual(usernameProblem("me"), "");
});

test("names others see are filtered without catching ordinary names", () => {
  for (const fine of ["Grace Hancock", "Charles Dickens", "Nazir", "grape.lifts", "analysis_guy", "Scunthorpe", "Cassidy", "raccoon_77"]) assert.equal(nameProblem(fine), "", fine);
  for (const bad of ["sh1t lifter", "big_c0ck", "FUCKBOY", "n1gger", "anal.king"]) assert.notEqual(nameProblem(bad), "", bad);
  assert.notEqual(usernameProblem("sh1t.lifter"), "", "usernames go through the same filter");
});

test("an account from before several splits has one split, its days, and it's current", () => {
  const days = [day("b", 1), day("a", 0), day("gone", 2, { deleted: true })];
  const [only, ...rest] = listSplits([], days, {});
  assert.equal(rest.length, 0);
  assert.equal(only.id, MAIN_SPLIT);
  assert.equal(only.name, MAIN_SPLIT_NAME);
  assert.equal(only.current, true);
  assert.deepEqual(only.days.map((d) => d.id), ["a", "b"]);
  assert.equal(listSplits([], [], {})[0].id, MAIN_SPLIT, "a new account starts with an empty one");
  assert.equal(findCurrentSplit([], days, undefined).id, MAIN_SPLIT);
});

test("a new split doesn't take over until it's chosen, and a bad choice falls back", () => {
  const ski = { id: "ski", kind: "split", name: "Ski", createdAt: 5 };
  const days = [day("m1", 0), day("s1", 0, { splitId: "ski" }), day("s2", 1, { splitId: "ski" })];
  const list = listSplits([ski], days, {});
  assert.deepEqual(list.map((s) => [s.id, s.current, s.days.length]), [[MAIN_SPLIT, true, 1], ["ski", false, 2]]);
  assert.equal(findCurrentSplit([ski], days, { currentSplit: "ski" }).id, "ski");
  assert.equal(findCurrentSplit([ski], days, { currentSplit: "gone" }).id, MAIN_SPLIT, "a split deleted on another device");
  assert.equal(listSplits([{ ...ski, deleted: true }], days, {}).length, 1);
  // A new account's first split from an assistant still isn't current.
  assert.equal(findCurrentSplit([ski], [], {}).id, MAIN_SPLIT);
  // Renaming gives the main split a record that replaces the implied one.
  assert.deepEqual(listSplits([{ id: MAIN_SPLIT, kind: "split", name: "Strength" }, ski], days, {}).map((s) => s.name), ["Strength", "Ski"]);
});

test("a deleted main split stays gone unless days without a split turn up", () => {
  const ski = { id: "ski", kind: "split", name: "Ski", createdAt: 5 };
  const settings = { currentSplit: "ski" };
  const tombstone = { id: MAIN_SPLIT, kind: "split", deleted: true };
  assert.deepEqual(listSplits([ski, tombstone], [day("s1", 0, { splitId: "ski" }), day("m1", 0, { deleted: true })], settings).map((s) => s.id), ["ski"]);
  assert.deepEqual(listSplits([ski, tombstone], [day("m1", 0)], settings).map((s) => s.id).sort(), ["ski", MAIN_SPLIT].sort(), "an imported backup's days still show");
});

test("each split keeps its own place in the rotation, whichever is current", () => {
  const ski = { id: "ski", kind: "split", name: "Ski", createdAt: 5 };
  const days = [day("m1", 0), day("m2", 1), day("m3", 2), day("s1", 0, { splitId: "ski" }), day("s2", 1, { splitId: "ski" })];
  const logged = [workout("w1", 1000, "m1"), workout("w2", 2000, "m2"), workout("w3", 3000, "s1")];
  const next = (settings) => nextSplitDay(findCurrentSplit([ski], days, settings).days, logged).day.id;
  assert.equal(next({ currentSplit: "ski" }), "s2");
  assert.equal(next({ currentSplit: MAIN_SPLIT }), "m3", "the last workout from the other split doesn't move this one");
  assert.equal(next({}), "m3");
});

test("deleting a split's days leaves history pointing at them", () => {
  const days = [day("s1", 0, { splitId: "ski", deleted: true })];
  const logged = [workout("w1", 1000, "s1", [entry("x", [set(100, 5)])])];
  assert.equal(previousSession(logged, workout("w2", 2000, "s1")).id, "w1");
  assert.equal(listSplits([], days, {})[0].days.length, 0);
  assert.equal(splitIdOf({ splitId: "ski" }), "ski");
  assert.equal(splitIdOf({}), MAIN_SPLIT);
});

test("the coaching summary names the current split", () => {
  assert.equal(coachingContext({ splitName: "Ski", splitDays: [day("a", 0)] }).currentSplit, "Ski");
  assert.equal(coachingContext({}).currentSplit, null);
});

test("only connector sources count as from an assistant", () => {
  for (const source of ["chatgpt", "claude"]) assert.equal(fromAssistant({ source }), true);
  for (const record of [{ source: "manual" }, {}, null]) assert.equal(fromAssistant(record), false);
});

test("sync keeps the newest edit of a record, and a tie keeps the local copy", async () => {
  const { newer } = await import("../src/lib/model.js");
  const local = { id: "a", updatedAt: 5 };
  assert.equal(newer(local, { id: "a", updatedAt: 6 }).updatedAt, 6);
  assert.equal(newer(local, { id: "a", updatedAt: 4 }), local);
  assert.equal(newer(local, { id: "a", updatedAt: 5 }), local, "a tie keeps what's here");
  assert.equal(newer(undefined, local), local);
  assert.equal(newer(local, null), local);
  assert.equal(newer({ id: "a" }, { id: "a", updatedAt: 1 }).updatedAt, 1, "a missing stamp counts as zero");
});

test("weights convert between kg and lb and back", async () => {
  const { convertWeight } = await import("../src/lib/model.js");
  assert.equal(convertWeight(100, "lb", "lb"), 100);
  assert.ok(Math.abs(convertWeight(100, "kg", "lb") - 220.462) < 1e-9);
  assert.ok(Math.abs(convertWeight(convertWeight(225, "lb", "kg"), "kg", "lb") - 225) < 1e-9);
});

test("keepIfSame hands back the old array only when every item is the same object", async () => {
  const { keepIfSame } = await import("../src/lib/model.js");
  const a = { id: "a" };
  const b = { id: "b" };
  const previous = [a, b];
  assert.equal(keepIfSame(previous, [a, b]), previous);
  const reordered = [b, a];
  assert.equal(keepIfSame(previous, reordered), reordered);
  const copied = [a, { ...b }];
  assert.equal(keepIfSame(previous, copied), copied, "an edited record is a new object");
  const shorter = [a];
  assert.equal(keepIfSame(previous, shorter), shorter);
});

test("the exercise index puts stored records over the library, deleted ones included", async () => {
  const { indexExercises } = await import("../src/lib/exercises.js");
  const bench = BUILT_IN.find((e) => e.id === "b_bench-press");
  const index = indexExercises([{ id: bench.id, kind: "exercise", note: "Seat 4" }, { id: "x_mine", kind: "exercise", name: "Mine", deleted: true }]);
  assert.equal(index.size, BUILT_IN.length + 1);
  assert.equal(index.get(bench.id).name, bench.name, "an override keeps the library fields it doesn't change");
  assert.equal(index.get(bench.id).note, "Seat 4");
  assert.equal(index.get("x_mine").deleted, true);
  assert.equal(indexExercises().size, BUILT_IN.length);
});
