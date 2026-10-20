// The timer for cardio and timed sets. With a target (the time you typed,
// or last time's) it counts down, beeps at zero and keeps going into
// overtime; without one it's a stopwatch. One runs at a time, and it's kept
// in localStorage so it survives iOS reloading the app.
import { signal } from "@preact/signals-core";
import { beep, stopRest } from "./timer.js";

// { workoutId, entryId, setId, name, target, startedAt, alerted, sound }
export const setTimer = signal(null);

const KEY = "lift-set-timer";
let tick = null;

function remember(value) {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {}
}

export const elapsedSeconds = (timer = setTimer.value, at = Date.now()) => (timer ? Math.max(0, Math.round((at - timer.startedAt) / 1000)) : 0);

function watch() {
  clearInterval(tick);
  tick = setInterval(() => {
    const timer = setTimer.value;
    if (!timer) return clearInterval(tick);
    if (timer.target && !timer.alerted && elapsedSeconds(timer) >= timer.target) {
      if (timer.sound !== false) beep();
      navigator.vibrate?.([200, 100, 200]);
      setTimer.value = { ...timer, alerted: true };
      remember(setTimer.value);
    }
  }, 250);
}

export function startSetTimer({ workoutId, entryId, setId, name, target = null, sound = true }) {
  stopRest();
  setTimer.value = { workoutId, entryId, setId, name, target: target > 0 ? target : null, startedAt: Date.now(), alerted: false, sound };
  remember(setTimer.value);
  watch();
}

// Ends the timer and returns what it measured; the caller logs the set.
export function takeSetTimer() {
  const timer = setTimer.value;
  if (!timer) return null;
  const seconds = elapsedSeconds(timer);
  setTimer.value = null;
  remember(null);
  clearInterval(tick);
  return { ...timer, seconds };
}

export function cancelSetTimer() {
  setTimer.value = null;
  remember(null);
  clearInterval(tick);
}

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || "null");
  if (saved?.startedAt) {
    setTimer.value = saved;
    watch();
  }
} catch {}
