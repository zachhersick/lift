// Appearance: light/dark/system and the tint color. Saved with the synced
// settings, and mirrored in localStorage so index.html can apply it before
// the first paint.
export const TINTS = [
  { id: "blue", label: "Blue", light: "#007AFF", dark: "#0A84FF" },
  { id: "orange", label: "Orange", light: "#FF9500", dark: "#FF9F0A" },
  { id: "green", label: "Green", light: "#34C759", dark: "#30D158" },
  { id: "indigo", label: "Indigo", light: "#5856D6", dark: "#5E5CE6" },
  { id: "pink", label: "Pink", light: "#FF2D55", dark: "#FF375F" },
  { id: "teal", label: "Teal", light: "#30B0C7", dark: "#40C8E0" }
];

const KEY = "lift-appearance";
const media = window.matchMedia("(prefers-color-scheme: dark)");

export function isDark(theme) {
  return theme === "dark" || (theme !== "light" && media.matches);
}

export function applyAppearance({ theme = "system", tint = "blue" } = {}) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
  root.dataset.tint = TINTS.some((item) => item.id === tint) ? tint : "blue";
  const color = isDark(theme) ? "#000000" : "#F2F2F7";
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", color);
  try {
    localStorage.setItem(KEY, JSON.stringify({ theme, tint }));
  } catch {}
}

media.addEventListener?.("change", () => {
  try {
    applyAppearance(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {}
});
