// Today: what's next in the rotation, this week's training, consistency,
// bodyweight and recent PRs.
import { useMemo, useState } from "preact/hooks";
import { html } from "../html.js";
import { Icon } from "../icons.js";
import { ActionList, Cell, Group, NavBar, Sheet, Summary } from "../ui.js";
import { activeWorkout, bodyweights, exerciseIndex, exerciseName, finishedWorkouts, sessions, settings, splitDays } from "../store.js";
import {
  dailyVolume, dateKey, e1rm, exerciseHistory, isPersonalRecord, lastDoneAt, muscleSets, nextSplitDay, orderedDays,
  personalRecords, previousEntry, startOfWeek, weekStreak, workoutSetCount, workoutVolume
} from "../model.js";
import { applyTemplate, logRest, startWorkout } from "../actions.js";
import { TEMPLATES } from "../exercises.js";
import { go } from "../router.js";
import { sync } from "../sync.js";
import { now } from "../timer.js";
import { BodyweightSheet } from "./bodyweight.js";
import * as format from "../format.js";

export function Today() {
  const [choosing, setChoosing] = useState(false);
  const [weighing, setWeighing] = useState(false);
  const days = splitDays.value;
  const next = nextSplitDay(days, finishedWorkouts.value);
  const active = activeWorkout.value;
  const unit = settings.value.unit;

  const week = useMemo(() => {
    const from = startOfWeek();
    const list = sessions.value.filter((workout) => workout.startedAt >= from);
    return { count: list.length, sets: list.reduce((sum, w) => sum + workoutSetCount(w), 0), volume: list.reduce((sum, w) => sum + workoutVolume(w), 0) };
  }, [sessions.value]);

  const latestWeight = bodyweights.value[0];

  return html`
    <div class="page">
      <${NavBar} title="Today" subtitle=${format.date(Date.now(), { weekday: "long", month: "long", day: "numeric" })} />

      ${sync.value.status === "signedOut" ? html`
        <${Group}><${Cell} icon="cloud" title="Back Up Your Workouts" subtitle="Sign in to sync your phone and computer" chevron href="/api/auth/login" /></${Group}>` : null}

      ${active ? html`
        <${Group}>
          <${Cell} title=${active.name} subtitle="Workout in progress" onClick=${() => go(`workout/${active.id}`)} chevron>
            <span class="cell-value timer">${format.clock((now.value - active.startedAt) / 1000)}</span>
          </${Cell}>
        </${Group}>` : null}

      ${!days.length ? html`<${SetupSplit} />` : next ? html`<${UpNext} next=${next} days=${days} onChoose=${() => setChoosing(true)} blocked=${Boolean(active)} />` : null}

      <${Group} header="This Week" prominent>
        <${Summary} items=${[
          { label: "Workouts", value: week.count },
          { label: "Sets", value: week.sets },
          { label: "Volume", value: format.volume(week.volume, "").trim(), unit }
        ]} />
      </${Group}>

      <${MuscleVolume} />
      <${Consistency} />

      <${Group} header="Body" prominent>
        <${Cell} icon="scale" iconBg="var(--indigo)" title="Bodyweight" subtitle=${latestWeight ? format.relativeDay(new Date(latestWeight.date + "T12:00").getTime()) : "Not logged yet"}
          onClick=${() => setWeighing(true)} chevron>
          <span class="cell-value num">${latestWeight ? `${format.weight(latestWeight.weight)} ${unit}` : "Log"}</span>
        </${Cell}>
      </${Group}>

      <${RecentPRs} />

      <${Sheet} open=${choosing} onClose=${() => setChoosing(false)} title="Choose a Day" grouped>
        <${ActionList} items=${orderedDays(days).map((day) => {
          const last = lastDoneAt(day.id, finishedWorkouts.value);
          return {
            label: day.name,
            icon: day.rest ? "moon" : "today",
            iconBg: day.rest ? "var(--indigo)" : "var(--tint)",
            value: day.rest ? "Rest" : last ? format.relativeDay(last) : "",
            onClick: async () => {
              setChoosing(false);
              if (day.rest) await logRest(day);
              else startWorkout(day);
            }
          };
        })} />
        <${ActionList} items=${[{ label: "Empty Workout", icon: "plus", iconBg: "var(--label-2)", hint: "Add exercises as you go", onClick: () => { setChoosing(false); startWorkout(null); } }]} />
      </${Sheet}>
      <${BodyweightSheet} open=${weighing} onClose=${() => setWeighing(false)} />
    </div>`;
}

function UpNext({ next, days, onChoose, blocked }) {
  const { day, index, count, lastDoneAt: last } = next;
  const unit = settings.value.unit;
  const header = html`<span class="accessory">Day ${index + 1} of ${count}</span>`;
  if (day.rest) {
    const ordered = orderedDays(days);
    const after = ordered.slice(index + 1).concat(ordered.slice(0, index)).find((item) => !item.rest);
    return html`
      <${Group} header="Up Next" prominent accessory=${header}>
        <div class="up-next-head"><span class="footnote">${last ? `Last rest day ${format.relativeDay(last).toLowerCase()}` : "Recovery"}</span><h2>Rest Day</h2></div>
        <div class="up-next-actions">
          <button class="btn filled block" onClick=${() => logRest(day)}>Done Resting</button>
          ${after ? html`<button class="btn plain block" onClick=${() => startWorkout(after)} disabled=${blocked}>Train ${after.name} Instead</button>` : null}
        </div>
      </${Group}>`;
  }
  const items = day.exercises || [];
  return html`
    <${Group} header="Up Next" prominent accessory=${header}>
      <div class="up-next-head"><span class="footnote">${last ? `Last done ${format.relativeDay(last).toLowerCase()}` : "Not done yet"} · ${format.plural(items.length, "exercise")}</span><h2>${day.name}</h2></div>
      ${items.slice(0, 6).map((item) => {
        const prev = previousEntry(sessions.value, item.exerciseId);
        const top = prev?.entry.sets.filter((s) => s.done && s.type !== "warmup").sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
        return html`<div class="plan-line">
          <span class="name">${exerciseName(item.exerciseId)}</span>
          <span class="target">${item.targetSets || 3}×${item.repMin && item.repMax ? (item.repMin === item.repMax ? item.repMin : `${item.repMin}–${item.repMax}`) : ""}</span>
          <span class="last">${top ? `${format.weight(top.weight)}×${top.reps}` : html`<span class="secondary">–</span>`}</span>
        </div>`;
      })}
      ${items.length > 6 ? html`<div class="plan-line more"><span class="name">${items.length - 6} more</span></div>` : null}
      ${!items.length ? html`<div class="plan-line more"><span class="name">No exercises yet. <a href=${`#/split/${day.id}`}>Add some</a></span></div>` : null}
      <div class="up-next-actions">
        <button class="btn filled block" onClick=${() => startWorkout(day)} disabled=${blocked}><${Icon} name="play" size=${16} /> Start ${day.name}</button>
        <button class="btn plain block" onClick=${onChoose}>Choose Another Day</button>
      </div>
    </${Group}>`;
}

function SetupSplit() {
  return html`
    <${Group} header="Set Up Your Split" prominent footer="Pick a starting point. You can rename days and change every exercise later.">
      ${TEMPLATES.map((template) => html`<${Cell} title=${template.name} subtitle=${template.blurb} chevron onClick=${async () => { await applyTemplate(template); go("split"); }} />`)}
      <${Cell} title="Build My Own" subtitle="Start from a blank split" chevron onClick=${() => go("split")} />
    </${Group}>`;
}

const LOW = 10;
const HIGH = 20;

function MuscleVolume() {
  const rows = useMemo(() => muscleSets(sessions.value, exerciseIndex.value, startOfWeek()), [sessions.value, exerciseIndex.value]);
  const max = Math.max(HIGH + 4, ...rows.map((r) => r.sets));
  return html`
    <${Group} header="Sets per Muscle" prominent accessory=${html`<span class="accessory">This week</span>`}
      footer=${rows.length ? `Working sets since Monday. The green band is ${LOW}–${HIGH} sets, a common weekly range for muscle growth.` : ""}>
      ${rows.length ? html`<div class="muscles">${rows.map((row) => html`
        <div class="mrow">
          <span>${format.capitalize(row.muscle)}</span>
          <span class="mtrack"><span class="mband" style=${`left:${(LOW / max) * 100}%;width:${((HIGH - LOW) / max) * 100}%`}></span><span class="mfill" style=${`width:${(row.sets / max) * 100}%`}></span></span>
          <strong>${row.sets}</strong>
        </div>`)}</div>` : html`<${Cell} title="No sets yet this week" />`}
    </${Group}>`;
}

function Consistency() {
  const data = useMemo(() => {
    const volume = dailyVolume(sessions.value);
    const today = dateKey();
    const start = new Date(startOfWeek());
    start.setDate(start.getDate() - 11 * 7);
    const max = Math.max(1, ...[...volume.values()].map((d) => d.volume));
    const cells = [];
    const months = [];
    let lastMonth = -1;
    for (let w = 0; w < 12; w += 1) {
      const weekStart = new Date(start);
      weekStart.setDate(start.getDate() + w * 7);
      const month = weekStart.getMonth();
      months.push(month !== lastMonth ? weekStart.toLocaleDateString(undefined, { month: "short" }) : "");
      lastMonth = month;
      for (let d = 0; d < 7; d += 1) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + d);
        const key = dateKey(day.getTime());
        const v = volume.get(key);
        const level = !v ? 0 : v.volume <= 0 ? 1 : Math.min(4, Math.ceil((v.volume / max) * 4));
        cells.push({ key, level, future: key > today, today: key === today, label: v ? `${format.date(day.getTime())}: ${format.plural(v.sets, "set")}` : format.date(day.getTime()) });
      }
    }
    return { cells, months, streak: weekStreak(sessions.value), total: [...volume.keys()].filter((k) => k >= dateKey(start.getTime())).length };
  }, [sessions.value]);
  return html`
    <${Group} header="Consistency" prominent accessory=${html`<span class="accessory">${data.streak ? `${format.plural(data.streak, "week")} in a row` : "Last 12 weeks"}</span>`}
      footer=${`${format.plural(data.total, "training day")} in the last 12 weeks. Darker means more volume.`}>
      <div class="heat" role="img" aria-label=${`${data.total} training days in the last 12 weeks`}>
        <span></span>
        <div class="heat-months">${data.months.map((m) => html`<span>${m}</span>`)}</div>
        <div class="heat-days">${["M", "", "W", "", "F", "", "S"].map((d) => html`<span>${d}</span>`)}</div>
        <div class="heat-grid">${data.cells.map((c) => html`<span class=${`heat-cell l${c.level} ${c.future ? "future" : ""} ${c.today ? "today" : ""}`} title=${c.label}></span>`)}</div>
      </div>
    </${Group}>`;
}

function RecentPRs() {
  const unit = settings.value.unit;
  const prs = useMemo(() => {
    const from = Date.now() - 14 * 86_400_000;
    const found = new Map();
    for (const workout of sessions.value.filter((w) => w.startedAt >= from)) {
      for (const entry of workout.entries || []) {
        const prior = personalRecords(exerciseHistory(sessions.value, entry.exerciseId, { before: workout.startedAt }));
        for (const set of entry.sets || []) {
          if (!isPersonalRecord(set, prior)) continue;
          const value = e1rm(set.weight, set.reps);
          const current = found.get(entry.exerciseId);
          if (!current || value > current.e1rm) found.set(entry.exerciseId, { exerciseId: entry.exerciseId, weight: set.weight, reps: set.reps, e1rm: value, date: workout.startedAt });
        }
      }
    }
    return [...found.values()].sort((a, b) => b.date - a.date).slice(0, 5);
  }, [sessions.value]);
  if (!prs.length) return null;
  return html`
    <${Group} header="Recent PRs" prominent>
      ${prs.map((pr) => html`<${Cell} icon="trophy" iconBg="var(--yellow-ink)" title=${exerciseName(pr.exerciseId)} subtitle=${`${format.weight(pr.weight)} ${unit} × ${pr.reps} · e1RM ${format.weight(Math.round(pr.e1rm))}`}
        value=${format.relativeDay(pr.date)} chevron onClick=${() => go(`exercise/${pr.exerciseId}`)} />`)}
    </${Group}>`;
}
