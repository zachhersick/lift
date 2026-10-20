// Progress: bodyweight and every exercise you've logged with its trend, and
// the detail page with chart, records and full set history for one exercise.
import { useMemo, useState } from "preact/hooks";
import { html } from "../html.js";
import { ask, Cell, Group, LineChart, NavBar, SearchField, Segmented, Sparkline, Summary, TrendText, Unavailable } from "../ui.js";
import { bodyweights, exerciseIndex, remove, sessions, settings } from "../store.js";
import { exerciseHistory, personalRecords, trend } from "../model.js";
import { go } from "../router.js";
import { NoteSheet } from "./workout.js";
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
  const count = (t) => rows.filter((r) => r.trend === t).length;
  const latestWeight = bodyweights.value[0];

  return html`
    <div class="page">
      <${NavBar} title="Progress" subtitle=${rows.length ? format.plural(rows.length, "exercise") + " tracked" : ""} />
      <${Group}>
        <${Cell} icon="scale" iconBg="var(--indigo)" title="Bodyweight" subtitle=${latestWeight ? `${format.weight(latestWeight.weight)} ${unit}` : "Not logged yet"} chevron href="#/bodyweight" />
      </${Group}>
      ${!rows.length ? html`<${Unavailable} icon="progress" title="Nothing to Chart Yet">After a couple of workouts, each exercise gets its own chart and records.</${Unavailable}>` : html`
        <${Summary} items=${[{ label: "Going up", value: count("up") }, { label: "Holding", value: count("flat") }, { label: "Going down", value: count("down") }]} />
        <${SearchField} value=${query} onInput=${setQuery} placeholder="Search your exercises" />
        <${Group} header="Exercises" footer="Trend compares your best estimated 1RM over the last three sessions with the three before.">
          ${shown.map((row) => html`
            <${Cell} key=${row.id} title=${row.exercise?.name || "Unknown exercise"} subtitle=${`${format.weight(row.last.topSet.weight)} × ${row.last.topSet.reps} · ${format.relativeDay(row.last.date)}`} chevron onClick=${() => go(`exercise/${row.id}`)}>
              <${Sparkline} values=${row.history.slice(-12).map((p) => p.bestE1rm || p.totalReps)} />
              <${TrendText} trend=${row.trend} />
            </${Cell}>`)}
          ${!shown.length ? html`<${Cell} title="No matches" />` : null}
        </${Group}>`}
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
  const [noting, setNoting] = useState(false);
  const exercise = exerciseIndex.value.get(id);
  const unit = settings.value.unit;
  const history = useMemo(() => exerciseHistory(sessions.value, id), [sessions.value, id]);
  const records = useMemo(() => personalRecords(history), [history]);
  const bodyweight = history.length && history.every((point) => point.topWeight === 0);

  if (!exercise) return html`<div class="page"><${NavBar} title="Exercise" large=${false} backTo="progress" backLabel="Progress" /><${Unavailable} title="Exercise Not Found" /></div>`;

  const from = range ? Date.now() - range * 86_400_000 : 0;
  const inRange = history.filter((point) => point.date >= from);
  const metrics = {
    e1rm: { caption: "Estimated 1RM", value: (p) => p.bestE1rm },
    top: { caption: "Heaviest set", value: (p) => p.topWeight },
    volume: { caption: "Session volume", value: (p) => p.volume },
    reps: { caption: "Total reps", value: (p) => p.totalReps }
  };
  const effective = bodyweight ? "reps" : metric;
  const points = inRange.map((p) => ({ x: p.date, y: metrics[effective].value(p), note: `Top set ${format.weight(p.topSet.weight)} × ${p.topSet.reps}` }));
  const repRecords = [...records.repsAtWeight.entries()].sort((a, b) => b[0] - a[0]).slice(0, 8);

  const removeCustom = async () => {
    if (await ask({ title: `Delete ${exercise.name}?`, message: "It disappears from the library. Past workouts keep their sets.", confirm: "Delete", danger: true })) {
      await remove(id);
      go("progress", { replace: true });
    }
  };

  return html`
    <div class="page">
      <${NavBar} title=${exercise.name} subtitle=${`${format.capitalize(exercise.muscle || "other")} · ${format.capitalize(exercise.equipment || "other")}`} backTo="progress" backLabel="Progress" />
      ${!history.length ? html`<${Unavailable} icon="progress" title="No Sets Yet">Do this exercise in a workout and its chart starts here.</${Unavailable}>` : html`
        <div class="chart-card">
          ${bodyweight ? null : html`<${Segmented} value=${metric} onChange=${setMetric} label="Metric" options=${[
            { value: "e1rm", label: "Est. 1RM" }, { value: "top", label: "Heaviest" }, { value: "volume", label: "Volume" }, { value: "reps", label: "Reps" }
          ]} />`}
          <${LineChart} points=${points} unit=${effective === "reps" ? " reps" : ` ${unit}`} caption=${metrics[effective].caption} label=${(v) => format.weight(Math.round(v))} />
          <${Segmented} value=${range} onChange=${setRange} label="Range" options=${RANGES} />
        </div>

        <${Group} header="Personal Records">
          ${bodyweight ? null : html`<${Cell} title="Estimated 1RM" subtitle=${records.e1rm ? `${format.weight(records.e1rm.weight)} × ${records.e1rm.reps} · ${format.shortDate(records.e1rm.date)}` : ""}><span class="cell-value num">${format.weight(Math.round(records.e1rm?.value || 0))} ${unit}</span></${Cell}>`}
          ${bodyweight ? null : html`<${Cell} title="Heaviest" subtitle=${records.weight ? `× ${records.weight.reps} · ${format.shortDate(records.weight.date)}` : ""}><span class="cell-value num">${format.weight(records.weight?.weight || 0)} ${unit}</span></${Cell}>`}
          <${Cell} title="Most Reps" subtitle=${records.reps ? `at ${format.weight(records.reps.weight)} ${unit}` : ""}><span class="cell-value num">${records.reps?.reps || 0}</span></${Cell}>
          <${Cell} title="Best Session" subtitle=${records.volume ? format.shortDate(records.volume.date) : ""}><span class="cell-value num">${bodyweight ? `${Math.max(...history.map((p) => p.totalReps))} reps` : format.volume(records.volume?.value || 0, unit)}</span></${Cell}>
        </${Group}>

        ${!bodyweight && repRecords.length > 1 ? html`
          <${Group} header="Best Reps at Each Weight">
            ${repRecords.map(([weight, record]) => html`<${Cell} title=${`${format.weight(weight)} ${unit}`} subtitle=${format.shortDate(record.date)}><span class="cell-value num">${record.reps} reps</span></${Cell}>`)}
          </${Group}>` : null}

        <${Group} header="History">
          ${[...history].reverse().map((point) => html`
            <${Cell} key=${point.workoutId} title=${format.date(point.date)} subtitle=${point.sets.map((set) => `${format.weight(set.weight)}×${set.reps}`).join(", ")} chevron onClick=${() => go(`history/${point.workoutId}`)} />`)}
        </${Group}>`}

      <${Group} header="Note" footer="Shows on this exercise in every workout.">
        <${Cell} title=${exercise.note || "Add a note"} class=${exercise.note ? "" : "action"} onClick=${() => setNoting(true)} chevron />
      </${Group}>
      <${NoteSheet} open=${noting} onClose=${() => setNoting(false)} exercise=${exercise} id=${id} />
      ${!exercise.builtIn ? html`<${Group}><${Cell} title="Delete Exercise" destructive class="centered" onClick=${removeCustom} /></${Group}>` : null}
    </div>`;
}
