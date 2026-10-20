// The rest timer, a once-a-second clock for elapsed times, and the screen
// wake lock used while a workout is open.
import { signal } from "@preact/signals";

export const now = signal(Date.now());
setInterval(() => (now.value = Date.now()), 1000);

// { endsAt, total } while counting down; { finishedAt } briefly after.
export const restTimer = signal(null);

let audio = null;
let tick = null;

// Called from a tap, so iOS lets the page play sound later.
export function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch {}
}

function beep() {
  if (!audio) return;
  try {
    const start = audio.currentTime;
    for (const [offset, freq] of [[0, 880], [0.18, 880], [0.36, 1320]]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.15);
      osc.connect(gain).connect(audio.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.16);
    }
  } catch {}
}

function watch(sound) {
  clearInterval(tick);
  tick = setInterval(() => {
    const timer = restTimer.value;
    if (!timer?.endsAt) return clearInterval(tick);
    now.value = Date.now();
    if (Date.now() >= timer.endsAt) {
      clearInterval(tick);
      restTimer.value = { finishedAt: Date.now() };
      if (sound) beep();
      navigator.vibrate?.([200, 100, 200]);
      setTimeout(() => {
        if (restTimer.value?.finishedAt) restTimer.value = null;
      }, 5000);
    }
  }, 250);
}

export function startRest(seconds, { sound = true } = {}) {
  if (!seconds || seconds <= 0) return;
  restTimer.value = { endsAt: Date.now() + seconds * 1000, total: seconds, sound };
  watch(sound);
}

export function adjustRest(delta) {
  const timer = restTimer.value;
  if (!timer?.endsAt) return;
  const endsAt = Math.max(Date.now() + 1000, timer.endsAt + delta * 1000);
  restTimer.value = { ...timer, endsAt, total: Math.max(timer.total + delta, 1) };
}

export function stopRest() {
  clearInterval(tick);
  restTimer.value = null;
}

let lock = null;
let wanted = false;

async function acquire() {
  try {
    if (wanted && "wakeLock" in navigator && document.visibilityState === "visible" && !lock) {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => (lock = null));
    }
  } catch {
    lock = null;
  }
}

document.addEventListener("visibilitychange", acquire);

export function keepAwake(on) {
  wanted = on;
  if (on) acquire();
  else if (lock) {
    lock.release().catch(() => {});
    lock = null;
  }
}
