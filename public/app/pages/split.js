// Split: the days in your rotation, in order, and the editor for one day's
// exercises with target sets, rep range and rest.
import { useEffect, useState } from "preact/hooks";
import { html } from "../html.js";
import { Icon } from "../icons.js";
import { ask, Empty, Header, Menu, NumInput, Sheet, Stepper, Toggle } from "../ui.js";
import { ExercisePicker } from "../picker.js";
import { exerciseName, finishedWorkouts, records, remove, saveMany, settings, splitDays, update } from "../store.js";
import { lastDoneAt, nextSplitDay } from "../model.js";
import { addDay, applyTemplate } from "../actions.js";
import { TEMPLATES } from "../exercises.js";
import { go } from "../router.js";
import * as format from "../format.js";

export function Split() {
  const [templates, setTemplates] = useState(false);
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
      <${Header} title="Split" subtitle="Rotates in order. After the last day it starts over." />
      ${!days.length ? html`<${Empty} icon="split" title="No days yet">Add your training days in the order you rotate through them, rest days included.</${Empty}>` : html`
        <div class="stack">
          ${days.map((day, index) => html`
            <div class=${`card day-row ${next?.day.id === day.id ? "next" : ""}`} key=${day.id}>
              <span class="day-index">${index + 1}</span>
              <button class="grow day-main" onClick=${() => go(`split/${day.id}`)}>
                <strong>${day.rest ? html`<${Icon} name="moon" size=${16} /> ` : null}${day.name}</strong>
                <span>${day.rest ? "Rest day" : format.plural(day.exercises?.length || 0, "exercise")}${lastDoneAt(day.id, finishedWorkouts.value) ? ` · ${format.relativeDay(lastDoneAt(day.id, finishedWorkouts.value))}` : ""}</span>
                ${next?.day.id === day.id ? html`<em class="next-pill">Next</em>` : null}
              </button>
              <div class="day-move">
                <button class="icon-btn small" disabled=${index === 0} onClick=${() => move(index, -1)} aria-label=${`Move ${day.name} up`}><${Icon} name="up" size=${18} /></button>
                <button class="icon-btn small" disabled=${index === days.length - 1} onClick=${() => move(index, 1)} aria-label=${`Move ${day.name} down`}><${Icon} name="down" size=${18} /></button>
              </div>
            </div>`)}
        </div>`}
      <div class="row gap pad-top">
        <button class="btn secondary grow" onClick=${async () => go(`split/${(await addDay()).id}`)}><${Icon} name="plus" size=${18} /> Training day</button>
        <button class="btn secondary grow" onClick=${() => addDay({ rest: true })}><${Icon} name="moon" size=${18} /> Rest day</button>
      </div>
      <button class="btn ghost block" onClick=${() => setTemplates(true)}>Add days from a template</button>

      <${Sheet} open=${templates} onClose=${() => setTemplates(false)} title="Templates">
        <p class="muted small">Adds the template's days to the end of your split.</p>
        <${Menu} items=${TEMPLATES.map((template) => ({ label: template.name, hint: template.blurb, onClick: async () => { await applyTemplate(template); setTemplates(false); } }))} />
      </${Sheet}>
    </div>`;
}

export function DayEditor({ id }) {
  const day = records.value.get(id);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(day?.name || "");
  const [editing, setEditing] = useState(null);
  useEffect(() => setName(day?.name || ""), [id]);

  if (!day || day.deleted) return html`<div class="page"><${Header} title="Day" backTo="split" large=${false} /><${Empty} icon="split" title="Day not found" /></div>`;

  const change = (fn) => update(id, fn);
  const items = day.exercises || [];

  const move = (index, delta) => change((draft) => {
    const j = index + delta;
    if (j < 0 || j >= draft.exercises.length) return;
    [draft.exercises[index], draft.exercises[j]] = [draft.exercises[j], draft.exercises[index]];
  });

  const del = async () => {
    if (!(await ask({ title: `Delete ${day.name}?`, message: "Past workouts stay in History.", confirm: "Delete", danger: true }))) return;
    await remove(id);
    const rest = splitDays.value.filter((d) => d.id !== id);
    await saveMany(rest.map((d, position) => ({ ...d, position })));
    go("split", { replace: true });
  };

  return html`
    <div class="page">
      <${Header} title=${day.name || "Untitled day"} subtitle=${day.rest ? "Rest day" : format.plural(items.length, "exercise")} backTo="split" />
      <section class="card form">
        <label class="field"><span>Name</span>
          <input type="text" value=${name} onInput=${(e) => setName(e.currentTarget.value)} onBlur=${() => name.trim() && name.trim() !== day.name && change((d) => (d.name = name.trim()))} placeholder="Push, Pull, Legs…" />
        </label>
        <div class="field-row"><span>Rest day</span><${Toggle} checked=${Boolean(day.rest)} label="Rest day" onChange=${(value) => change((d) => (d.rest = value))} /></div>
      </section>

      ${day.rest ? html`<p class="muted center pad">Rest days keep their place in the rotation. Tap “Done resting” on Today to move on.</p>` : html`
        <div class="stack">
          ${items.map((item, index) => html`
            <div class="card plan-row" key=${`${item.exerciseId}-${index}`}>
              <button class="grow plan-main" onClick=${() => setEditing(index)}>
                <strong>${exerciseName(item.exerciseId)}</strong>
                <span>${item.targetSets || 3} × ${item.repMin && item.repMax ? (item.repMin === item.repMax ? item.repMin : `${item.repMin}–${item.repMax}`) : "?"} · rest ${format.rest(item.restSec ?? settings.value.defaultRest)}</span>
              </button>
              <div class="day-move">
                <button class="icon-btn small" disabled=${index === 0} onClick=${() => move(index, -1)} aria-label="Move up"><${Icon} name="up" size=${18} /></button>
                <button class="icon-btn small" disabled=${index === items.length - 1} onClick=${() => move(index, 1)} aria-label="Move down"><${Icon} name="down" size=${18} /></button>
              </div>
            </div>`)}
        </div>
        <button class="btn secondary block big pad-top" onClick=${() => setAdding(true)}><${Icon} name="plus" /> Add exercise</button>`}

      <button class="btn danger-text block pad-top" onClick=${del}><${Icon} name="trash" size=${18} /> Delete day</button>

      <${ExercisePicker} open=${adding} onClose=${() => setAdding(false)} exclude=${items.map((item) => item.exerciseId)}
        onPick=${(exercise) => change((d) => { d.exercises = [...(d.exercises || []), { exerciseId: exercise.id, targetSets: 3, repMin: 8, repMax: 12, restSec: settings.value.defaultRest }]; })} />
      <${TargetSheet} open=${editing !== null} item=${editing !== null ? items[editing] : null} onClose=${() => setEditing(null)}
        onSave=${(next) => change((d) => (d.exercises[editing] = next))}
        onRemove=${() => { change((d) => d.exercises.splice(editing, 1)); setEditing(null); }} />
    </div>`;
}

const RESTS = [30, 45, 60, 90, 120, 150, 180, 240, 300];

function TargetSheet({ open, item, onClose, onSave, onRemove }) {
  const [draft, setDraft] = useState(item);
  useEffect(() => open && item && setDraft({ targetSets: 3, repMin: 8, repMax: 12, restSec: settings.value.defaultRest, ...item }), [open]);
  if (!draft) return html`<${Sheet} open=${false} onClose=${onClose} />`;
  const set = (change) => setDraft({ ...draft, ...change });
  const save = () => {
    const repMin = Math.max(1, draft.repMin || 1);
    onSave({ ...draft, repMin, repMax: Math.max(repMin, draft.repMax || repMin) });
    onClose();
  };
  return html`
    <${Sheet} open=${open} onClose=${onClose} title=${item ? exerciseName(item.exerciseId) : ""}>
      <div class="form">
        <div class="field-row"><span>Sets</span><${Stepper} label="sets" value=${draft.targetSets || 3} min=${1} max=${12} onChange=${(v) => set({ targetSets: v })} /></div>
        <div class="field-row"><span>Rep range</span>
          <div class="range-inputs">
            <${NumInput} decimal=${false} value=${draft.repMin} label="Minimum reps" onChange=${(v) => set({ repMin: v })} />
            <span>to</span>
            <${NumInput} decimal=${false} value=${draft.repMax} label="Maximum reps" onChange=${(v) => set({ repMax: v })} />
          </div>
        </div>
        <p class="muted small">When every set reaches the top of the range, Lift suggests adding ${format.weight(settings.value.step)} ${settings.value.unit} next time.</p>
        <div class="field"><span>Rest between sets</span>
          <div class="rest-options">${RESTS.map((s) => html`<button class=${`chip ${draft.restSec === s ? "on" : ""}`} onClick=${() => set({ restSec: s })}>${format.rest(s)}</button>`)}</div>
        </div>
        <button class="btn primary block" onClick=${save}>Save</button>
        <button class="btn danger-text block" onClick=${onRemove}>Remove from day</button>
      </div>
    </${Sheet}>`;
}
