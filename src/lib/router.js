// Hash routes: #/today, #/workout/<id>, #/history, #/history/<id>,
// #/progress, #/exercise/<id>, #/bodyweight, #/nutrition, #/coach, #/split,
// #/split/<id>, #/settings.
import { signal } from "@preact/signals-core";

function parse(hash = location.hash) {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const [page = "today", id = null] = path.split("/").filter(Boolean).map(decodeURIComponent);
  return { page, id, query: new URLSearchParams(query) };
}

export const route = signal(parse());

window.addEventListener("hashchange", () => {
  route.value = parse();
  window.scrollTo(0, 0);
});

export function go(path, { replace = false } = {}) {
  const hash = `#/${path.replace(/^#?\/?/, "")}`;
  if (replace) {
    history.replaceState(null, "", hash);
    route.value = parse(hash);
    window.scrollTo(0, 0);
  } else location.hash = hash;
}

// Back within the app if we navigated here, otherwise to `fallback` (for
// example after opening a deep link from the home screen).
let navigated = false;
window.addEventListener("hashchange", () => (navigated = true));

export function back(fallback = "today") {
  if (navigated) history.back();
  else go(fallback, { replace: true });
}
