// Appearance: light/dark/system and the accent. Saved with the synced
// settings and mirrored in localStorage, so public/theme-init.js can apply
// it before the first paint.
// One flat accent per tint: [light mode, dark mode]. Keep in step with the
// data-tint rules in src/styles.css.
export const TINTS = [
  { id: "blue", label: "Blue", colors: ["#2563eb", "#60a5fa"] },
  { id: "orange", label: "Orange", colors: ["#c2410c", "#fb923c"] },
  { id: "green", label: "Green", colors: ["#15803d", "#4ade80"] },
  { id: "violet", label: "Violet", colors: ["#7c3aed", "#a78bfa"] },
  { id: "pink", label: "Pink", colors: ["#db2777", "#f472b6"] },
  { id: "teal", label: "Teal", colors: ["#0f766e", "#2dd4bf"] }
];

const KEY = "lift-appearance";
const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function isDark(theme) {
  return theme === "dark" || (theme !== "light" && Boolean(media?.matches));
}

export function tintColor(id, dark) {
  const { colors } = TINTS.find((tint) => tint.id === id) || TINTS[0];
  return dark ? colors[1] : colors[0];
}

export function applyAppearance({ theme = "system", tint = "blue" } = {}) {
  const root = document.documentElement;
  const dark = isDark(theme);
  root.classList.toggle("dark", dark);
  root.dataset.tint = TINTS.some((item) => item.id === tint) ? tint : "blue";
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", dark ? "#141415" : "#fafafa");
  try {
    localStorage.setItem(KEY, JSON.stringify({ theme, tint }));
  } catch {}
}

media?.addEventListener?.("change", () => {
  try {
    applyAppearance(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {}
});
