// The workout logger: one card per exercise, set rows that show last time's
// numbers, a progression hint, PR badges and a rest timer on every check.
// Also used to edit a finished workout from History.
import { useEffect, useMemo, useState } from "preact/hooks";
import { html } from "../html.js";
import { Icon } from "../icons.js";
import { ask, Empty, Menu, NumInput, Sheet, toast } from "../ui.js";
import { ExercisePicker } from "../picker.js";
import { exerciseIndex, records, remove, sessions, settings, update } from "../store.js";
import { exerciseHistory, isPersonalRecord, newEntry, newSet, personalRecords, placeholderFor, previousEntry, suggestion } from "../model.js";
import { back, go } from "../router.js";
import { keepAwake, now, startRest, stopRest, unlockAudio } from "../timer.js";
import * as format from "../format.js";

const REST_OPTIONS = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];
const TYPE_LABEL = { warmup: "W", drop: "D", failure: "F" };
const TYPE_NAME = { working: "Working set", warmup: "Warm-up", drop: "Drop set", failure: "To failure" };

export function WorkoutPage({ id }) {
  const workout = records.value.get(id);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const live = Boolean(workout && !workout.deleted && !workout.finishedAt);

  useEffect(() => {
    keepAwake(live);
    return () => keepAwake(false);
  }, [live]);

  if (!workout || workout.deleted) {
    return html`<div class="page"><${Empty} title="Workout not found" icon="history"><a class="btn ghost" href="#/today">Back to Today</a></${Empty}></div>`;
  }

  const change = (fn) => update(id, fn);
  const doneSets = workout.entries.reduce((sum, entry) => sum + entry.sets.filter((set) => set.done).length, 0);

  const finish = async () => {
    if (!doneSets) {
      if (await ask({ title: "No sets logged", message: "Nothing has been checked off yet. Discard this workout?", confirm: "Discard", danger: true })) {
        stopRest();
        await remove(id);
        go("today", { replace: true });
      }
      return;
    }
    const unchecked = workout.entries.reduce((sum, entry) => sum + entry.sets.filter((set) => !set.done).length, 0);
    const ok = await ask({
      title: "Finish workout?",
      message: unchecked ? `${format.plural(unchecked, "unchecked set")} will be left out.` : `${format.plural(doneSets, "set")} in ${format.duration(Date.now() - workout.startedAt)}.`,
      confirm: "Finish"
    });
    if (!ok) return;
    stopRest();
    await change((draft) => {
      draft.entries = draft.entries.map((entry) => ({ ...entry, sets: entry.sets.filter((set) => set.done) })).filter((entry) => entry.sets.length);
      draft.finishedAt = Date.now();
    });
    go(`history/${id}?done=1`, { replace: true });
  };

  // Editing a past workout: filled-in rows count, empty ones are dropped.
  const doneEditing = async () => {
    await change((draft) => {
      for (const entry of draft.entries) {
        entry.sets = entry.sets.filter((set) => set.done || set.reps != null).map((set) => ({ ...set, weight: set.weight ?? 0, done: true }));
      }
      draft.entries = draft.entries.filter((entry) => entry.sets.length);
    });
    back(`history/${id}`);
  };

  const discard = async () => {
    const ok = await ask({ title: live ? "Discard workout?" : "Delete workout?", message: "This can't be undone.", confirm: live ? "Discard" : "Delete", danger: true });
    if (!ok) return;
    stopRest();
    await remove(id);
    go(live ? "today" : "history", { replace: true });
  };

  const addExercise = (exercise) => {
    change((draft) => {
      draft.entries.push(newEntry(exercise.id, { targetSets: 3 }, settings.value.defaultRest));
    });
  };

  return html`
    <div class="page workout-page">
      <header class="workout-bar">
        <button class="icon-btn" onClick=${() => back("today")} aria-label="Back"><${Icon} name="left" /></button>
        <button class="workout-title" onClick=${() => setRenaming(true)}>
          <strong>${workout.name}</strong>
          <span>${live ? format.clock((now.value - workout.startedAt) / 1000) : format.date(workout.startedAt)}</span>
        </button>
        ${live
          ? html`<button class="btn primary small" onClick=${finish}>Finish</button>`
          : html`<button class="btn primary small" onClick=${doneEditing}>Done</button>`}
      </header>

      ${workout.entries.map((entry, index) => html`
        <${ExerciseCard} key=${entry.id} workout=${workout} entry=${entry} index=${index} count=${workout.entries.length} live=${live} change=${change} />`)}

      ${!workout.entries.length ? html`<${Empty} icon="today" title="No exercises yet">Add the first one to start logging sets.</${Empty}>` : null}

      <button class="btn secondary block big add-exercise" onClick=${() => setAdding(true)}><${Icon} name="plus" /> Add exercise</button>

      <label class="field notes-field">
        <span>Workout notes</span>
        <textarea rows="2" placeholder="How did it feel? Sleep, energy, anything to remember" value=${workout.notes || ""} onChange=${(e) => change((draft) => (draft.notes = e.currentTarget.value))}></textarea>
      </label>

      <button class="btn danger-text block" onClick=${discard}>${live ? "Discard workout" : "Delete workout"}</button>

      <${ExercisePicker} open=${adding} onClose=${() => setAdding(false)} onPick=${addExercise} />
      <${RenameSheet} open=${renaming} onClose=${() => setRenaming(false)} workout=${workout} change=${change} />
    </div>`;
}

function RenameSheet({ open, onClose, workout, change }) {
  const [name, setName] = useState(workout.name);
  useEffect(() => open && setName(workout.name), [open]);
  return html`
    <${Sheet} open=${open} onClose=${onClose} title="Rename workout">
      <div class="form">
        <label class="field"><span>Name</span><input type="text" value=${name} onInput=${(e) => setName(e.currentTarget.value)} /></label>
        <button class="btn primary block" disabled=${!name.trim()} onClick=${() => { change((draft) => (draft.name = name.trim())); onClose(); }}>Save</button>
      </div>
    </${Sheet}>`;
}

function ExerciseCard({ workout, entry, index, count, live, change }) {
  const [menu, setMenu] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [restMenu, setRestMenu] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [typeFor, setTypeFor] = useState(null);
  const exercise = exerciseIndex.value.get(entry.exerciseId) || { name: "Unknown exercise" };
  const step = settings.value.step;
  const unit = settings.value.unit;

  const previous = useMemo(() => previousEntry(sessions.value, entry.exerciseId, { before: workout.startedAt, excludeId: workout.id }), [sessions.value, entry.exerciseId, workout.startedAt]);
  const prior = useMemo(() => personalRecords(exerciseHistory(sessions.value, entry.exerciseId, { before: workout.startedAt, excludeId: workout.id })), [sessions.value, entry.exerciseId, workout.startedAt]);
  const hint = suggestion(previous?.entry, { repMin: entry.repMin, repMax: entry.repMax }, step);

  const changeEntry = (fn) => change((draft) => {
    const target = draft.entries.find((item) => item.id === entry.id);
    if (target) fn(target, draft);
  });

  const toggle = (setIndex) => {
    const set = entry.sets[setIndex];
    const ph = placeholderFor(entry, setIndex, previous?.entry, hint);
    if (set.done) return changeEntry((target) => (target.sets[setIndex].done = false));
    const weight = set.weight ?? ph.weight ?? (exercise.equipment === "bodyweight" ? 0 : null);
    const reps = set.reps ?? ph.reps;
    if (reps == null || reps <= 0) return toast("Enter reps first");
    if (weight == null) return toast("Enter the weight first");
    const doneSet = { ...set, weight, reps, done: true };
    changeEntry((target) => (target.sets[setIndex] = doneSet));
    unlockAudio();
    navigator.vibrate?.(12);
    if (live) startRest(entry.restSec ?? settings.value.defaultRest, { sound: settings.value.sound });
    if (isPersonalRecord(doneSet, prior)) toast(`New PR · ${format.weight(weight)} × ${reps}`, { icon: "trophy", tone: "pr" });
  };

  const move = (delta) => change((draft) => {
    const i = draft.entries.findIndex((item) => item.id === entry.id);
    const j = i + delta;
    if (j < 0 || j >= draft.entries.length) return;
    [draft.entries[i], draft.entries[j]] = [draft.entries[j], draft.entries[i]];
  });

  const removeEntry = async () => {
    setMenu(false);
    const hasDone = entry.sets.some((set) => set.done);
    if (hasDone && !(await ask({ title: `Remove ${exercise.name}?`, message: "Its logged sets will be removed from this workout.", confirm: "Remove", danger: true }))) return;
    change((draft) => (draft.entries = draft.entries.filter((item) => item.id !== entry.id)));
  };

  let working = 0;
  const target = entry.repMin && entry.repMax ? `${entry.sets.length} × ${entry.repMin === entry.repMax ? entry.repMin : `${entry.repMin}–${entry.repMax}`}` : format.plural(entry.sets.length, "set");

  return html`
    <section class="card exercise-card">
      <div class="exercise-head">
        <button class="exercise-name" onClick=${() => go(`exercise/${entry.exerciseId}`)}>
          <strong>${exercise.name}</strong>
          <span>${target}${entry.restSec ? ` · rest ${format.rest(entry.restSec)}` : ""}</span>
        </button>
        <button class="icon-btn" onClick=${() => setMenu(true)} aria-label=${`Options for ${exercise.name}`}><${Icon} name="more" /></button>
      </div>

      ${hint ? html`<div class=${`hint ${hint.kind}`}><${Icon} name=${hint.kind === "up" ? "arrowUp" : hint.kind === "hold" ? "arrowRight" : "progress"} size=${15} stroke=${2.4} /><span>${hint.text}</span></div>` : html`<div class="hint first"><${Icon} name="flame" size=${15} /><span>First time. This sets your baseline.</span></div>`}

      ${entry.notes || editingNote ? html`
        <textarea class="entry-note" rows="1" placeholder="Note (seat height, grip, cues…)" value=${entry.notes} onChange=${(e) => { changeEntry((t) => (t.notes = e.currentTarget.value)); setEditingNote(false); }}></textarea>` : null}

      <div class="set-grid set-head" aria-hidden="true">
        <span>Set</span><span>Previous</span><span>${unit}</span><span>Reps</span><span></span>
      </div>
      ${entry.sets.map((set, setIndex) => {
        if (set.type !== "warmup") working += 1;
        const ph = placeholderFor(entry, setIndex, previous?.entry, hint);
        const pr = set.done && isPersonalRecord(set, prior);
        return html`
          <div class=${`set-grid set-row ${set.done ? "done" : ""} ${set.type || "working"}`} key=${set.id}>
            <button class="set-label" onClick=${() => setTypeFor(setIndex)} aria-label=${`Set ${setIndex + 1}: ${TYPE_NAME[set.type || "working"]}`}>${TYPE_LABEL[set.type] || working}</button>
            <span class="set-prev">${ph.prev ? `${format.weight(ph.prev.weight)} × ${ph.prev.reps}` : "—"}</span>
            <${NumInput} value=${set.weight} placeholder=${ph.weight ?? ""} label=${`Weight for set ${setIndex + 1}`} onChange=${(value) => changeEntry((t) => (t.sets[setIndex].weight = value))} />
            <${NumInput} value=${set.reps} placeholder=${ph.reps ?? ""} decimal=${false} label=${`Reps for set ${setIndex + 1}`} onChange=${(value) => changeEntry((t) => (t.sets[setIndex].reps = value))} />
            <button class=${`set-check ${set.done ? "on" : ""}`} onClick=${() => toggle(setIndex)} aria-label=${set.done ? "Mark set not done" : "Complete set"} aria-pressed=${set.done}>
              ${pr ? html`<${Icon} name="trophy" size=${18} stroke=${2.2} />` : html`<${Icon} name="check" size=${20} stroke=${2.8} />`}
            </button>
          </div>`;
      })}
      <button class="add-set" onClick=${() => changeEntry((t) => t.sets.push(newSet()))}><${Icon} name="plus" size=${16} /> Add set</button>

      <${Sheet} open=${menu} onClose=${() => setMenu(false)} title=${exercise.name}>
        <${Menu} items=${[
          { label: "Move up", icon: "up", disabled: index === 0, onClick: () => { move(-1); setMenu(false); } },
          { label: "Move down", icon: "down", disabled: index === count - 1, onClick: () => { move(1); setMenu(false); } },
          { label: "Swap exercise", icon: "swap", onClick: () => { setMenu(false); setSwapping(true); } },
          { label: "Rest timer", icon: "timer", hint: entry.restSec ? format.rest(entry.restSec) : "Off", onClick: () => { setMenu(false); setRestMenu(true); } },
          { label: entry.notes ? "Edit note" : "Add note", icon: "note", onClick: () => { setMenu(false); setEditingNote(true); } },
          { label: "History & charts", icon: "progress", onClick: () => { setMenu(false); go(`exercise/${entry.exerciseId}`); } },
          { label: "Remove exercise", icon: "trash", danger: true, onClick: removeEntry }
        ]} />
      </${Sheet}>

      <${Sheet} open=${restMenu} onClose=${() => setRestMenu(false)} title="Rest timer">
        <div class="rest-options">
          ${REST_OPTIONS.map((seconds) => html`
            <button class=${`chip big ${entry.restSec === seconds ? "on" : ""}`} onClick=${() => { changeEntry((t) => (t.restSec = seconds)); setRestMenu(false); }}>${seconds ? format.rest(seconds) : "Off"}</button>`)}
        </div>
      </${Sheet}>

      <${Sheet} open=${typeFor !== null} onClose=${() => setTypeFor(null)} title=${typeFor !== null ? `Set ${typeFor + 1}` : ""}>
        ${typeFor !== null && entry.sets[typeFor] ? html`<${Menu} items=${[
          ...Object.entries(TYPE_NAME).map(([type, label]) => ({ label, active: (entry.sets[typeFor].type || "working") === type, onClick: () => { changeEntry((t) => (t.sets[typeFor].type = type)); setTypeFor(null); } })),
          { label: "Delete set", icon: "trash", danger: true, disabled: entry.sets.length <= 1, onClick: () => { changeEntry((t) => t.sets.splice(typeFor, 1)); setTypeFor(null); } }
        ]} />` : null}
      </${Sheet}>

      <${ExercisePicker} open=${swapping} title="Swap exercise" onClose=${() => setSwapping(false)} exclude=${[entry.exerciseId]}
        onPick=${(picked) => changeEntry((t) => { t.exerciseId = picked.id; })} />
    </section>`;
}

// The countdown bar shown above the tab bar while resting.
export function RestBar({ timer, adjust, skip }) {
  if (!timer) return null;
  if (timer.finishedAt) return html`<div class="rest-bar done" role="status"><${Icon} name="timer" /><strong>Rest's over. Next set.</strong><button class="btn ghost small" onClick=${skip}>OK</button></div>`;
  const left = Math.max(0, (timer.endsAt - now.value) / 1000);
  const pct = Math.min(100, (1 - left / timer.total) * 100);
  return html`
    <div class="rest-bar" role="timer" aria-label="Rest timer">
      <div class="rest-progress" style=${`width:${pct}%`}></div>
      <button class="rest-adjust" onClick=${() => adjust(-15)} aria-label="15 seconds less">−15</button>
      <div class="rest-time"><span>Rest</span><strong>${format.clock(Math.ceil(left))}</strong></div>
      <button class="rest-adjust" onClick=${() => adjust(15)} aria-label="15 seconds more">+15</button>
      <button class="btn ghost small" onClick=${skip}>Skip</button>
    </div>`;
}

