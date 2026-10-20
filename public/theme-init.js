// Applies the saved theme and accent before the app loads, so there's no
// flash of the wrong colors. Mirrors applyAppearance() in src/lib/theme.js.
(function () {
  var root = document.documentElement;
  var saved = {};
  try {
    saved = JSON.parse(localStorage.getItem("lift-appearance") || "{}");
  } catch (e) {}
  var theme = saved.theme || "system";
  var dark = theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) root.classList.add("dark");
  root.dataset.tint = saved.tint || "blue";
})();
