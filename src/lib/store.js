// App state: every record in memory as signals, saved to IndexedDB on each
// change and queued for sync. Pages read the computed views below and write
// through save/update/remove.
import { computed, signal } from "@preact/signals-core";
import { BUILT_IN } from "./exercises.js";
import { BARS, bodyweightId, dateKey, energyPlan, finished, insights, live, newer, orderedDays, PLATES, uid } from "./model.js";
import * as db from "./db.js";

export const DEFAULT_SETTINGS = { id: "settings", kind: "settings", unit: "lb", step: 5, defaultRest: 120, sound: true, theme: "system", tint: "blue", weeklyGoal: null, goal: "maintain", calorieTarget: null, proteinTarget: null, timeZone: null };

export const records = signal(new Map());
export const loaded = signal(false);
export const pending = signal(0);

let onLocalChange = () => {};
export function whenChanged(fn) {
  onLocalChange = fn;
}

const ofKind = (kind) => computed(() => [...records.value.values()].filter((record) => record.kind === kind));

const storedExercises = ofKind("exercise");
export const splitDaysAll = ofKind("splitDay");
export const workoutsAll = ofKind("workout");
const bodyweightsAll = ofKind("bodyweight");
const mealsAll = ofKind("meal");
const reviewsAll = ofKind("coachReview");

// Bar and plates default to the unit's standard set until you change them.
export const settings = computed(() => {
  const stored = { ...DEFAULT_SETTINGS, ...(records.value.get("settings") || {}) };
  const unit = stored.unit === "kg" ? "kg" : "lb";
  const tint = stored.tint === "indigo" ? "violet" : stored.tint;
  return { ...stored, tint, unit, barWeight: stored.barWeight ?? BARS[unit][0], plates: stored.plates?.length ? stored.plates : PLATES[unit] };
});
export const splitDays = computed(() => orderedDays(splitDaysAll.value));
export const workouts = computed(() => live(workoutsAll.value));
export const finishedWorkouts = computed(() => finished(workoutsAll.value));
// Logged training sessions, without the "rest day done" markers.
export const sessions = computed(() => finishedWorkouts.value.filter((workout) => !workout.rest));
export const activeWorkout = computed(() => workouts.value.filter((workout) => !workout.finishedAt).sort((a, b) => b.startedAt - a.startedAt)[0] || null);

// Every exercise by id, deleted ones included so old workouts keep their names.
export const exerciseIndex = computed(() => {
  const index = new Map(BUILT_IN.map((exercise) => [exercise.id, exercise]));
  for (const record of storedExercises.value) index.set(record.id, { ...index.get(record.id), ...record });
  return index;
});
export const exercises = computed(() => [...exerciseIndex.value.values()].filter((exercise) => !exercise.deleted).sort((a, b) => a.name.localeCompare(b.name)));

// Logged bodyweight, newest first.
export const bodyweights = computed(() => live(bodyweightsAll.value).sort((a, b) => b.date.localeCompare(a.date)));

// Meals, newest first, and today's nutrition targets from your goal and the
// maintenance worked out from your log and weigh-ins.
export const meals = computed(() => live(mealsAll.value).sort((a, b) => b.date.localeCompare(a.date) || (b.eatenAt || 0) - (a.eatenAt || 0)));
export const energy = computed(() => energyPlan(mealsAll.value, bodyweightsAll.value, settings.value));
export const maintenance = computed(() => energy.value.maintenance);
export const targets = computed(() => energy.value.targets);

// The Coach's cards, and the weekly reviews Claude wrote, newest first.
export const coach = computed(() => insights({ workouts: workoutsAll.value, meals: mealsAll.value, bodyweights: bodyweightsAll.value, settings: settings.value, exerciseIndex: exerciseIndex.value, splitDays: splitDaysAll.value }));
export const coachReviews = computed(() => live(reviewsAll.value).sort((a, b) => b.date.localeCompare(a.date)));

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

export function exerciseName(id) {
  return exerciseIndex.value.get(id)?.name || "Unknown exercise";
}

export async function load() {
  const list = await db.loadRecords();
  records.value = new Map(list.map((record) => [record.id, record]));
  pending.value = (await db.loadOutbox()).length;
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
  pending.value = (await db.loadOutbox()).length;
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
  pending.value = (await db.loadOutbox()).length;
  onLocalChange();
  return accepted.length;
}

export function exportData() {
  return { app: "lift", version: 1, exportedAt: new Date().toISOString(), records: [...records.value.values()] };
}
