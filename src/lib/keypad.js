// State and logic for the weight/reps number pad (the UI is
// components/keypad.tsx). ± steps by your weight jump (or 1 rep), Next walks
// weight → reps → next set → next exercise. A hardware keyboard works too.
import { signal } from "@preact/signals-core";
import { records, settings, update } from "./store.js";
import { haptic } from "./haptics.js";

// { workoutId, entryId, setId, field: "weight" | "reps", text, fresh, placeholder }
export const pad = signal(null);

export function openPad(target) {
  pad.value = { ...target, text: target.value == null ? "" : String(target.value), fresh: true };
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

const parse = (text) => (text === "" || text === "." ? null : Number(text));

// What's in the field now: what's being typed, else the saved value (which
// may have been filled some other way, like copying Previous), else the
// greyed-out number.
export function currentValue(target) {
  const typed = target.fresh ? null : parse(target.text);
  return typed ?? locate(target).set?.[target.field] ?? target.placeholder ?? 0;
}

export function press(key) {
  const target = pad.value;
  if (!target) return;
  const weight = target.field === "weight";
  let text = target.fresh ? "" : target.text;
  if (/^\d$/.test(key)) {
    if (text.replace(".", "").length >= 6) return;
    if (text === "0") text = "";
    text += key;
  } else if (key === ".") {
    if (!weight || text.includes(".")) return;
    text = (text || "0") + ".";
  } else if (key === "back") {
    text = target.fresh ? "" : text.slice(0, -1);
  } else if (key === "minus" || key === "plus") {
    const step = weight ? settings.value.step : 1;
    const current = currentValue(target);
    const next = Math.max(0, Math.round((current + (key === "plus" ? step : -step)) * 1000) / 1000);
    haptic(6);
    pad.value = { ...target, text: String(next), fresh: true };
    return write(target, next);
  } else return;
  const value = parse(text);
  if (!weight && value !== null && value > 999) return;
  pad.value = { ...target, text, fresh: false };
  write(target, value);
}

// Weight → reps on the same set → weight of the next set → the next
// exercise's first unfinished set. Closes after the last one.
export function next() {
  const target = pad.value;
  if (!target) return;
  const { workout, entry, entryIndex, set, setIndex } = locate(target);
  if (!set) return closePad();
  // Leaving a field empty accepts the greyed-out number.
  if (set[target.field] == null && target.placeholder != null) write(target, target.placeholder);
  const go = (e, s, field) => openPad({ workoutId: workout.id, entryId: e.id, setId: s.id, field, value: s[field], placeholder: placeholderOf(s.id, field) });
  if (target.field === "weight") return go(entry, set, "reps");
  const after = entry.sets.slice(setIndex + 1).find((s) => !s.done);
  if (after) return go(entry, after, "weight");
  for (const other of workout.entries.slice(entryIndex + 1)) {
    const open = other.sets.find((s) => !s.done);
    if (open) return go(other, open, "weight");
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
