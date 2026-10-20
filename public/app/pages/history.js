// History: a month calendar with workout days marked, every past workout,
// and the detail/summary view for one workout.
import { useMemo, useState } from "preact/hooks";
import { html } from "../html.js";
import { Icon } from "../icons.js";
import { ask, Empty, Header, Stat } from "../ui.js";
import { exerciseName, records, remove, sessions, settings } from "../store.js";
import { byNewest, exerciseHistory, isPersonalRecord, personalRecords, workoutSetCount, workoutVolume } from "../model.js";
import { go, route } from "../router.js";
import * as format from "../format.js";

const dayKey = (time) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function History() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const unit = settings.value.unit;
  const list = useMemo(() => [...sessions.value].sort(byNewest), [sessions.value]);
  const trained = useMemo(() => new Set(list.map((w) => dayKey(w.startedAt))), [list]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const workout of list) {
      const label = format.date(workout.startedAt, { month: "long", year: "numeric" });
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(workout);
    }
    return [...map.entries()];
  }, [list]);

  return html`
    <div class="page">
      <${Header} title="History" subtitle=${list.length ? `${format.plural(list.length, "workout")} logged` : ""} />
      <${Calendar} month=${month} setMonth=${setMonth} trained=${trained} />
      ${!list.length ? html`<${Empty} icon="history" title="No workouts yet">Finished workouts show up here.</${Empty}>` : null}
      ${groups.map(([label, items]) => html`
        <section class="section">
          <h2 class="section-title">${label}</h2>
          <div class="stack">
            ${items.map((workout) => html`<${WorkoutRow} workout=${workout} unit=${unit} key=${workout.id} />`)}
          </div>
        </section>`)}
    </div>`;
}

function Calendar({ month, setMonth, trained }) {
  const first = new Date(month);
  const year = first.getFullYear();
  const m = first.getMonth();
  const days = new Date(year, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const today = dayKey(Date.now());
  let count = 0;
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(html`<span class="cal-cell blank"></span>`);
  for (let day = 1; day <= days; day += 1) {
    const key = `${year}-${m}-${day}`;
    const on = trained.has(key);
    if (on) count += 1;
    cells.push(html`<span class=${`cal-cell ${on ? "on" : ""} ${key === today ? "today" : ""}`}>${day}</span>`);
  }
  const shift = (delta) => setMonth(new Date(year, m + delta, 1).getTime());
  const isCurrent = year === new Date().getFullYear() && m === new Date().getMonth();
  return html`
    <section class="card calendar">
      <div class="cal-head">
        <button class="icon-btn" onClick=${() => shift(-1)} aria-label="Previous month"><${Icon} name="left" /></button>
        <div><strong>${format.date(month, { month: "long", year: "numeric" })}</strong><span>${format.plural(count, "workout")}</span></div>
        <button class="icon-btn" onClick=${() => shift(1)} disabled=${isCurrent} aria-label="Next month"><${Icon} name="right" /></button>
      </div>
      <div class="cal-grid">
        ${["M", "T", "W", "T", "F", "S", "S"].map((d) => html`<span class="cal-dow">${d}</span>`)}
        ${cells}
      </div>
    </section>`;
}

function WorkoutRow({ workout, unit }) {
  const top = (workout.entries || []).slice(0, 3).map((entry) => exerciseName(entry.exerciseId));
  const minutes = workout.finishedAt - workout.startedAt;
  return html`
    <button class="card workout-row" onClick=${() => go(`history/${workout.id}`)}>
      <div class="workout-row-head">
        <strong>${workout.name}</strong>
        <span class="muted small">${format.relativeDay(workout.startedAt)}</span>
      </div>
      <div class="meta-line">
        <span><${Icon} name="clock" size=${14} /> ${format.duration(minutes)}</span>
        <span>${format.plural(workoutSetCount(workout), "set")}</span>
        <span>${format.volume(workoutVolume(workout), unit)}</span>
      </div>
      ${top.length ? html`<p class="muted small clamp">${top.join(" · ")}${workout.entries.length > 3 ? ` +${workout.entries.length - 3}` : ""}</p>` : null}
    </button>`;
}

export function WorkoutDetail({ id }) {
  const workout = records.value.get(id);
  const unit = settings.value.unit;
  const justFinished = route.value.query.get("done") === "1";

  const prs = useMemo(() => {
    if (!workout) return new Set();
    const found = new Set();
    for (const entry of workout.entries || []) {
      const prior = personalRecords(exerciseHistory(sessions.value, entry.exerciseId, { before: workout.startedAt, excludeId: workout.id }));
      for (const set of entry.sets) if (isPersonalRecord(set, prior)) found.add(set.id);
    }
    return found;
  }, [workout, sessions.value]);

  if (!workout || workout.deleted) return html`<div class="page"><${Header} title="Workout" backTo="history" large=${false} /><${Empty} icon="history" title="Workout not found" /></div>`;

  const del = async () => {
    if (await ask({ title: "Delete workout?", message: "This can't be undone.", confirm: "Delete", danger: true })) {
      await remove(id);
      go("history", { replace: true });
    }
  };

  return html`
    <div class="page">
      <${Header} title=${workout.name} subtitle=${`${format.date(workout.startedAt, { weekday: "long", month: "long", day: "numeric" })} · ${format.time(workout.startedAt)}`} backTo="history"
        action=${html`<button class="icon-btn" onClick=${() => go(`workout/${id}`)} aria-label="Edit workout"><${Icon} name="edit" /></button>`} />

      ${justFinished ? html`
        <section class="card done-card">
          <div class="done-icon"><${Icon} name=${prs.size ? "trophy" : "check"} size=${28} stroke=${2.4} /></div>
          <h2>${prs.size ? `Workout done, with ${format.plural(prs.size, "PR")}` : "Workout done"}</h2>
          <p class="muted">${prs.size ? "You beat your previous best. That's progressive overload." : "Logged. Next time you'll see these numbers to beat."}</p>
        </section>` : null}

      <div class="stats four">
        <${Stat} label="Time" value=${format.duration(workout.finishedAt - workout.startedAt)} />
        <${Stat} label="Sets" value=${workoutSetCount(workout)} />
        <${Stat} label="Volume" value=${format.volume(workoutVolume(workout), unit)} />
        <${Stat} label="PRs" value=${prs.size} />
      </div>

      <div class="stack">
        ${(workout.entries || []).map((entry) => {
          let n = 0;
          return html`
            <section class="card summary-card" key=${entry.id}>
              <button class="summary-head" onClick=${() => go(`exercise/${entry.exerciseId}`)}>
                <strong>${exerciseName(entry.exerciseId)}</strong>
                <${Icon} name="right" size=${18} />
              </button>
              ${entry.notes ? html`<p class="muted small">${entry.notes}</p>` : null}
              <ol class="summary-sets">
                ${entry.sets.map((set) => {
                  if (set.type !== "warmup") n += 1;
                  return html`<li class=${set.type || "working"}>
                    <span class="set-label static">${set.type === "warmup" ? "W" : set.type === "drop" ? "D" : set.type === "failure" ? "F" : n}</span>
                    <span class="grow">${format.weight(set.weight)} ${unit} × ${set.reps}</span>
                    ${prs.has(set.id) ? html`<span class="pr-pill"><${Icon} name="trophy" size=${13} /> PR</span>` : null}
                  </li>`;
                })}
              </ol>
            </section>`;
        })}
      </div>

      ${workout.notes ? html`<section class="card"><span class="eyebrow">Notes</span><p>${workout.notes}</p></section>` : null}

      <div class="row gap pad-top">
        <button class="btn secondary grow" onClick=${() => go(`workout/${id}`)}><${Icon} name="edit" size=${18} /> Edit</button>
        <button class="btn danger-text grow" onClick=${del}><${Icon} name="trash" size=${18} /> Delete</button>
      </div>
      ${justFinished ? html`<button class="btn primary block big pad-top" onClick=${() => go("today", { replace: true })}>Done</button>` : null}
    </div>`;
}
