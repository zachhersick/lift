// Things several pages do: start a workout, log a rest day, set up a split.
import { activeWorkout, currentSplit, save, saveMany, settings, splits } from "./store.js";
import { MAIN_SPLIT, uid, workoutFromDay } from "./model.js";
import { go } from "./router.js";
import { ask } from "./dialogs";

export async function startWorkout(day = null) {
  const active = activeWorkout.value;
  if (active) {
    const resume = await ask({ title: "A workout is already going", message: `Finish or discard “${active.name}” before starting another.`, confirm: "Open it" });
    if (resume) go(`workout/${active.id}`);
    return;
  }
  const workout = workoutFromDay(day, { defaultRest: settings.value.defaultRest });
  if (!day) workout.name = "Workout";
  await save(workout);
  go(`workout/${workout.id}`);
}

export function logRest(day) {
  const now = Date.now();
  return save({ id: uid("w"), kind: "workout", splitDayId: day.id, name: day.name, rest: true, startedAt: now, finishedAt: now, entries: [], notes: "" });
}

// Days of the main split carry no splitId, the same as ones from before there
// were several splits.
const inSplit = (splitId) => (splitId === MAIN_SPLIT ? {} : { splitId });
const dayCount = (splitId) => splits.value.find((split) => split.id === splitId)?.days.length || 0;

export async function applyTemplate(template, splitId = currentSplit.value.id) {
  const start = dayCount(splitId);
  await saveMany(template.days.map((day, index) => ({
    id: uid("d"),
    kind: "splitDay",
    ...inSplit(splitId),
    name: day.name,
    rest: Boolean(day.rest),
    position: start + index,
    exercises: day.exercises.map((item) => ({ ...item }))
  })));
}

export async function addDay({ rest = false, splitId = currentSplit.value.id } = {}) {
  const position = dayCount(splitId);
  const record = await save({ id: uid("d"), kind: "splitDay", ...inSplit(splitId), name: rest ? "Rest" : `Day ${position + 1}`, rest, position, exercises: [] });
  return record;
}

export function createSplit(name) {
  return save({ id: uid("split"), kind: "split", name, createdAt: Date.now(), deleted: false });
}
