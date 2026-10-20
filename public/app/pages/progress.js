// Progress: every exercise you've logged with its trend, and the detail page
// with charts, personal records and full set history for one exercise.
import { useMemo, useState } from "preact/hooks";
import { html } from "../html.js";
import { Icon } from "../icons.js";
import { ask, Empty, Header, LineChart, Segmented, Sparkline, Stat, TrendChip } from "../ui.js";
import { exerciseIndex, remove, sessions, settings } from "../store.js";
import { exerciseHistory, personalRecords, trend } from "../model.js";
import { go } from "../router.js";
import * as format from "../format.js";

export function Progress() {
  const [query, setQuery] = useState("");
  const unit = settings.value.unit;
  const rows = useMemo(() => {
    const ids = new Set();
    for (const workout of sessions.value) for (const entry of workout.entries || []) ids.add(entry.exerciseId);
    return [...ids].map((id) => {
      const history = exerciseHistory(sessions.value, id);
      return { id, exercise: exerciseIndex.value.get(id), history, last: history[history.length - 1], trend: trend(history) };
    }).filter((row) => row.last).sort((a, b) => b.last.date - a.last.date);
  }, [sessions.value, exerciseIndex.value]);

  const q = query.trim().toLowerCase();
  const shown = rows.filter((row) => !q || (row.exercise?.name || "").toLowerCase().includes(q));
  const counts = { up: rows.filter((r) => r.trend === "up").length, flat: rows.filter((r) => r.trend === "flat").length, down: rows.filter((r) => r.trend === "down").length };

  return html`
    <div class="page">
      <${Header} title="Progress" subtitle=${rows.length ? `${format.plural(rows.length, "exercise")} tracked` : ""} />
      ${!rows.length ? html`<${Empty} icon="progress" title="Nothing to chart yet">Log a couple of workouts and each exercise gets its own progress chart and PRs.</${Empty}>` : html`
        <div class="stats">
          <${Stat} label="Going up" value=${counts.up} />
          <${Stat} label="Holding" value=${counts.flat} />
          <${Stat} label="Going down" value=${counts.down} />
        </div>
        <div class="search">
          <${Icon} name="search" size=${18} />
          <input type="search" placeholder="Search your exercises" value=${query} onInput=${(e) => setQuery(e.currentTarget.value)} />
        </div>
        <div class="card list">
          ${shown.map((row) => html`
            <button class="list-row" key=${row.id} onClick=${() => go(`exercise/${row.id}`)}>
              <div class="grow">
                <strong>${row.exercise?.name || "Unknown exercise"}</strong>
                <span>${format.weight(row.last.topSet.weight)} ${unit} × ${row.last.topSet.reps} · ${format.relativeDay(row.last.date)}</span>
              </div>
              <${Sparkline} values=${row.history.slice(-12).map((p) => p.bestE1rm || p.totalReps)} />
              <${TrendChip} trend=${row.trend} />
            </button>`)}
        </div>`}
    </div>`;
}

const RANGES = [
  { value: 30, label: "1M" },
  { value: 90, label: "3M" },
  { value: 365, label: "1Y" },
  { value: 0, label: "All" }
];

export function ExerciseDetail({ id }) {
  const [metric, setMetric] = useState("e1rm");
  const [range, setRange] = useState(90);
  const exercise = exerciseIndex.value.get(id);
  const unit = settings.value.unit;
  const history = useMemo(() => exerciseHistory(sessions.value, id), [sessions.value, id]);
  const records = useMemo(() => personalRecords(history), [history]);
  const bodyweight = history.length && history.every((point) => point.topWeight === 0);

  if (!exercise) return html`<div class="page"><${Header} title="Exercise" backTo="progress" large=${false} /><${Empty} title="Exercise not found" /></div>`;

  const from = range ? Date.now() - range * 86_400_000 : 0;
  const inRange = history.filter((point) => point.date >= from);
  const metricOf = {
    e1rm: (p) => p.bestE1rm,
    top: (p) => p.topWeight,
    volume: (p) => p.volume,
    reps: (p) => p.totalReps
  };
  const effective = bodyweight && metric !== "reps" ? "reps" : metric;
  const points = inRange.map((p) => ({ x: p.date, y: metricOf[effective](p), note: `${format.weight(p.topSet.weight)} × ${p.topSet.reps}` }));
  const chartUnit = effective === "reps" ? "reps" : unit;

  const repRecords = [...records.repsAtWeight.entries()].sort((a, b) => b[0] - a[0]).slice(0, 8);

  const removeCustom = async () => {
    if (await ask({ title: `Delete ${exercise.name}?`, message: "It disappears from the library. Past workouts keep their sets.", confirm: "Delete", danger: true })) {
      await remove(id);
      go("progress", { replace: true });
    }
  };

  return html`
    <div class="page">
      <${Header} title=${exercise.name} subtitle=${`${format.capitalize(exercise.muscle || "other")} · ${format.capitalize(exercise.equipment || "other")}`} backTo="progress" />
      ${!history.length ? html`<${Empty} icon="progress" title="No sets logged yet">Do this exercise in a workout and its chart starts here.</${Empty}>` : html`
        <section class="card">
          ${bodyweight ? null : html`<${Segmented} small value=${metric} onChange=${setMetric} options=${[
            { value: "e1rm", label: "Est. 1RM" },
            { value: "top", label: "Heaviest" },
            { value: "volume", label: "Volume" },
            { value: "reps", label: "Reps" }
          ]} />`}
          <${LineChart} points=${points} unit=${chartUnit} label=${(v) => format.weight(Math.round(v))} />
          <${Segmented} small value=${range} onChange=${setRange} options=${RANGES} />
        </section>

        <section class="section">
          <h2 class="section-title">Personal records</h2>
          <div class="stats two">
            ${bodyweight ? null : html`<${Stat} label="Est. 1RM" value=${`${format.weight(Math.round(records.e1rm?.value || 0))}`} sub=${records.e1rm ? `${format.weight(records.e1rm.weight)} × ${records.e1rm.reps} · ${format.shortDate(records.e1rm.date)}` : ""} />`}
            ${bodyweight ? null : html`<${Stat} label="Heaviest" value=${`${format.weight(records.weight?.weight || 0)}`} sub=${records.weight ? `× ${records.weight.reps} · ${format.shortDate(records.weight.date)}` : ""} />`}
            <${Stat} label="Most reps" value=${records.reps?.reps || 0} sub=${records.reps ? `at ${format.weight(records.reps.weight)} ${unit}` : ""} />
            <${Stat} label="Best session" value=${bodyweight ? `${Math.max(...history.map((p) => p.totalReps))} reps` : format.volume(records.volume?.value || 0, unit)} sub=${records.volume ? format.shortDate(records.volume.date) : ""} />
          </div>
        </section>

        ${!bodyweight && repRecords.length > 1 ? html`
          <section class="section">
            <h2 class="section-title">Best reps at each weight</h2>
            <div class="card rep-table">
              ${repRecords.map(([weight, record]) => html`<div class="rep-row"><span>${format.weight(weight)} ${unit}</span><strong>${record.reps} reps</strong><span class="muted small">${format.shortDate(record.date)}</span></div>`)}
            </div>
          </section>` : null}

        <section class="section">
          <h2 class="section-title">History</h2>
          <div class="card list">
            ${[...history].reverse().map((point) => html`
              <button class="list-row" key=${point.workoutId} onClick=${() => go(`history/${point.workoutId}`)}>
                <div class="grow">
                  <strong>${format.date(point.date)}</strong>
                  <span>${point.sets.map((set) => `${format.weight(set.weight)}×${set.reps}`).join(", ")}</span>
                </div>
                ${bodyweight ? null : html`<span class="muted small">e1RM ${format.weight(Math.round(point.bestE1rm))}</span>`}
              </button>`)}
          </div>
        </section>`}

      ${!exercise.builtIn ? html`<button class="btn danger-text block pad-top" onClick=${removeCustom}><${Icon} name="trash" size=${18} /> Delete custom exercise</button>` : null}
    </div>`;
}
