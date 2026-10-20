// Display helpers for weights, times and dates.

export function weight(value) {
  const number = Number(value) || 0;
  return String(Math.round(number * 100) / 100);
}

export function volume(value, unit = "lb") {
  const number = Math.round(Number(value) || 0);
  if (number >= 100_000) return `${(number / 1000).toFixed(0)}k ${unit}`;
  if (number >= 10_000) return `${(number / 1000).toFixed(1)}k ${unit}`;
  return `${number.toLocaleString()} ${unit}`;
}

export function clock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function duration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function rest(seconds) {
  const s = Number(seconds) || 0;
  return s % 60 ? clock(s) : `${s / 60}:00`;
}

export function date(time, options = { weekday: "short", month: "short", day: "numeric" }) {
  return new Date(time).toLocaleDateString(undefined, options);
}

export function shortDate(time) {
  const d = new Date(time);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "2-digit" });
}

export function time(value) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const DAY = 86_400_000;
const midnight = (value) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function relativeDay(value) {
  const days = Math.round((midnight(Date.now()) - midnight(value)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date(value);
}

export function ago(value) {
  const seconds = Math.round((Date.now() - value) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return relativeDay(value);
}

export const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

export const capitalize = (text) => String(text || "").replace(/^./, (c) => c.toUpperCase());
