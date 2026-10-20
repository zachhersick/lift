import { test } from "node:test";
import assert from "node:assert/strict";
import {
  e1rm, exerciseHistory, isPersonalRecord, nextSplitDay, personalRecords, placeholderFor,
  previousEntry, startOfWeek, suggestion, trend, workoutFromDay, workoutVolume
} from "../public/app/model.js";

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
