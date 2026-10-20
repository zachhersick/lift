// The exercise picker sheet: search, filter by muscle, recent exercises first,
// and create a custom exercise when nothing matches.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { html } from "./html.js";
import { Icon } from "./icons.js";
import { Sheet } from "./ui.js";
import { EQUIPMENT, MUSCLES } from "./exercises.js";
import { exercises, save, sessions } from "./store.js";
import { byNewest, uid } from "./model.js";
import { capitalize } from "./format.js";

export function ExercisePicker({ open, onClose, onPick, title = "Add exercise", exclude = [] }) {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [creating, setCreating] = useState(null);
  const input = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setMuscle("");
      setCreating(null);
    }
  }, [open]);

  const recentIds = useMemo(() => {
    const seen = [];
    for (const workout of [...sessions.value].sort(byNewest)) {
      for (const entry of workout.entries || []) if (!seen.includes(entry.exerciseId)) seen.push(entry.exerciseId);
      if (seen.length >= 8) break;
    }
    return seen;
  }, [sessions.value]);

  const skip = new Set(exclude);
  const q = query.trim().toLowerCase();
  const matches = exercises.value.filter((exercise) => !skip.has(exercise.id) && (!muscle || exercise.muscle === muscle) && (!q || exercise.name.toLowerCase().includes(q) || exercise.muscle?.includes(q) || exercise.equipment?.includes(q)));
  const recent = !q && !muscle ? recentIds.map((id) => matches.find((exercise) => exercise.id === id)).filter(Boolean) : [];
  const exact = matches.some((exercise) => exercise.name.toLowerCase() === q);

  const pick = (exercise) => {
    onPick(exercise);
    onClose();
  };

  const row = (exercise) => html`
    <button class="pick-row" key=${exercise.id} onClick=${() => pick(exercise)}>
      <span class="pick-name">${exercise.name}</span>
      <span class="pick-meta">${capitalize(exercise.muscle || "other")} · ${capitalize(exercise.equipment || "other")}${exercise.builtIn ? "" : " · Custom"}</span>
    </button>`;

  return html`
    <${Sheet} open=${open} onClose=${onClose} title=${creating ? "New exercise" : title} tall>
      ${creating ? html`<${CreateExercise} draft=${creating} onCancel=${() => setCreating(null)} onSaved=${pick} />` : html`
        <div class="search">
          <${Icon} name="search" size=${18} />
          <input ref=${input} type="search" placeholder="Search exercises" value=${query} onInput=${(e) => setQuery(e.currentTarget.value)} autocomplete="off" />
          ${query ? html`<button class="icon-btn small" onClick=${() => setQuery("")} aria-label="Clear"><${Icon} name="x" size=${16} /></button>` : null}
        </div>
        <div class="chips">
          <button class=${`chip ${!muscle ? "on" : ""}`} onClick=${() => setMuscle("")}>All</button>
          ${MUSCLES.map((name) => html`<button class=${`chip ${muscle === name ? "on" : ""}`} onClick=${() => setMuscle(muscle === name ? "" : name)}>${capitalize(name)}</button>`)}
        </div>
        ${q && !exact ? html`<button class="pick-create" onClick=${() => setCreating({ name: query.trim(), muscle: muscle || "chest", equipment: "barbell" })}><${Icon} name="plus" size=${18} />Create “${query.trim()}”</button>` : null}
        ${!q ? html`<button class="pick-create subtle" onClick=${() => setCreating({ name: "", muscle: muscle || "chest", equipment: "barbell" })}><${Icon} name="plus" size=${18} />Create custom exercise</button>` : null}
        ${recent.length ? html`<div class="pick-group">Recent</div>${recent.map(row)}<div class="pick-group">All exercises</div>` : null}
        ${matches.map(row)}
        ${!matches.length ? html`<p class="muted center pad">No exercises match.</p>` : null}`}
    </${Sheet}>`;
}

function CreateExercise({ draft, onCancel, onSaved }) {
  const [name, setName] = useState(draft.name);
  const [muscle, setMuscle] = useState(draft.muscle);
  const [equipment, setEquipment] = useState(draft.equipment);
  const submit = async () => {
    if (!name.trim()) return;
    const record = await save({ id: uid("x"), kind: "exercise", name: name.trim(), muscle, equipment });
    onSaved(record);
  };
  return html`
    <div class="form">
      <label class="field"><span>Name</span><input type="text" value=${name} onInput=${(e) => setName(e.currentTarget.value)} placeholder="e.g. Cable Y-Raise" /></label>
      <label class="field"><span>Muscle group</span>
        <select value=${muscle} onChange=${(e) => setMuscle(e.currentTarget.value)}>${MUSCLES.map((m) => html`<option value=${m}>${capitalize(m)}</option>`)}</select>
      </label>
      <label class="field"><span>Equipment</span>
        <select value=${equipment} onChange=${(e) => setEquipment(e.currentTarget.value)}>${EQUIPMENT.map((m) => html`<option value=${m}>${capitalize(m)}</option>`)}</select>
      </label>
      <div class="row gap">
        <button class="btn ghost grow" onClick=${onCancel}>Back</button>
        <button class="btn primary grow" disabled=${!name.trim()} onClick=${submit}>Create</button>
      </div>
    </div>`;
}
