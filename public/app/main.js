// Lift: app shell, tab bar and page routing.
import { render } from "preact";
import { effect } from "@preact/signals";
import { html } from "./html.js";
import { Icon } from "./icons.js";
import { AlertHost, ToastHost, toast } from "./ui.js";
import { activeWorkout, load, loaded, settings } from "./store.js";
import { startSync } from "./sync.js";
import { go, route } from "./router.js";
import { now, restTimer } from "./timer.js";
import { Keypad, pad } from "./keypad.js";
import { applyAppearance } from "./theme.js";
import { Today } from "./pages/today.js";
import { RestBar, WorkoutPage } from "./pages/workout.js";
import { History, WorkoutDetail } from "./pages/history.js";
import { ExerciseDetail, Progress } from "./pages/progress.js";
import { BodyweightPage } from "./pages/bodyweight.js";
import { DayEditor, Split } from "./pages/split.js";
import { Settings } from "./pages/settings.js";
import * as format from "./format.js";

const TABS = [
  { page: "today", label: "Today", icon: "today", match: ["today"] },
  { page: "history", label: "History", icon: "history", match: ["history"] },
  { page: "progress", label: "Progress", icon: "progress", match: ["progress", "exercise", "bodyweight"] },
  { page: "split", label: "Split", icon: "split", match: ["split"] },
  { page: "settings", label: "Settings", icon: "settings", match: ["settings"] }
];

function Page() {
  const { page, id } = route.value;
  if (page === "workout" && id) return html`<${WorkoutPage} id=${id} key=${id} />`;
  if (page === "history") return id ? html`<${WorkoutDetail} id=${id} key=${id} />` : html`<${History} />`;
  if (page === "progress") return html`<${Progress} />`;
  if (page === "exercise" && id) return html`<${ExerciseDetail} id=${id} key=${id} />`;
  if (page === "bodyweight") return html`<${BodyweightPage} />`;
  if (page === "split") return id ? html`<${DayEditor} id=${id} key=${id} />` : html`<${Split} />`;
  if (page === "settings") return html`<${Settings} />`;
  return html`<${Today} />`;
}

function TabBar() {
  const { page } = route.value;
  return html`
    <nav class="tabbar" aria-label="Main">
      ${TABS.map((tab) => {
        const on = tab.match.includes(page);
        return html`<a href=${`#/${tab.page}`} class=${on ? "on" : ""} aria-current=${on ? "page" : undefined}><${Icon} name=${tab.icon} size=${25} stroke=${on ? 2.3 : 1.8} /><span>${tab.label}</span></a>`;
      })}
    </nav>`;
}

// Brings you back to a workout in progress from any other screen.
function MiniPlayer() {
  const active = activeWorkout.value;
  if (!active || restTimer.value) return null;
  return html`
    <button class="miniplayer" onClick=${() => go(`workout/${active.id}`)}>
      <span class="live-dot"></span><strong class="grow">${active.name}</strong><span class="timer">${format.clock((now.value - active.startedAt) / 1000)}</span><${Icon} name="chevronUp" size=${18} stroke=${2.6} />
    </button>`;
}

function App() {
  if (!loaded.value) return null;
  const inWorkout = route.value.page === "workout";
  const padOpen = Boolean(pad.value);
  return html`
    <main class=${`app ${inWorkout ? "bare" : ""} ${padOpen ? "with-pad" : ""}`}>
      <${Page} />
    </main>
    <div class=${`dock ${inWorkout ? "bare" : ""} ${padOpen ? "over-pad" : ""}`}>
      <${RestBar} />
      ${inWorkout || route.value.page === "today" ? null : html`<${MiniPlayer} />`}
    </div>
    ${inWorkout ? html`<${Keypad} />` : html`<${TabBar} />`}
    <${AlertHost} />
    <${ToastHost} />`;
}

render(html`<${App} />`, document.getElementById("app"));

load().then(() => {
  effect(() => applyAppearance({ theme: settings.value.theme, tint: settings.value.tint }));
  startSync();
  const signin = new URLSearchParams(location.search).get("signin");
  if (signin) {
    toast({ expired: "Sign-in timed out. Try again.", failed: "GitHub sign-in failed.", denied: "That GitHub account isn't allowed." }[signin] || "Sign-in didn't work.", { icon: "x" });
    history.replaceState(null, "", location.pathname + location.hash);
  }
});

// Locally the service worker would serve the previous build after every
// change, so it only runs there with ?sw in the URL (for offline testing).
const local = location.hostname === "localhost" && !new URLSearchParams(location.search).has("sw");
if ("serviceWorker" in navigator && !local) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
} else if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((list) => list.forEach((r) => r.unregister())).catch(() => {});
}
