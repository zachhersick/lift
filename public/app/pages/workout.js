// The workout logger. One card per exercise; set rows show last time's
// numbers, a progression hint, PR highlights and start the rest timer.
// Weight and reps go through the docked number pad. Also used to edit a
// finished workout from History.
import { useEffect, useMemo, useState } from "preact/hooks";
import { html } from "../html.js";
import { Icon } from "../icons.js";
import { ActionList, ask, Cell, choose, Group, LineChart, NavBar, Sheet, Stepper, Summary, toast, Unavailable } from "../ui.js";
import { ExercisePicker } from "../picker.js";
import { exerciseIndex, exerciseName, records, remove, save, saveExerciseNote, sessions, settings, splitDays, update } from "../store.js";
import {
  dateKey, exerciseHistory, fromDateKey, isPersonalRecord, newEntry, newSet, nextInSuperset, personalRecords, placeholderFor,
  previousEntry, restsAfter, splitDiff, suggestion, supersetLabels, uid, warmupSets, workoutVolume
} from "../model.js";
import { back, go } from "../router.js";
import { closePad, openPad, pad } from "../keypad.js";
import { keepAwake, now, restTimer, startRest, stopRest, unlockAudio, adjustRest } from "../timer.js";
import { haptic } from "../haptics.js";
import * as format from "../format.js";

const REST_OPTIONS = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];
const TYPE_LABEL = { warmup: "W", drop: "D", failure: "F" };
const TYPE_NAME = { working: "Working Set", warmup: "Warm-up", drop: "Drop Set", failure: "Failure" };

export function WorkoutPage({ id }) {
  const workout = records.value.get(id);
  const [adding, setAdding] = useState(false);
  const [details, setDetails] = useState(false);
  const live = Boolean(workout && !workout.deleted && !workout.finishedAt);

  useEffect(() => {
    keepAwake(live);
    return () => {
      keepAwake(false);
      closePad();
    };
  }, [live]);

  // Keep the field being typed into above the number pad.
  useEffect(() => {
    const target = pad.value;
    if (!target) return;
    const el = document.querySelector(`[data-cell="${target.setId}-${target.field}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 330 || rect.top < 90) window.scrollBy({ top: rect.top - window.innerHeight * 0.3, behavior: "smooth" });
  }, [pad.value?.setId, pad.value?.field]);

  if (!workout || workout.deleted) {
    return html`<div class="page"><${NavBar} title="Workout" large=${false} backTo="today" backLabel="Today" /><${Unavailable} icon="history" title="Workout Not Found" action=${html`<a class="btn tinted small" href="#/today">Go to Today</a>`} /></div>`;
  }

  const change = (fn) => update(id, fn);
  const entries = workout.entries;
  const labels = supersetLabels(entries);
  const doneSets = entries.reduce((sum, entry) => sum + entry.sets.filter((set) => set.done).length, 0);
  const totalSets = entries.reduce((sum, entry) => sum + entry.sets.length, 0);
  const unit = settings.value.unit;

  const finish = async () => {
    closePad();
    if (!doneSets) {
      if (await ask({ title: "No Sets Logged", message: "Nothing is checked off yet. Discard this workout?", confirm: "Discard", danger: true })) {
        stopRest();
        await remove(id);
        go("today", { replace: true });
      }
      return;
    }
    const unchecked = totalSets - doneSets;
    const ok = await ask({
      title: "Finish Workout?",
      message: unchecked ? `${format.plural(unchecked, "unchecked set")} will be left out.` : `${format.plural(doneSets, "set")} in ${format.duration(Date.now() - workout.startedAt)}.`,
      confirm: "Finish"
    });
    if (!ok) return;
    stopRest();
    // Compare the plan with the workout before unchecked sets are dropped, so
    // skipping an exercise today doesn't read as removing it from the plan.
    const asPlanned = structuredClone(workout);
    await change((draft) => {
      draft.entries = draft.entries.map((entry) => ({ ...entry, sets: entry.sets.filter((set) => set.done) })).filter((entry) => entry.sets.length);
      draft.finishedAt = Date.now();
    });
    await offerSplitUpdate(asPlanned);
    go(`history/${id}?done=1`, { replace: true });
  };

  // Editing a past workout: filled-in rows count, empty ones are dropped.
  const doneEditing = async () => {
    closePad();
    await change((draft) => {
      for (const entry of draft.entries) {
        entry.sets = entry.sets.filter((set) => set.done || set.reps != null).map((set) => ({ ...set, weight: set.weight ?? 0, done: true }));
      }
      draft.entries = draft.entries.filter((entry) => entry.sets.length);
    });
    back(`history/${id}`);
  };

  const discard = async () => {
    const ok = await ask({ title: live ? "Discard Workout?" : "Delete Workout?", message: "This can't be undone.", confirm: live ? "Discard" : "Delete", danger: true });
    if (!ok) return;
    closePad();
    stopRest();
    await remove(id);
    go(live ? "today" : "history", { replace: true });
  };

  const addExercise = (exercise) => change((draft) => {
    draft.entries.push(newEntry(exercise.id, { targetSets: 3 }, settings.value.defaultRest));
  });

  const head = html`
    <button class="workout-head" onClick=${() => setDetails(true)} aria-label="Workout details">
      <h1>${workout.name}</h1>
      <span class="meta">
        ${live ? html`<span><${Icon} name="timer" size=${15} stroke=${2.2} class="inline-icon" /> <strong class="timer">${format.clock((now.value - workout.startedAt) / 1000)}</strong></span>` : html`<span>${format.date(workout.startedAt, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>`}
        <span><strong class="num">${doneSets}</strong>/${totalSets} sets</span>
        <span><strong class="num">${format.volume(workoutVolume({ entries: entries.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })) }), "")}</strong>${unit}</span>
      </span>
    </button>`;

  return html`
    <div class="page">
      <${NavBar} title=${workout.name} largeContent=${head} backTo=${live ? "today" : `history/${id}`} backLabel=${live ? "Today" : "Summary"}
        trailing=${html`<button class="btn filled small" onClick=${live ? finish : doneEditing}>${live ? "Finish" : "Done"}</button>`} />

      ${entries.length ? html`<div class="exercises">
        ${entries.map((entry, index) => html`<${ExerciseCard} key=${entry.id} workout=${workout} entry=${entry} index=${index} label=${labels[index]} live=${live} change=${change} />`)}
      </div>` : html`<${Unavailable} icon="today" title="No Exercises">Add the first exercise to start logging sets.</${Unavailable}>`}

      <button class="btn tinted block" onClick=${() => { closePad(); setAdding(true); }}><${Icon} name="plus" size=${20} stroke=${2.4} /> Add Exercise</button>

      <${Group} header="Notes">
        <div class="cell-block"><textarea class="text-field" rows="2" placeholder="How did it feel?" value=${workout.notes || ""} onChange=${(e) => change((draft) => (draft.notes = e.currentTarget.value))}></textarea></div>
      </${Group}>

      <${Group}><${Cell} title=${live ? "Discard Workout" : "Delete Workout"} destructive onClick=${discard} class="centered" /></${Group}>

      <${ExercisePicker} open=${adding} onClose=${() => setAdding(false)} onPick=${addExercise} />
      <${DetailsSheet} open=${details} onClose=${() => setDetails(false)} workout=${workout} change=${change} />
    </div>`;
}

// If the workout strayed from its split day, offer to make that the plan.
async function offerSplitUpdate(workout) {
  const day = splitDays.value.find((d) => d.id === workout?.splitDayId);
  if (!day || day.rest) return;
  const diff = splitDiff(day, workout, exerciseName);
  if (!diff.changes.length) return;
  const shown = diff.changes.slice(0, 4).join("\n") + (diff.changes.length > 4 ? `\nand ${diff.changes.length - 4} more` : "");
  const yes = await choose({
    title: `Update ${day.name}?`,
    message: `Make today's workout the plan for ${day.name}:\n${shown}`,
    actions: [{ label: `Update ${day.name}`, value: true, style: "primary" }, { label: "Keep as Is", value: false, style: "cancel" }]
  });
  if (yes) {
    await save({ ...day, exercises: diff.exercises });
    toast(`${day.name} updated`);
  }
}

function DetailsSheet({ open, onClose, workout, change }) {
  const [name, setName] = useState(workout.name);
  const [date, setDate] = useState(dateKey(workout.startedAt));
  const [time, setTime] = useState("");
  const [minutes, setMinutes] = useState(60);
  useEffect(() => {
    if (!open) return;
    const start = new Date(workout.startedAt);
    setName(workout.name);
    setDate(dateKey(workout.startedAt));
    setTime(`${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`);
    setMinutes(workout.finishedAt ? Math.max(1, Math.round((workout.finishedAt - workout.startedAt) / 60_000)) : 60);
  }, [open]);
  const saveDetails = () => {
    const [h, m] = (time || "0:0").split(":").map(Number);
    const startedAt = fromDateKey(date || dateKey(workout.startedAt)) + (h * 60 + m) * 60_000;
    change((draft) => {
      draft.name = name.trim() || draft.name;
      if (Number.isFinite(startedAt)) draft.startedAt = Math.min(startedAt, Date.now());
      if (draft.finishedAt) draft.finishedAt = draft.startedAt + minutes * 60_000;
    });
    onClose();
  };
  return html`
    <${Sheet} open=${open} onClose=${onClose} title="Workout Details" grouped
      left=${html`<button class="nav-button" onClick=${onClose}>Cancel</button>`}
      right=${html`<button class="nav-button bold" onClick=${saveDetails}>Done</button>`}>
      <${Group}>
        <${Cell} title="Name"><input class="text-field right" type="text" value=${name} onInput=${(e) => setName(e.currentTarget.value)} aria-label="Workout name" /></${Cell}>
      </${Group}>
      <${Group} footer=${workout.finishedAt ? "Use this to log a workout you forgot, or fix the time." : "Changing the start time also changes the timer."}>
        <${Cell} title="Date"><input class="text-field" type="date" value=${date} max=${dateKey()} onInput=${(e) => setDate(e.currentTarget.value)} aria-label="Date" /></${Cell}>
        <${Cell} title="Start"><input class="text-field" type="time" value=${time} onInput=${(e) => setTime(e.currentTarget.value)} aria-label="Start time" /></${Cell}>
        ${workout.finishedAt ? html`<${Cell} title="Duration"><${Stepper} label="minutes" value=${minutes} min=${5} max=${300} step=${5} onChange=${setMinutes} /><span class="secondary subhead">min</span></${Cell}>` : null}
      </${Group}>
    </${Sheet}>`;
}

function ExerciseCard({ workout, entry, index, label, live, change }) {
  const [sheet, setSheet] = useState(null); // "menu" | "rest" | "note" | "swap" | "peek" | { type: setIndex }
  const exercise = exerciseIndex.value.get(entry.exerciseId) || { name: "Unknown exercise" };
  const s = settings.value;
  const entries = workout.entries;

  const previous = useMemo(() => previousEntry(sessions.value, entry.exerciseId, { before: workout.startedAt, excludeId: workout.id }), [sessions.value, entry.exerciseId, workout.startedAt]);
  const prior = useMemo(() => personalRecords(exerciseHistory(sessions.value, entry.exerciseId, { before: workout.startedAt, excludeId: workout.id })), [sessions.value, entry.exerciseId, workout.startedAt]);
  const hint = suggestion(previous?.entry, { repMin: entry.repMin, repMax: entry.repMax }, s.step);

  const changeEntry = (fn) => change((draft) => {
    const target = draft.entries.find((item) => item.id === entry.id);
    if (target) fn(target, draft);
  });

  const toggle = (setIndex) => {
    const set = entry.sets[setIndex];
    const ph = placeholderFor(entry, setIndex, previous?.entry, hint);
    if (set.done) return changeEntry((t) => (t.sets[setIndex].done = false));
    const weight = set.weight ?? ph.weight ?? (exercise.equipment === "bodyweight" ? 0 : null);
    const reps = set.reps ?? ph.reps;
    if (reps == null || reps <= 0) return toast("Enter reps first", { icon: "note" });
    if (weight == null) return toast("Enter the weight first", { icon: "note" });
    const doneSet = { ...set, weight, reps, done: true };
    changeEntry((t) => (t.sets[setIndex] = doneSet));
    if (pad.value?.setId === set.id) closePad();
    unlockAudio();
    haptic(12);
    if (isPersonalRecord(doneSet, prior)) {
      haptic([12, 60, 12]);
      toast(`New PR · ${format.weight(weight)} × ${reps}`, { icon: "trophy", tone: "pr" });
    }
    if (!live || set.type === "warmup") return;
    if (restsAfter(entries, index)) startRest(entry.restSec ?? s.defaultRest, { sound: s.sound });
    else {
      const nextIndex = nextInSuperset(entries, index);
      if (nextIndex !== null) toast(`Next: ${exerciseName(entries[nextIndex].exerciseId)}`, { icon: "arrowRight" });
    }
  };

  const copyPrevious = (setIndex, prev) => changeEntry((t) => {
    t.sets[setIndex].weight = Number(prev.weight) || 0;
    t.sets[setIndex].reps = Number(prev.reps) || 0;
  });

  const addSet = () => changeEntry((t) => {
    const above = t.sets[t.sets.length - 1];
    t.sets.push({ ...newSet(above?.type === "warmup" ? "working" : above?.type || "working"), weight: above?.type === "warmup" ? null : above?.weight ?? null, reps: above?.type === "warmup" ? null : above?.reps ?? null });
  });

  const move = (delta) => change((draft) => {
    const i = draft.entries.findIndex((item) => item.id === entry.id);
    const j = i + delta;
    if (j < 0 || j >= draft.entries.length) return;
    [draft.entries[i], draft.entries[j]] = [draft.entries[j], draft.entries[i]];
  });

  const linkNext = () => change((draft) => {
    const i = draft.entries.findIndex((item) => item.id === entry.id);
    const next = draft.entries[i + 1];
    if (!next) return;
    const id = draft.entries[i].supersetId || next.supersetId || uid("ss");
    const old = next.supersetId;
    draft.entries[i].supersetId = id;
    for (const item of draft.entries) if (old && item.supersetId === old) item.supersetId = id;
    next.supersetId = id;
  });

  const unlink = () => changeEntry((t) => (t.supersetId = null));

  const addWarmups = () => {
    const firstWorking = entry.sets.findIndex((set) => set.type !== "warmup");
    const ph = firstWorking >= 0 ? placeholderFor(entry, firstWorking, previous?.entry, hint) : {};
    const working = (firstWorking >= 0 ? entry.sets[firstWorking].weight : null) ?? ph.weight ?? hint?.weight;
    const sets = warmupSets(working, { equipment: exercise.equipment, bar: s.barWeight, plates: s.plates, step: s.step });
    if (!sets.length) return toast(working ? "Too light for warm-ups" : "Enter a working weight first", { icon: "note" });
    changeEntry((t) => {
      t.sets = [...sets.map((w) => ({ ...newSet("warmup"), weight: w.weight, reps: w.reps })), ...t.sets.filter((set) => set.type !== "warmup" || set.done)];
    });
    toast(`Added ${format.plural(sets.length, "warm-up set")}`, { icon: "flame" });
  };

  const removeEntry = async () => {
    setSheet(null);
    if (entry.sets.some((set) => set.done) && !(await ask({ title: `Remove ${exercise.name}?`, message: "Its logged sets will be removed from this workout.", confirm: "Remove", danger: true }))) return;
    closePad();
    change((draft) => (draft.entries = draft.entries.filter((item) => item.id !== entry.id)));
  };

  const linkedToNext = label && !label.last;
  const target = entry.repMin && entry.repMax ? `${entry.repMin === entry.repMax ? entry.repMin : `${entry.repMin}–${entry.repMax}`} reps` : "";
  let number = 0;

  return html`
    <section class=${`ex ${label ? "ss" : ""} ${label && !label.last ? "ss-joined-below" : ""} ${label && !label.first ? "ss-joined-above" : ""}`}>
      <div class="ex-head">
        <button class="ex-title" onClick=${() => { closePad(); setSheet("peek"); }}>
          <strong>${label ? html`<span class="ss-tag">${label.group}${label.position}</span>` : null}${exercise.name}</strong>
          <span>${[target, entry.restSec ? `Rest ${format.rest(entry.restSec)}` : "No rest timer", label ? "Superset" : ""].filter(Boolean).join(" · ")}</span>
        </button>
        <button class="circle-btn tint" onClick=${() => { closePad(); setSheet("menu"); }} aria-label=${`Options for ${exercise.name}`}><${Icon} name="more" size=${18} stroke=${2} /></button>
      </div>

      ${exercise.note ? html`<button class="ex-note" onClick=${() => setSheet("note")}><${Icon} name="note" size=${16} stroke=${2} /><span>${exercise.note}</span></button>` : null}
      ${entry.notes ? html`<p class="ex-note"><${Icon} name="note" size=${16} stroke=${2} /><span>${entry.notes}</span></p>` : null}
      ${hint ? html`<p class=${`ex-hint ${hint.kind}`}><${Icon} name=${hint.kind === "up" ? "arrowUp" : "arrowRight"} size=${14} stroke=${2.6} />${hint.text}</p>`
        : html`<p class="ex-hint"><${Icon} name="flame" size=${14} stroke=${2.2} />First time. This sets your baseline.</p>`}

      <div class="sets-head" aria-hidden="true"><span>Set</span><span>Previous</span><span>${s.unit}</span><span>Reps</span><span></span></div>
      ${entry.sets.map((set, setIndex) => {
        if (set.type !== "warmup") number += 1;
        const ph = placeholderFor(entry, setIndex, previous?.entry, hint);
        const pr = set.done && isPersonalRecord(set, prior);
        const field = (name) => {
          const active = pad.value?.setId === set.id && pad.value.field === name;
          const value = active && !pad.value.fresh ? pad.value.text : set[name] != null ? format.weight(set[name]) : null;
          const placeholder = ph[name] != null ? format.weight(ph[name]) : "";
          return html`<button class=${`set-field ${value == null ? "placeholder" : ""} ${active ? "active" : ""}`} data-cell=${`${set.id}-${name}`} data-placeholder=${ph[name] ?? ""}
            aria-label=${`${name === "weight" ? "Weight" : "Reps"}, set ${setIndex + 1}`}
            onClick=${() => openPad({ workoutId: workout.id, entryId: entry.id, setId: set.id, field: name, value: set[name], placeholder: ph[name] })}>${value ?? placeholder ?? ""}</button>`;
        };
        return html`
          <div class=${`set ${set.done ? "done" : ""}`} key=${set.id}>
            <button class=${`set-num ${set.type || "working"}`} onClick=${() => { closePad(); setSheet({ type: setIndex }); }} aria-label=${`Set ${setIndex + 1}, ${TYPE_NAME[set.type || "working"]}`}>${TYPE_LABEL[set.type] || number}</button>
            <button class="set-prev" disabled=${!ph.prev} onClick=${() => ph.prev && copyPrevious(setIndex, ph.prev)} aria-label=${ph.prev ? `Copy last time, ${format.weight(ph.prev.weight)} by ${ph.prev.reps}` : "No previous set"}>${ph.prev ? `${format.weight(ph.prev.weight)} × ${ph.prev.reps}` : "—"}</button>
            ${field("weight")}
            ${field("reps")}
            <button class=${`set-check ${set.done ? "on" : ""} ${pr ? "pr" : ""}`} onClick=${() => toggle(setIndex)} aria-pressed=${set.done} aria-label=${set.done ? "Mark set not done" : "Complete set"}>
              <${Icon} name=${pr ? "trophy" : "check"} size=${pr ? 18 : 20} stroke=${2.8} />
            </button>
          </div>`;
      })}
      <button class="add-set" onClick=${addSet}><${Icon} name="plus" size=${16} stroke=${2.6} /> Add Set</button>

      <${Sheet} open=${sheet === "menu"} onClose=${() => setSheet(null)} title=${exercise.name} grouped>
        <${ActionList} items=${[
          { label: "Add Warm-up Sets", icon: "flame", iconBg: "var(--orange)", onClick: () => { setSheet(null); addWarmups(); } },
          index < entries.length - 1 && !linkedToNext ? { label: "Superset with Next", hint: exerciseName(entries[index + 1].exerciseId), icon: "link", iconBg: "var(--tint)", onClick: () => { setSheet(null); linkNext(); } } : null,
          label ? { label: "Remove from Superset", icon: "unlink", iconBg: "var(--tint)", onClick: () => { setSheet(null); unlink(); } } : null,
          { label: "Rest Timer", icon: "timer", iconBg: "var(--indigo)", value: entry.restSec ? format.rest(entry.restSec) : "Off", onClick: () => setSheet("rest") },
          { label: exercise.note ? "Edit Note" : "Add Note", icon: "note", iconBg: "var(--yellow-ink)", onClick: () => setSheet("note") }
        ]} />
        <${ActionList} items=${[
          { label: "History", icon: "peek", iconBg: "var(--green)", onClick: () => setSheet("peek") },
          { label: "Swap Exercise", icon: "swap", iconBg: "var(--label-2)", onClick: () => setSheet("swap") },
          { label: "Move Up", icon: "chevronUp", iconBg: "var(--label-2)", disabled: index === 0, onClick: () => { move(-1); setSheet(null); } },
          { label: "Move Down", icon: "chevronDown", iconBg: "var(--label-2)", disabled: index === entries.length - 1, onClick: () => { move(1); setSheet(null); } }
        ]} />
        <${ActionList} items=${[{ label: "Remove Exercise", icon: "trash", danger: true, onClick: removeEntry }]} />
      </${Sheet}>

      <${Sheet} open=${sheet === "rest"} onClose=${() => setSheet(null)} title="Rest Timer" grouped>
        <${Group} footer="Starts when you check off a set. In a superset it starts after the last exercise.">
          ${REST_OPTIONS.map((seconds) => html`<${Cell} title=${seconds ? format.rest(seconds) : "Off"} onClick=${() => { changeEntry((t) => (t.restSec = seconds)); setSheet(null); }}>
            ${entry.restSec === seconds ? html`<${Icon} name="check" size=${20} stroke=${2.6} class="tint-check" />` : null}</${Cell}>`)}
        </${Group}>
      </${Sheet}>

      <${NoteSheet} open=${sheet === "note"} onClose=${() => setSheet(null)} exercise=${exercise} id=${entry.exerciseId} />
      <${PeekSheet} open=${sheet === "peek"} onClose=${() => setSheet(null)} id=${entry.exerciseId} workout=${workout} />

      <${Sheet} open=${typeof sheet === "object" && sheet !== null} onClose=${() => setSheet(null)} title=${sheet && typeof sheet === "object" ? `Set ${sheet.type + 1}` : ""} grouped>
        ${sheet && typeof sheet === "object" && entry.sets[sheet.type] ? html`
          <${Group}>${Object.entries(TYPE_NAME).map(([type, name]) => html`
            <${Cell} title=${name} onClick=${() => { changeEntry((t) => (t.sets[sheet.type].type = type)); setSheet(null); }}>
              <span class=${`set-num ${type}`} style="width:28px;height:26px;font-size:13px">${TYPE_LABEL[type] || "1"}</span>
              ${(entry.sets[sheet.type].type || "working") === type ? html`<${Icon} name="check" size=${20} stroke=${2.6} class="tint-check" />` : null}
            </${Cell}>`)}
          </${Group}>
          <${ActionList} items=${[{ label: "Delete Set", icon: "trash", danger: true, disabled: entry.sets.length <= 1, onClick: () => { closePad(); changeEntry((t) => t.sets.splice(sheet.type, 1)); setSheet(null); } }]} />` : null}
      </${Sheet}>

      <${ExercisePicker} open=${sheet === "swap"} title="Swap Exercise" onClose=${() => setSheet(null)} exclude=${[entry.exerciseId]}
        onPick=${(picked) => changeEntry((t) => { t.exerciseId = picked.id; })} />
    </section>`;
}

export function NoteSheet({ open, onClose, exercise, id }) {
  const [text, setText] = useState(exercise.note || "");
  useEffect(() => open && setText(exercise.note || ""), [open]);
  return html`
    <${Sheet} open=${open} onClose=${onClose} title="Note" grouped
      left=${html`<button class="nav-button" onClick=${onClose}>Cancel</button>`}
      right=${html`<button class="nav-button bold" onClick=${() => { saveExerciseNote(id, text); onClose(); }}>Save</button>`}>
      <${Group} footer=${`Shows on ${exercise.name} every time you do it. Good for seat height, grip, cues.`}>
        <div class="cell-block"><textarea class="text-field" rows="4" placeholder="e.g. Seat on 4, pin on 7" value=${text} onInput=${(e) => setText(e.currentTarget.value)}></textarea></div>
      </${Group}>
    </${Sheet}>`;
}

// A quick look at an exercise's history without leaving the workout.
function PeekSheet({ open, onClose, id, workout }) {
  const unit = settings.value.unit;
  const history = useMemo(() => (open ? exerciseHistory(sessions.value, id, { excludeId: workout.id }) : []), [open, sessions.value, id]);
  const records = personalRecords(history);
  const bodyweight = history.length && history.every((p) => p.topWeight === 0);
  return html`
    <${Sheet} open=${open} onClose=${onClose} title=${exerciseName(id)} grouped large>
      ${!history.length ? html`<${Unavailable} icon="progress" title="No History Yet">After today, your sets for this exercise show up here.</${Unavailable}>` : html`
        <div class="chart-card">
          <${LineChart} points=${history.slice(-20).map((p) => ({ x: p.date, y: bodyweight ? p.totalReps : p.bestE1rm, note: `${format.weight(p.topSet.weight)} × ${p.topSet.reps}` }))}
            unit=${bodyweight ? " reps" : ` ${unit}`} caption=${bodyweight ? "Total reps" : "Estimated 1RM"} height=${150} label=${(v) => format.weight(Math.round(v))} />
        </div>
        <${Summary} items=${bodyweight
          ? [{ label: "Most reps", value: records.reps?.reps || 0 }, { label: "Sessions", value: history.length }]
          : [{ label: "Est. 1RM", value: format.weight(Math.round(records.e1rm?.value || 0)), unit }, { label: "Heaviest", value: format.weight(records.weight?.weight || 0), unit }, { label: "Sessions", value: history.length }]} />
        <${Group} header="Recent">
          ${[...history].reverse().slice(0, 5).map((point) => html`<${Cell} title=${format.date(point.date)} subtitle=${point.sets.map((set) => `${format.weight(set.weight)}×${set.reps}`).join(", ")} />`)}
        </${Group}>
        <${Group}><${Cell} title="Show All History" action chevron onClick=${() => { onClose(); go(`exercise/${id}`); }} /></${Group}>`}
    </${Sheet}>`;
}

// The countdown above the bottom edge while resting.
export function RestBar() {
  const timer = restTimer.value;
  if (!timer) return null;
  const R = 16;
  const C = 2 * Math.PI * R;
  if (timer.finishedAt) {
    return html`<div class="restbar done" role="status">
      <svg class="ring" viewBox="0 0 40 40"><circle class="track" cx="20" cy="20" r=${R} /><circle class="value" cx="20" cy="20" r=${R} stroke-dasharray=${C} stroke-dashoffset="0" /></svg>
      <div class="time"><span>Rest over</span><strong>Next set</strong></div>
      <button class="btn gray small" onClick=${stopRest}>OK</button>
    </div>`;
  }
  const left = Math.max(0, (timer.endsAt - now.value) / 1000);
  const fraction = Math.max(0, Math.min(1, left / timer.total));
  return html`
    <div class="restbar" role="timer" aria-label="Rest timer">
      <svg class="ring" viewBox="0 0 40 40"><circle class="track" cx="20" cy="20" r=${R} /><circle class="value" cx="20" cy="20" r=${R} stroke-dasharray=${C} stroke-dashoffset=${C * (1 - fraction)} /></svg>
      <div class="time"><span>Rest</span><strong>${format.clock(Math.ceil(left))}</strong></div>
      <button class="btn gray small" onClick=${() => adjustRest(-15)} aria-label="15 seconds less">−15</button>
      <button class="btn gray small" onClick=${() => adjustRest(15)} aria-label="15 seconds more">+15</button>
      <button class="btn tinted small" onClick=${stopRest}>Skip</button>
    </div>`;
}
