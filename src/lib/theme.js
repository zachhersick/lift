// Appearance: light/dark/system and the accent. Saved with the synced
// settings and mirrored in localStorage, so public/theme-init.js can apply
// it before the first paint.
export const TINTS = [
  { id: "blue", label: "Blue", colors: ["#3b82f6", "#8b5cf6", "#06b6d4"] },
  { id: "orange", label: "Orange", colors: ["#f97316", "#ef4444", "#f59e0b"] },
  { id: "green", label: "Green", colors: ["#22c55e", "#14b8a6", "#84cc16"] },
  { id: "violet", label: "Violet", colors: ["#8b5cf6", "#ec4899", "#6366f1"] },
  { id: "pink", label: "Pink", colors: ["#ec4899", "#f43f5e", "#a855f7"] },
  { id: "teal", label: "Teal", colors: ["#14b8a6", "#3b82f6", "#22d3ee"] }
];

const KEY = "lift-appearance";
const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function isDark(theme) {
  return theme === "dark" || (theme !== "light" && Boolean(media?.matches));
}

export function tintColors(id) {
  return (TINTS.find((tint) => tint.id === id) || TINTS[0]).colors;
}

export function applyAppearance({ theme = "system", tint = "blue" } = {}) {
  const root = document.documentElement;
  const dark = isDark(theme);
  root.classList.toggle("dark", dark);
  root.dataset.tint = TINTS.some((item) => item.id === tint) ? tint : "blue";
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", dark ? "#07080a" : "#f5f6f8");
  try {
    localStorage.setItem(KEY, JSON.stringify({ theme, tint }));
  } catch {}
}

media?.addEventListener?.("change", () => {
  try {
    applyAppearance(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {}
});
