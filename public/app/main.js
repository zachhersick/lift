// Lift: app shell, tab bar and page routing.
import { render } from "preact";
import { html } from "./html.js";
import { Icon } from "./icons.js";
import { ConfirmHost, ToastHost, toast } from "./ui.js";
import { activeWorkout, load, loaded } from "./store.js";
import { startSync } from "./sync.js";
import { go, route } from "./router.js";
import { adjustRest, now, restTimer, stopRest } from "./timer.js";
import { Today } from "./pages/today.js";
import { RestBar, WorkoutPage } from "./pages/workout.js";
import { History, WorkoutDetail } from "./pages/history.js";
import { ExerciseDetail, Progress } from "./pages/progress.js";
import { DayEditor, Split } from "./pages/split.js";
import { Settings } from "./pages/settings.js";
import * as format from "./format.js";

const TABS = [
  { page: "today", label: "Today", icon: "today", match: ["today", "workout"] },
  { page: "history", label: "History", icon: "history", match: ["history"] },
  { page: "progress", label: "Progress", icon: "progress", match: ["progress", "exercise"] },
  { page: "split", label: "Split", icon: "split", match: ["split"] },
  { page: "settings", label: "Settings", icon: "settings", match: ["settings"] }
];

function Page() {
  const { page, id } = route.value;
  if (page === "workout" && id) return html`<${WorkoutPage} id=${id} />`;
  if (page === "history") return id ? html`<${WorkoutDetail} id=${id} />` : html`<${History} />`;
  if (page === "progress") return html`<${Progress} />`;
  if (page === "exercise" && id) return html`<${ExerciseDetail} id=${id} />`;
  if (page === "split") return id ? html`<${DayEditor} id=${id} />` : html`<${Split} />`;
  if (page === "settings") return html`<${Settings} />`;
  return html`<${Today} />`;
}

function TabBar() {
  const { page } = route.value;
  return html`
    <nav class="tabbar" aria-label="Main">
      ${TABS.map((tab) => {
        const on = tab.match.includes(page);
        return html`<a href=${`#/${tab.page}`} class=${on ? "on" : ""} aria-current=${on ? "page" : undefined}><${Icon} name=${tab.icon} size=${24} stroke=${on ? 2.3 : 1.9} /><span>${tab.label}</span></a>`;
      })}
    </nav>`;
}

// A strip above the tabs that brings you back to a workout in progress.
function LiveStrip() {
  const active = activeWorkout.value;
  const { page, id } = route.value;
  if (!active || (page === "workout" && id === active.id) || restTimer.value) return null;
  return html`
    <button class="live-strip" onClick=${() => go(`workout/${active.id}`)}>
      <span class="pulse"></span><strong>${active.name}</strong><span class="grow"></span><span class="live-time">${format.clock((now.value - active.startedAt) / 1000)}</span><${Icon} name="up" size=${18} />
    </button>`;
}

function App() {
  if (!loaded.value) return html`<div class="splash"><div class="splash-mark"></div></div>`;
  return html`
    <main class="app">
      <${Page} />
    </main>
    <div class="dock">
      <${RestBar} timer=${restTimer.value} adjust=${adjustRest} skip=${stopRest} />
      <${LiveStrip} />
      <${TabBar} />
    </div>
    <${ConfirmHost} />
    <${ToastHost} />`;
}

render(html`<${App} />`, document.getElementById("app"));

load().then(() => {
  startSync();
  const signin = new URLSearchParams(location.search).get("signin");
  if (signin) {
    toast({ expired: "Sign-in timed out. Try again.", failed: "GitHub sign-in failed.", denied: "That GitHub account isn't allowed." }[signin] || "Sign-in didn't work.");
    history.replaceState(null, "", location.pathname + location.hash);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
