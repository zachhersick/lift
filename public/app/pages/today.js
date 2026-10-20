// Today: what's next in the rotation, a way to start it, and this week so far.
import { useMemo, useState } from "preact/hooks";
import { html } from "../html.js";
import { Icon } from "../icons.js";
import { Empty, Header, Menu, Sheet, Stat } from "../ui.js";
import { activeWorkout, exerciseName, finishedWorkouts, sessions, settings, splitDays } from "../store.js";
import { exerciseHistory, isPersonalRecord, nextSplitDay, orderedDays, personalRecords, startOfWeek, workoutSetCount, workoutVolume, e1rm, lastDoneAt } from "../model.js";
import { applyTemplate, logRest, startWorkout } from "../actions.js";
import { TEMPLATES } from "../exercises.js";
import { go } from "../router.js";
import { sync } from "../sync.js";
import { now } from "../timer.js";
import * as format from "../format.js";

export function Today() {
  const [picking, setPicking] = useState(false);
  const days = splitDays.value;
  const next = nextSplitDay(days, finishedWorkouts.value);
  const active = activeWorkout.value;
  const unit = settings.value.unit;

  const week = useMemo(() => {
    const from = startOfWeek();
    const list = sessions.value.filter((workout) => workout.startedAt >= from);
    return { count: list.length, sets: list.reduce((sum, w) => sum + workoutSetCount(w), 0), volume: list.reduce((sum, w) => sum + workoutVolume(w), 0) };
  }, [sessions.value]);

  const prs = useRecentPRs();
  const today = format.date(Date.now(), { weekday: "long", month: "long", day: "numeric" });

  return html`
    <div class="page">
      <${Header} title="Today" subtitle=${today} />
      ${sync.value.status === "signedOut" ? html`
        <a class="banner" href="/api/auth/login">
          <${Icon} name="cloud" />
          <div><strong>Back up your workouts</strong><span>Sign in with GitHub to sync this phone and your computer.</span></div>
          <${Icon} name="right" size=${18} />
        </a>` : null}

      ${active ? html`
        <button class="card live-card" onClick=${() => go(`workout/${active.id}`)}>
          <span class="pulse"></span>
          <div class="grow">
            <span class="eyebrow">In progress</span>
            <strong>${active.name}</strong>
          </div>
          <span class="live-time">${format.clock((now.value - active.startedAt) / 1000)}</span>
          <${Icon} name="right" />
        </button>` : null}

      ${!days.length ? html`<${SetupSplit} />` : next ? html`<${NextUp} next=${next} days=${days} onPick=${() => setPicking(true)} hasActive=${Boolean(active)} />` : null}

      <section class="section">
        <h2 class="section-title">This week</h2>
        <div class="stats">
          <${Stat} label="Workouts" value=${week.count} />
          <${Stat} label="Sets" value=${week.sets} />
          <${Stat} label="Volume" value=${format.volume(week.volume, unit)} />
        </div>
      </section>

      ${prs.length ? html`
        <section class="section">
          <h2 class="section-title">Recent PRs</h2>
          <div class="card list">
            ${prs.map((pr) => html`
              <button class="list-row" onClick=${() => go(`exercise/${pr.exerciseId}`)}>
                <span class="pr-badge"><${Icon} name="trophy" size=${16} /></span>
                <div class="grow"><strong>${exerciseName(pr.exerciseId)}</strong><span>${format.weight(pr.weight)} ${unit} × ${pr.reps} · e1RM ${format.weight(Math.round(pr.e1rm))}</span></div>
                <span class="muted small">${format.relativeDay(pr.date)}</span>
              </button>`)}
          </div>
        </section>` : null}

      ${!sessions.value.length && days.length ? html`<p class="muted center pad">Your first workout sets the baseline. After that, every set shows what you did last time.</p>` : null}

      <${Sheet} open=${picking} onClose=${() => setPicking(false)} title="Start a different day">
        <${Menu} items=${[
          ...orderedDays(days).map((day) => ({
            label: day.name,
            icon: day.rest ? "moon" : "today",
            hint: day.rest ? "Rest" : `${format.plural(day.exercises?.length || 0, "exercise")}${lastDoneAt(day.id, finishedWorkouts.value) ? ` · ${format.relativeDay(lastDoneAt(day.id, finishedWorkouts.value))}` : ""}`,
            onClick: async () => {
              setPicking(false);
              if (day.rest) await logRest(day);
              else startWorkout(day);
            }
          })),
          { label: "Empty workout", icon: "plus", hint: "Add exercises as you go", onClick: () => { setPicking(false); startWorkout(null); } }
        ]} />
      </${Sheet}>
    </div>`;
}

function NextUp({ next, days, onPick, hasActive }) {
  const { day, index, count, lastDoneAt: last } = next;
  const ordered = orderedDays(days);
  if (day.rest) {
    const after = ordered.slice(index + 1).concat(ordered.slice(0, index)).find((item) => !item.rest);
    return html`
      <section class="card hero rest">
        <span class="eyebrow">Up next · day ${index + 1} of ${count}</span>
        <h2 class="hero-title"><${Icon} name="moon" size=${26} /> ${day.name}</h2>
        <p class="muted">Recovery is where the growth happens. Mark it done when you've rested, or train anyway.</p>
        <div class="hero-actions">
          <button class="btn primary block" onClick=${() => logRest(day)}>Done resting</button>
          ${after ? html`<button class="btn ghost block" onClick=${() => startWorkout(after)}>Train ${after.name} instead</button>` : null}
        </div>
      </section>`;
  }
  const names = (day.exercises || []).map((item) => exerciseName(item.exerciseId));
  return html`
    <section class="card hero">
      <span class="eyebrow">Up next · day ${index + 1} of ${count}</span>
      <h2 class="hero-title">${day.name}</h2>
      <p class="muted">${last ? `Last done ${format.relativeDay(last).toLowerCase()}` : "Not done yet"} · ${format.plural(names.length, "exercise")}</p>
      ${names.length ? html`<ul class="hero-list">${names.slice(0, 5).map((name) => html`<li>${name}</li>`)}${names.length > 5 ? html`<li class="muted">+ ${names.length - 5} more</li>` : null}</ul>` : html`<p class="muted small">No exercises yet. <a href=${`#/split/${day.id}`}>Add some</a> or add them during the workout.</p>`}
      <div class="hero-actions">
        <button class="btn primary block big" onClick=${() => startWorkout(day)} disabled=${hasActive}><${Icon} name="play" size=${18} /> Start ${day.name}</button>
        <button class="btn ghost block" onClick=${onPick}>Pick a different day</button>
      </div>
    </section>`;
}

function SetupSplit() {
  return html`
    <section class="card setup">
      <span class="eyebrow">Get started</span>
      <h2 class="hero-title">Set up your split</h2>
      <p class="muted">Pick a starting point. You can rename days and change every exercise afterwards.</p>
      <div class="templates">
        ${TEMPLATES.map((template) => html`
          <button class="template" onClick=${async () => { await applyTemplate(template); go("split"); }}>
            <strong>${template.name}</strong>
            <span>${template.blurb}</span>
            <${Icon} name="right" size=${18} />
          </button>`)}
        <button class="template" onClick=${() => go("split")}>
          <strong>Build my own</strong>
          <span>Start from a blank split</span>
          <${Icon} name="right" size=${18} />
        </button>
      </div>
    </section>`;
}

// The best new PR per exercise from the last two weeks.
function useRecentPRs() {
  return useMemo(() => {
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
}
