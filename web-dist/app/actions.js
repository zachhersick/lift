// Things several pages do: start a workout, log a rest day, set up a split.
import { activeWorkout, save, saveMany, settings, splitDays } from "./store.js";
import { uid, workoutFromDay } from "./model.js";
import { go } from "./router.js";
import { ask } from "./ui.js";

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

export async function applyTemplate(template) {
  const start = splitDays.value.length;
  await saveMany(template.days.map((day, index) => ({
    id: uid("d"),
    kind: "splitDay",
    name: day.name,
    rest: Boolean(day.rest),
    position: start + index,
    exercises: day.exercises.map((item) => ({ ...item }))
  })));
}

export async function addDay({ rest = false } = {}) {
  const position = splitDays.value.length;
  const record = await save({ id: uid("d"), kind: "splitDay", name: rest ? "Rest" : `Day ${position + 1}`, rest, position, exercises: [] });
  return record;
}
