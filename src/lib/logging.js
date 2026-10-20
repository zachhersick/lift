// Completing a set, shared by the row's check button and the set timer's
// Stop: fill empty fields from last time, check what's required, save,
// detect a PR, then start rest (or point to the next superset exercise).
import { closePad, pad } from "./keypad.js";
import {
  exerciseHistory, FIELDS, isComplete, isPersonalRecord, nextInSuperset, personalRecords, placeholderFor, previousEntry, restsAfter,
  suggestion, trackOf
} from "./model.js";
import { notify } from "./notify";
import { exerciseIndex, exerciseName, records, sessions, settings, update } from "./store.js";
import { startRest, unlockAudio } from "./timer.js";
import { haptic } from "./haptics.js";
import { describeSet, speedUnit } from "./format.js";
import { takeSetTimer } from "./set-timer.js";

// Everything a set row needs to know about last time.
export function setContext(workout, entry) {
  const exercise = exerciseIndex.value.get(entry.exerciseId) || { name: "Unknown exercise" };
  const track = trackOf(exercise);
  const s = settings.value;
  const scope = { before: workout.startedAt, excludeId: workout.id };
  const previous = previousEntry(sessions.value, entry.exerciseId, scope);
  const prior = personalRecords(exerciseHistory(sessions.value, entry.exerciseId, scope));
  const hint = suggestion(previous?.entry, { repMin: entry.repMin, repMax: entry.repMax }, s.step, track, speedUnit(s.unit));
  return { exercise, track, previous, prior, hint };
}

export function completeSet(workoutId, entryId, setId, patch = {}) {
  const workout = records.value.get(workoutId);
  const entries = workout?.entries || [];
  const index = entries.findIndex((e) => e.id === entryId);
  const entry = entries[index];
  const setIndex = entry?.sets.findIndex((x) => x.id === setId) ?? -1;
  const set = entry?.sets[setIndex];
  if (!set) return { ok: false };
  const s = settings.value;
  const { exercise, track, previous, prior, hint } = setContext(workout, entry);
  const ph = placeholderFor(entry, setIndex, previous?.entry, hint);

  const merged = { ...set, ...patch };
  for (const field of FIELDS[track]) {
    if (merged[field] == null && ph[field] != null) merged[field] = ph[field];
  }
  if (track === "strength" && merged.weight == null && exercise.equipment === "bodyweight") merged.weight = 0;
  if (!isComplete(merged, track)) {
    const missing = track === "strength" ? (merged.reps ? "the weight" : "reps") : "a time";
    notify(`Enter ${missing} first`, { status: "error" });
    return { ok: false };
  }

  const doneSet = { ...merged, done: true };
  update(workoutId, (draft) => {
    const target = draft.entries.find((e) => e.id === entryId);
    const at = target?.sets.findIndex((x) => x.id === setId) ?? -1;
    if (at >= 0) target.sets[at] = doneSet;
  });
  if (pad.value?.setId === setId) closePad();
  unlockAudio();
  haptic(12);

  const pr = isPersonalRecord(doneSet, prior, track);
  if (pr) {
    haptic([12, 60, 12]);
    notify("New PR", { detail: `${exercise.name} ${describeSet(doneSet, track, s.unit)}` });
  }
  if (!workout.finishedAt && set.type !== "warmup") {
    if (restsAfter(entries, index)) startRest(entry.restSec ?? s.defaultRest, { sound: s.sound });
    else {
      const nextIndex = nextInSuperset(entries, index);
      if (nextIndex !== null) notify(`Next: ${exerciseName(entries[nextIndex].exerciseId)}`, { status: "running" });
    }
  }
  return { ok: true, pr };
}

// Stop on the set timer: log the measured time on that set.
export function finishSetTimer() {
  const timer = takeSetTimer();
  if (!timer || timer.seconds <= 0) return null;
  return completeSet(timer.workoutId, timer.entryId, timer.setId, { seconds: timer.seconds });
}
