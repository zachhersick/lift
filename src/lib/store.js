// App state: every record in memory as signals, saved to IndexedDB on each
// change and queued for sync. Pages read the computed views below and write
// through save/update/remove.
import { computed, signal } from "@preact/signals-core";
import { BUILT_IN, indexExercises } from "./exercises.js";
import { badges, BARS, bodyweightId, dateKey, energyPlan, finished, insights, keepIfSame, listSplits, live, MAIN_SPLIT_NAME, newer, PLATES, profileSummary, uid } from "./model.js";
import * as db from "./db.js";
import { databaseName } from "./account.js";

export const DEFAULT_SETTINGS = { id: "settings", kind: "settings", unit: "lb", step: 5, defaultRest: 120, sound: true, theme: "system", tint: "blue", weeklyGoal: null, goal: "maintain", calorieTarget: null, proteinTarget: null, timeZone: null, currentSplit: null };

export const records = signal(new Map());
export const loaded = signal(false);
export const pending = signal(0);

let onLocalChange = () => {};
export function whenChanged(fn) {
  onLocalChange = fn;
}

// Records by kind, in one pass over everything. Each kind's list keeps its
// previous array while none of its records changed, so saving a meal doesn't
// recompute views that only read workouts, and the other way round.
const byKind = computed(() => {
  const groups = new Map();
  for (const record of records.value.values()) {
    const list = groups.get(record.kind);
    if (list) list.push(record);
    else groups.set(record.kind, [record]);
  }
  return groups;
});
const ofKind = (kind) => {
  let last = [];
  return computed(() => (last = keepIfSame(last, byKind.value.get(kind) || [])));
};
const settingsRecord = computed(() => records.value.get("settings"));

const storedExercises = ofKind("exercise");
const splitRecords = ofKind("split");
const splitDaysAll = ofKind("splitDay");
export const workoutsAll = ofKind("workout");
const bodyweightsAll = ofKind("bodyweight");
const mealsAll = ofKind("meal");
const reviewsAll = ofKind("coachReview");

// Bar and plates default to the unit's standard set until you change them.
export const settings = computed(() => {
  const stored = { ...DEFAULT_SETTINGS, ...(settingsRecord.value || {}) };
  const unit = stored.unit === "kg" ? "kg" : "lb";
  const tint = stored.tint === "indigo" ? "violet" : stored.tint;
  return { ...stored, tint, unit, barWeight: stored.barWeight ?? BARS[unit][0], plates: stored.plates?.length ? stored.plates : PLATES[unit] };
});
// Every split, and the current one: its days are what Today, the Coach and
// the weekly goal work from.
export const splits = computed(() => listSplits(splitRecords.value, splitDaysAll.value, settings.value));
export const currentSplit = computed(() => splits.value.find((split) => split.current));
export const splitDays = computed(() => currentSplit.value.days);
export const workouts = computed(() => live(workoutsAll.value));
export const finishedWorkouts = computed(() => finished(workoutsAll.value));
// Logged training sessions, without the "rest day done" markers.
export const sessions = computed(() => finishedWorkouts.value.filter((workout) => !workout.rest));
export const activeWorkout = computed(() => workouts.value.filter((workout) => !workout.finishedAt).sort((a, b) => b.startedAt - a.startedAt)[0] || null);

// Every exercise by id, deleted ones included so old workouts keep their names.
export const exerciseIndex = computed(() => indexExercises(storedExercises.value));
export const exercises = computed(() => [...exerciseIndex.value.values()].filter((exercise) => !exercise.deleted).sort((a, b) => a.name.localeCompare(b.name)));

// Logged bodyweight, newest first.
export const bodyweights = computed(() => live(bodyweightsAll.value).sort((a, b) => b.date.localeCompare(a.date)));

// Meals, newest first, and today's nutrition targets from your goal and the
// maintenance worked out from your log and weigh-ins.
export const meals = computed(() => live(mealsAll.value).sort((a, b) => b.date.localeCompare(a.date) || (b.eatenAt || 0) - (a.eatenAt || 0)));
export const energy = computed(() => energyPlan(mealsAll.value, bodyweightsAll.value, settings.value));
export const maintenance = computed(() => energy.value.maintenance);
export const targets = computed(() => energy.value.targets);

// Whether you're a VIP, from the last session check; remembered per account
// so the VIP badge still shows when the app starts offline.
const vipKey = () => `lift:vip:${databaseName()}`;
function rememberedVip() {
  try {
    return localStorage.getItem(vipKey()) === "1";
  } catch {
    return false;
  }
}
export const membership = signal({ vip: rememberedVip() });
export function setMembership(vip) {
  membership.value = { vip: Boolean(vip) };
  try {
    localStorage.setItem(vipKey(), vip ? "1" : "0");
  } catch {}
}

// Your badges and the profile summary friends see (before sharing filters).
export const profile = computed(() => profileSummary({ workouts: workoutsAll.value, exerciseIndex: exerciseIndex.value, bodyweights: bodyweightsAll.value, settings: settings.value, vip: membership.value.vip }));
export const badgeList = computed(() => badges(workoutsAll.value, { bodyweights: bodyweightsAll.value, unit: settings.value.unit, timeZone: settings.value.timeZone || undefined, vip: membership.value.vip }));

// The Coach's cards, and the weekly reviews Claude wrote, newest first.
export const coach = computed(() => insights({ workouts: workoutsAll.value, meals: mealsAll.value, bodyweights: bodyweightsAll.value, settings: settings.value, exerciseIndex: exerciseIndex.value, splitDays: splitDays.value }));
export const coachReviews = computed(() => live(reviewsAll.value).sort((a, b) => b.date.localeCompare(a.date)));

// Changes a split's record. The main split gets one the first time it's renamed.
export function saveSplit(id, change) {
  return save({ id, kind: "split", name: MAIN_SPLIT_NAME, ...(records.value.get(id) || {}), ...change, deleted: false });
}

// Deletes a split and its days. Workouts logged from them stay in History.
export function removeSplit(split) {
  const { days, current, ...record } = split;
  return saveMany([{ ...record, kind: "split", deleted: true }, ...days.map((day) => ({ ...day, deleted: true }))]);
}

export function saveMeal(meal) {
  return save({ source: "manual", items: [], ...meal, id: meal.id || uid("meal"), kind: "meal", date: meal.date || dateKey(meal.eatenAt || Date.now()), deleted: false });
}

export function logBodyweight(weight, date = dateKey()) {
  return save({ id: bodyweightId(date), kind: "bodyweight", date, weight, deleted: false });
}

// Notes that stay with an exercise across workouts (seat height, grip…).
// Built-in exercises get a stored copy that overrides the library entry.
export function saveExerciseNote(id, note) {
  const base = exerciseIndex.value.get(id);
  if (!base) return null;
  return save({ ...base, kind: "exercise", note: String(note || "").trim() });
}

// Edits an exercise's name, muscle, equipment or tracking type. Built-ins
// get a stored copy that overrides the library entry, like notes do.
export function saveExercise(id, change) {
  const base = exerciseIndex.value.get(id);
  if (!base) return null;
  return save({ ...base, ...change, id, kind: "exercise", deleted: false });
}

// Puts a built-in exercise back to the library version, keeping its note.
export function resetExercise(id) {
  const original = BUILT_IN.find((exercise) => exercise.id === id);
  if (!original) return null;
  return save({ ...original, note: exerciseIndex.value.get(id)?.note || "", deleted: false });
}

export function exerciseName(id) {
  return exerciseIndex.value.get(id)?.name || "Unknown exercise";
}

export async function load() {
  const list = await db.loadRecords();
  records.value = new Map(list.map((record) => [record.id, record]));
  pending.value = await db.outboxCount();
  loaded.value = true;
}

function stamp(record) {
  const previous = records.value.get(record.id);
  return { ...record, updatedAt: Math.max(Date.now(), (previous?.updatedAt || 0) + 1) };
}

export async function saveMany(list) {
  const stamped = list.map(stamp);
  const next = new Map(records.value);
  for (const record of stamped) next.set(record.id, record);
  records.value = next;
  await db.putRecords(stamped, { outbox: true });
  pending.value = await db.outboxCount();
  onLocalChange();
  return stamped;
}

export async function save(record) {
  return (await saveMany([record]))[0];
}

// Edits a copy of a record and saves it.
export function update(id, change) {
  const current = records.value.get(id);
  if (!current) return null;
  const draft = structuredClone(current);
  change(draft);
  return save(draft);
}

export function remove(id) {
  const current = records.value.get(id) || exerciseIndex.value.get(id);
  if (!current) return null;
  return save({ ...current, deleted: true });
}

export function saveSettings(change) {
  return save({ ...settings.value, ...change, id: "settings", kind: "settings" });
}

// Copies from the server: keep whichever side was edited last.
export async function applyRemote(incoming) {
  const accepted = incoming.filter((record) => record?.id && newer(records.value.get(record.id), record) === record && record.updatedAt > (records.value.get(record.id)?.updatedAt || 0));
  if (!accepted.length) return 0;
  const next = new Map(records.value);
  for (const record of accepted) next.set(record.id, record);
  records.value = next;
  await db.putRecords(accepted);
  return accepted.length;
}

// From an exported backup: newer copies replace local ones and get synced.
export async function importRecords(list) {
  const valid = list.filter((record) => record && typeof record.id === "string" && typeof record.kind === "string" && Number.isFinite(record.updatedAt));
  const accepted = valid.filter((record) => (record.updatedAt || 0) > (records.value.get(record.id)?.updatedAt || 0));
  if (!accepted.length) return 0;
  const next = new Map(records.value);
  for (const record of accepted) next.set(record.id, record);
  records.value = next;
  await db.putRecords(accepted, { outbox: true });
  pending.value = await db.outboxCount();
  onLocalChange();
  return accepted.length;
}

export function exportData() {
  return { app: "lift", version: 1, exportedAt: new Date().toISOString(), records: [...records.value.values()] };
}
