// History: a month calendar with training days marked, every past workout,
// and the summary of one workout compared with the last time you did that day.
import { useMemo, useState } from "preact/hooks";
import { html } from "../html.js";
import { Icon } from "../icons.js";
import { ask, Cell, Group, NavBar, Summary, Unavailable } from "../ui.js";
import { exerciseName, records, remove, sessions, settings } from "../store.js";
import { byNewest, dateKey, e1rm, exerciseHistory, isPersonalRecord, personalRecords, previousSession, workoutSetCount, workoutVolume } from "../model.js";
import { go, route } from "../router.js";
import * as format from "../format.js";

export function History() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const unit = settings.value.unit;
  const list = useMemo(() => [...sessions.value].sort(byNewest), [sessions.value]);
  const trained = useMemo(() => new Set(list.map((w) => dateKey(w.startedAt))), [list]);
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
      <${NavBar} title="History" subtitle=${list.length ? format.plural(list.length, "workout") : ""} />
      <${Group}><${Calendar} month=${month} setMonth=${setMonth} trained=${trained} /></${Group}>
      ${!list.length ? html`<${Unavailable} icon="history" title="No Workouts Yet">Finished workouts show up here.</${Unavailable}>` : null}
      ${groups.map(([label, items]) => html`
        <${Group} header=${label}>
          ${items.map((workout) => html`<${Cell} key=${workout.id} title=${workout.name}
            subtitle=${`${format.date(workout.startedAt)} · ${format.duration(workout.finishedAt - workout.startedAt)} · ${format.plural(workoutSetCount(workout), "set")}`}
            value=${format.volume(workoutVolume(workout), unit)} chevron onClick=${() => go(`history/${workout.id}`)} />`)}
        </${Group}>`)}
    </div>`;
}

function Calendar({ month, setMonth, trained }) {
  const first = new Date(month);
  const year = first.getFullYear();
  const m = first.getMonth();
  const days = new Date(year, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const today = dateKey();
  let count = 0;
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(html`<span></span>`);
  for (let day = 1; day <= days; day += 1) {
    const key = dateKey(new Date(year, m, day).getTime());
    const on = trained.has(key);
    if (on) count += 1;
    cells.push(html`<span class=${`cal-day ${on ? "on" : ""} ${key === today ? "today" : ""}`} aria-label=${`${day}${on ? ", trained" : ""}`}><span>${day}</span></span>`);
  }
  const shift = (delta) => setMonth(new Date(year, m + delta, 1).getTime());
  const isCurrent = year === new Date().getFullYear() && m === new Date().getMonth();
  return html`
    <div class="cal">
      <div class="cal-head">
        <strong>${format.date(month, { month: "long", year: "numeric" })} <span class="secondary subhead" style="font-weight:400">· ${format.plural(count, "workout")}</span></strong>
        <span class="cal-nav">
          <button onClick=${() => shift(-1)} aria-label="Previous month"><${Icon} name="chevronLeft" size=${22} stroke=${2.6} /></button>
          <button onClick=${() => shift(1)} disabled=${isCurrent} aria-label="Next month"><${Icon} name="chevronRight" size=${22} stroke=${2.6} /></button>
        </span>
      </div>
      <div class="cal-grid">
        ${["M", "T", "W", "T", "F", "S", "S"].map((d) => html`<span class="cal-dow">${d}</span>`)}
        ${cells}
      </div>
    </div>`;
}

function Delta({ now, before, unit = "", percent = false, neutral = false }) {
  if (before == null) return null;
  const diff = now - before;
  if (Math.abs(diff) < 0.5) return html`<span class="cell-value">Same</span>`;
  const text = percent && before ? `${diff > 0 ? "+" : ""}${Math.round((diff / before) * 100)}%` : `${diff > 0 ? "+" : "−"}${format.weight(Math.abs(Math.round(diff)))}${unit}`;
  return html`<span class=${`cell-value num ${neutral ? "" : diff > 0 ? "delta-up" : "delta-down"}`}>${text}</span>`;
}

export function WorkoutDetail({ id }) {
  const workout = records.value.get(id);
  const unit = settings.value.unit;
  const justFinished = route.value.query.get("done") === "1";

  const prs = useMemo(() => {
    if (!workout) return [];
    const found = [];
    for (const entry of workout.entries || []) {
      const prior = personalRecords(exerciseHistory(sessions.value, entry.exerciseId, { before: workout.startedAt, excludeId: workout.id }));
      for (const set of entry.sets) if (isPersonalRecord(set, prior)) found.push({ set, exerciseId: entry.exerciseId });
    }
    return found;
  }, [workout, sessions.value]);

  if (!workout || workout.deleted) return html`<div class="page"><${NavBar} title="Workout" large=${false} backTo="history" backLabel="History" /><${Unavailable} icon="history" title="Workout Not Found" /></div>`;

  const prIds = new Set(prs.map((pr) => pr.set.id));
  const previous = previousSession(sessions.value, workout);
  const minutes = workout.finishedAt - workout.startedAt;
  const volume = workoutVolume(workout);
  const sets = workoutSetCount(workout);

  const del = async () => {
    if (await ask({ title: "Delete Workout?", message: "This can't be undone.", confirm: "Delete", danger: true })) {
      await remove(id);
      go("history", { replace: true });
    }
  };

  return html`
    <div class="page">
      <${NavBar} title=${workout.name} subtitle=${`${format.date(workout.startedAt, { weekday: "long", month: "long", day: "numeric" })} at ${format.time(workout.startedAt)}`}
        backTo=${justFinished ? "today" : "history"} backLabel=${justFinished ? "Today" : "History"}
        trailing=${html`<button class="nav-button" onClick=${() => go(`workout/${id}`)}>Edit</button>`} />

      ${justFinished ? html`
        <div class="done-banner">
          <span class=${`done-badge ${prs.length ? "pr" : ""}`}><${Icon} name=${prs.length ? "trophy" : "check"} size=${30} stroke=${2.6} /></span>
          <h2>${prs.length ? `${format.plural(prs.length, "New PR", "New PRs")}` : "Workout Complete"}</h2>
          <p>${previous ? `Volume ${volume >= workoutVolume(previous) ? "up" : "down"} ${Math.abs(Math.round(((volume - workoutVolume(previous)) / (workoutVolume(previous) || 1)) * 100))}% from last ${workout.name}.` : "Next time, these are the numbers to beat."}</p>
        </div>` : null}

      <${Summary} items=${[
        { label: "Time", value: format.duration(minutes) },
        { label: "Sets", value: sets },
        { label: "Volume", value: format.volume(volume, "").trim(), unit }
      ]} />

      ${previous ? html`
        <${Group} header=${`vs. ${format.date(previous.startedAt)}`} footer=${`Compared with your last ${previous.name}.`}>
          <${Cell} title="Volume" subtitle=${format.volume(workoutVolume(previous), unit)}><${Delta} now=${volume} before=${workoutVolume(previous)} percent /></${Cell}>
          <${Cell} title="Sets" subtitle=${String(workoutSetCount(previous))}><${Delta} now=${sets} before=${workoutSetCount(previous)} /></${Cell}>
          <${Cell} title="Duration" subtitle=${format.duration(previous.finishedAt - previous.startedAt)}><${Delta} now=${Math.round(minutes / 60_000)} before=${Math.round((previous.finishedAt - previous.startedAt) / 60_000)} unit=" min" neutral /></${Cell}>
        </${Group}>` : null}

      ${prs.length ? html`
        <${Group} header="Personal Records">
          ${prs.map((pr) => html`<${Cell} icon="trophy" iconBg="var(--yellow-ink)" title=${exerciseName(pr.exerciseId)} subtitle=${`e1RM ${format.weight(Math.round(e1rm(pr.set.weight, pr.set.reps)))} ${unit}`}>
            <span class="cell-value num">${format.weight(pr.set.weight)} × ${pr.set.reps}</span></${Cell}>`)}
        </${Group}>` : null}

      ${(workout.entries || []).map((entry) => {
        let n = 0;
        return html`
          <${Group} key=${entry.id} header=${exerciseName(entry.exerciseId)} accessory=${html`<a class="accessory link" href=${`#/exercise/${entry.exerciseId}`}>History</a>`}>
            ${entry.sets.map((set) => {
              if (set.type !== "warmup") n += 1;
              return html`<div class="cell">
                <span class="set-line grow">
                  <span class=${`set-num ${set.type || "working"}`}>${set.type === "warmup" ? "W" : set.type === "drop" ? "D" : set.type === "failure" ? "F" : n}</span>
                  <span class="num">${format.weight(set.weight)} ${unit} × ${set.reps}</span>
                </span>
                ${prIds.has(set.id) ? html`<span class="pr-tag"><${Icon} name="trophy" size=${14} stroke=${2.4} />PR</span>` : set.type !== "warmup" && set.weight > 0 ? html`<span class="cell-value footnote">e1RM ${format.weight(Math.round(e1rm(set.weight, set.reps)))}</span>` : null}
              </div>`;
            })}
          </${Group}>`;
      })}

      ${workout.notes ? html`<${Group} header="Notes"><div class="cell-block subhead">${workout.notes}</div></${Group}>` : null}
      <${Group}><${Cell} title="Delete Workout" destructive class="centered" onClick=${del} /></${Group}>
      ${justFinished ? html`<button class="btn filled block" onClick=${() => go("today", { replace: true })}>Done</button>` : null}
    </div>`;
}
