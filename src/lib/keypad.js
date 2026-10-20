// State and logic for the number pad (the UI is components/keypad.tsx).
// Each field has its own step and format: weight steps by your weight jump,
// reps by 1, incline by 0.5%, speed by 0.1, and time by 15 s with
// microwave-style entry (2-0-3-0 is 20:30). Next walks the exercise's fields
// in order, then on to the next set and the next exercise. A hardware
// keyboard works too.
import { signal } from "@preact/signals-core";
import { exerciseIndex, records, settings, update } from "./store.js";
import { FIELDS, trackOf } from "./model.js";
import { digitsFromSeconds, secondsFromDigits } from "./format.js";
import { haptic } from "./haptics.js";

// { workoutId, entryId, setId, field, text, fresh, placeholder }
export const pad = signal(null);

export const FIELD = {
  weight: { decimal: true, max: 2000, step: () => settings.value.step },
  reps: { decimal: false, max: 999, step: () => 1 },
  incline: { decimal: true, max: 40, step: () => 0.5 },
  speed: { decimal: true, max: 40, step: () => 0.1 },
  seconds: { time: true, max: 99 * 60 + 59, step: () => 15 }
};

const isTime = (field) => Boolean(FIELD[field]?.time);
const textOf = (field, value) => (value == null ? "" : isTime(field) ? digitsFromSeconds(value) : String(value));
const parse = (field, text) => (isTime(field) ? secondsFromDigits(text) : text === "" || text === "." ? null : Number(text));

export function openPad(target) {
  pad.value = { ...target, text: textOf(target.field, target.value), fresh: true };
}

export function closePad() {
  pad.value = null;
}

export function locate(target) {
  const workout = records.value.get(target?.workoutId);
  const entryIndex = workout?.entries.findIndex((entry) => entry.id === target.entryId) ?? -1;
  const entry = workout?.entries[entryIndex];
  const setIndex = entry?.sets.findIndex((set) => set.id === target.setId) ?? -1;
  return { workout, entry, entryIndex, set: entry?.sets[setIndex], setIndex };
}

export const fieldsFor = (entry) => FIELDS[trackOf(exerciseIndex.value.get(entry?.exerciseId))];

function write(target, value) {
  return update(target.workoutId, (draft) => {
    const set = draft.entries.find((e) => e.id === target.entryId)?.sets.find((s) => s.id === target.setId);
    if (set) set[target.field] = value;
  });
}

// The workout page renders each field with its greyed-out number.
function placeholderOf(setId, field) {
  const value = document.querySelector(`[data-cell="${setId}-${field}"]`)?.dataset.placeholder;
  return value === undefined || value === "" ? null : Number(value);
}

// What's in the field now: what's being typed, else the saved value (which
// may have been filled some other way, like copying Previous), else the
// greyed-out number.
export function currentValue(target) {
  const typed = target.fresh ? null : parse(target.field, target.text);
  return typed ?? locate(target).set?.[target.field] ?? target.placeholder ?? 0;
}

export function press(key) {
  const target = pad.value;
  if (!target) return;
  const config = FIELD[target.field] || FIELD.reps;
  let text = target.fresh ? "" : target.text;
  if (/^\d$/.test(key)) {
    if (text.replace(".", "").length >= (config.time ? 4 : 6)) return;
    if (text === "0") text = "";
    text += key;
  } else if (key === ".") {
    if (!config.decimal || text.includes(".")) return;
    text = (text || "0") + ".";
  } else if (key === "back") {
    text = target.fresh ? "" : text.slice(0, -1);
  } else if (key === "minus" || key === "plus") {
    const step = config.step();
    const current = currentValue(target);
    const next = Math.min(config.max, Math.max(0, Math.round((current + (key === "plus" ? step : -step)) * 1000) / 1000));
    haptic(6);
    pad.value = { ...target, text: textOf(target.field, next), fresh: true };
    return write(target, next);
  } else return;
  const value = parse(target.field, text);
  if (value !== null && value > config.max) return;
  pad.value = { ...target, text, fresh: false };
  write(target, value);
}

// Through this exercise's fields, then the next unfinished set, then the
// next exercise's first unfinished set. Closes after the last one.
export function next() {
  const target = pad.value;
  if (!target) return;
  const { workout, entry, entryIndex, set, setIndex } = locate(target);
  if (!set) return closePad();
  // Leaving a field empty accepts the greyed-out number.
  if (set[target.field] == null && target.placeholder != null) write(target, target.placeholder);
  const go = (e, s, field) => openPad({ workoutId: workout.id, entryId: e.id, setId: s.id, field, value: s[field], placeholder: placeholderOf(s.id, field) });
  const fields = fieldsFor(entry);
  const at = fields.indexOf(target.field);
  if (at >= 0 && at < fields.length - 1) return go(entry, set, fields[at + 1]);
  const after = entry.sets.slice(setIndex + 1).find((s) => !s.done);
  if (after) return go(entry, after, fields[0]);
  for (const other of workout.entries.slice(entryIndex + 1)) {
    const open = other.sets.find((s) => !s.done);
    if (open) return go(other, open, fieldsFor(other)[0]);
  }
  closePad();
}

function onKeyDown(event) {
  if (!pad.value || event.target.closest?.("input, textarea")) return;
  const map = { Backspace: "back", Delete: "back", ArrowUp: "plus", ArrowDown: "minus", "+": "plus", "-": "minus", ",": "." };
  const key = map[event.key] || event.key;
  if (/^\d$/.test(key) || ["back", "plus", "minus", "."].includes(key)) {
    event.preventDefault();
    press(key);
  } else if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    next();
  } else if (event.key === "Escape") closePad();
}
document.addEventListener("keydown", onKeyDown);
