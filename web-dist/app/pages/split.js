// Split: the days in your rotation, and the editor for one day's exercises
// (target sets, rep range, rest, supersets).
import { useEffect, useState } from "preact/hooks";
import { html } from "../html.js";
import { Icon } from "../icons.js";
import { ActionList, ask, Cell, Group, NavBar, Sheet, Stepper, Switch, Unavailable } from "../ui.js";
import { ExercisePicker } from "../picker.js";
import { exerciseName, finishedWorkouts, records, remove, saveMany, settings, splitDays, update } from "../store.js";
import { lastDoneAt, nextSplitDay, supersetLabels, uid } from "../model.js";
import { addDay, applyTemplate } from "../actions.js";
import { TEMPLATES } from "../exercises.js";
import { go } from "../router.js";
import * as format from "../format.js";

function Reorder({ index, count, onMove, name }) {
  return html`<span class="reorder">
    <button disabled=${index === 0} onClick=${(e) => { e.stopPropagation(); onMove(-1); }} aria-label=${`Move ${name} up`}><${Icon} name="chevronUp" size=${20} stroke=${2.4} /></button>
    <button disabled=${index === count - 1} onClick=${(e) => { e.stopPropagation(); onMove(1); }} aria-label=${`Move ${name} down`}><${Icon} name="chevronDown" size=${20} stroke=${2.4} /></button>
  </span>`;
}

export function Split() {
  const [templates, setTemplates] = useState(false);
  const [editing, setEditing] = useState(false);
  const days = splitDays.value;
  const next = nextSplitDay(days, finishedWorkouts.value);

  const move = (index, delta) => {
    const list = [...days];
    const j = index + delta;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    saveMany(list.map((day, position) => ({ ...day, position })));
  };

  return html`
    <div class="page">
      <${NavBar} title="Split" subtitle="Your rotation, in order"
        trailing=${days.length > 1 ? html`<button class=${`nav-button ${editing ? "bold" : ""}`} onClick=${() => setEditing(!editing)}>${editing ? "Done" : "Edit"}</button>` : null} />
      ${!days.length ? html`<${Unavailable} icon="split" title="No Days Yet">Add your training days in the order you rotate through them, rest days included.</${Unavailable}>` : html`
        <${Group} header="Rotation" footer="After the last day it starts over. Doing a different day than suggested moves the rotation along.">
          ${days.map((day, index) => {
            const last = lastDoneAt(day.id, finishedWorkouts.value);
            const isNext = next?.day.id === day.id;
            return html`<${Cell} key=${day.id} title=${day.name}
              subtitle=${`${day.rest ? "Rest day" : format.plural(day.exercises?.length || 0, "exercise")}${last ? ` · ${format.relativeDay(last)}` : ""}`}
              chevron=${!editing} onClick=${editing ? undefined : () => go(`split/${day.id}`)}>
              ${isNext && !editing ? html`<span class="badge">Next</span>` : null}
              ${editing ? html`<${Reorder} index=${index} count=${days.length} name=${day.name} onMove=${(d) => move(index, d)} />` : null}
            </${Cell}>`;
          })}
        </${Group}>`}
      <${Group}>
        <${Cell} title="Add Training Day" action onClick=${async () => go(`split/${(await addDay()).id}`)} />
        <${Cell} title="Add Rest Day" action onClick=${() => addDay({ rest: true })} />
        <${Cell} title="Add Days from a Template" action onClick=${() => setTemplates(true)} />
      </${Group}>

      <${Sheet} open=${templates} onClose=${() => setTemplates(false)} title="Templates" grouped>
        <${Group} footer="Adds the template's days to the end of your rotation.">
          ${TEMPLATES.map((template) => html`<${Cell} title=${template.name} subtitle=${template.blurb} chevron onClick=${async () => { await applyTemplate(template); setTemplates(false); }} />`)}
        </${Group}>
      </${Sheet}>
    </div>`;
}

export function DayEditor({ id }) {
  const day = records.value.get(id);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(day?.name || "");
  const [target, setTarget] = useState(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => setName(day?.name || ""), [id]);

  if (!day || day.deleted) return html`<div class="page"><${NavBar} title="Day" large=${false} backTo="split" backLabel="Split" /><${Unavailable} icon="split" title="Day Not Found" /></div>`;

  const change = (fn) => update(id, fn);
  const items = day.exercises || [];
  const labels = supersetLabels(items);

  const move = (index, delta) => change((draft) => {
    const j = index + delta;
    if (j < 0 || j >= draft.exercises.length) return;
    [draft.exercises[index], draft.exercises[j]] = [draft.exercises[j], draft.exercises[index]];
  });

  const del = async () => {
    if (!(await ask({ title: `Delete ${day.name}?`, message: "Past workouts stay in History.", confirm: "Delete", danger: true }))) return;
    await remove(id);
    await saveMany(splitDays.value.filter((d) => d.id !== id).map((d, position) => ({ ...d, position })));
    go("split", { replace: true });
  };

  return html`
    <div class="page">
      <${NavBar} title=${day.name || "Untitled"} subtitle=${day.rest ? "Rest day" : format.plural(items.length, "exercise")} backTo="split" backLabel="Split"
        trailing=${items.length > 1 && !day.rest ? html`<button class=${`nav-button ${editing ? "bold" : ""}`} onClick=${() => setEditing(!editing)}>${editing ? "Done" : "Edit"}</button>` : null} />
      <${Group}>
        <${Cell} title="Name"><input class="text-field right" type="text" value=${name} placeholder="Push, Pull, Legs…" aria-label="Day name"
          onInput=${(e) => setName(e.currentTarget.value)} onBlur=${() => name.trim() && name.trim() !== day.name && change((d) => (d.name = name.trim()))} /></${Cell}>
        <${Cell} title="Rest Day"><${Switch} checked=${Boolean(day.rest)} label="Rest day" onChange=${(value) => change((d) => (d.rest = value))} /></${Cell}>
      </${Group}>

      ${day.rest ? html`<p class="group-footer">Rest days keep their place in the rotation. Tap “Done Resting” on Today to move on.</p>` : html`
        <${Group} header="Exercises" footer="Tap an exercise to set sets, rep range, rest, and supersets.">
          ${items.map((item, index) => html`
            <${Cell} key=${`${item.exerciseId}-${index}`} title=${html`${labels[index] ? html`<span class="ss-tag">${labels[index].group}${labels[index].position}</span>` : null}${exerciseName(item.exerciseId)}`}
              subtitle=${`${item.targetSets || 3} × ${item.repMin && item.repMax ? (item.repMin === item.repMax ? item.repMin : `${item.repMin}–${item.repMax}`) : "?"} · rest ${format.rest(item.restSec ?? settings.value.defaultRest)}`}
              chevron=${!editing} onClick=${editing ? undefined : () => setTarget(index)}>
              ${editing ? html`<${Reorder} index=${index} count=${items.length} name=${exerciseName(item.exerciseId)} onMove=${(d) => move(index, d)} />` : null}
            </${Cell}>`)}
          <${Cell} title="Add Exercise" action onClick=${() => setAdding(true)} />
        </${Group}>`}

      <${Group}><${Cell} title="Delete Day" destructive class="centered" onClick=${del} /></${Group}>

      <${ExercisePicker} open=${adding} onClose=${() => setAdding(false)} exclude=${items.map((item) => item.exerciseId)}
        onPick=${(exercise) => change((d) => { d.exercises = [...(d.exercises || []), { exerciseId: exercise.id, targetSets: 3, repMin: 8, repMax: 12, restSec: settings.value.defaultRest }]; })} />
      <${TargetSheet} open=${target !== null} index=${target} items=${items} onClose=${() => setTarget(null)}
        onSave=${(nextItems) => change((d) => (d.exercises = nextItems))} />
    </div>`;
}

const RESTS = [30, 45, 60, 90, 120, 150, 180, 240, 300];

function TargetSheet({ open, index, items, onClose, onSave }) {
  const [draft, setDraft] = useState(null);
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    if (!open || index === null || !items[index]) return;
    setDraft({ targetSets: 3, repMin: 8, repMax: 12, restSec: settings.value.defaultRest, ...items[index] });
    setLinked(Boolean(items[index].supersetId && items[index + 1]?.supersetId === items[index].supersetId));
  }, [open, index]);
  if (!draft || index === null) return html`<${Sheet} open=${false} onClose=${onClose} />`;
  const set = (change) => setDraft({ ...draft, ...change });
  const hasNext = index < items.length - 1;

  const saveIt = () => {
    const list = items.map((item) => ({ ...item }));
    list[index] = { ...draft, repMax: Math.max(draft.repMin, draft.repMax) };
    if (hasNext) {
      const together = list[index].supersetId && list[index + 1].supersetId === list[index].supersetId;
      if (linked && !together) {
        const sid = list[index].supersetId || list[index + 1].supersetId || uid("ss");
        const old = list[index + 1].supersetId;
        for (const item of list) if (old && item.supersetId === old) item.supersetId = sid;
        list[index].supersetId = sid;
        list[index + 1].supersetId = sid;
      } else if (!linked && together) {
        const sid = list[index].supersetId;
        const fresh = uid("ss");
        for (let i = index + 1; i < list.length && list[i].supersetId === sid; i += 1) list[i].supersetId = fresh;
      }
    }
    onSave(list);
    onClose();
  };

  const removeIt = () => {
    onSave(items.filter((_, i) => i !== index));
    onClose();
  };

  return html`
    <${Sheet} open=${open} onClose=${onClose} title=${exerciseName(draft.exerciseId)} grouped
      left=${html`<button class="nav-button" onClick=${onClose}>Cancel</button>`}
      right=${html`<button class="nav-button bold" onClick=${saveIt}>Save</button>`}>
      <${Group} footer=${`When every set reaches the top of the range, Lift suggests adding ${format.weight(settings.value.step)} ${settings.value.unit}.`}>
        <${Cell} title="Sets"><${Stepper} label="sets" value=${draft.targetSets || 3} min=${1} max=${12} onChange=${(v) => set({ targetSets: v })} /></${Cell}>
        <${Cell} title="Fewest reps"><${Stepper} label="minimum reps" value=${draft.repMin || 8} min=${1} max=${50} onChange=${(v) => set({ repMin: v, repMax: Math.max(v, draft.repMax || v) })} /></${Cell}>
        <${Cell} title="Most reps"><${Stepper} label="maximum reps" value=${draft.repMax || 12} min=${draft.repMin || 1} max=${60} onChange=${(v) => set({ repMax: v })} /></${Cell}>
      </${Group}>
      <${Group} header="Rest Between Sets">
        <div class="cell-block"><div class="chip-grid">${RESTS.map((s) => html`<button class=${`chip ${draft.restSec === s ? "on" : ""}`} onClick=${() => set({ restSec: s })}>${format.rest(s)}</button>`)}</div></div>
      </${Group}>
      ${hasNext ? html`
        <${Group} footer=${`Do ${exerciseName(draft.exerciseId)} and ${exerciseName(items[index + 1].exerciseId)} back to back. The rest timer starts after the second.`}>
          <${Cell} title="Superset with Next"><${Switch} checked=${linked} label="Superset with next" onChange=${setLinked} /></${Cell}>
        </${Group}>` : null}
      <${ActionList} items=${[{ label: "Remove from Day", icon: "trash", danger: true, onClick: removeIt }]} />
    </${Sheet}>`;
}
