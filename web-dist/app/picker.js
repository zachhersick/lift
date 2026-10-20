// The exercise picker: search, filter by muscle, recent exercises first,
// then the library A–Z. Create a custom exercise when nothing matches.
import { useEffect, useMemo, useState } from "preact/hooks";
import { html } from "./html.js";
import { Icon } from "./icons.js";
import { Cell, Group, SearchField, Sheet } from "./ui.js";
import { EQUIPMENT, MUSCLES } from "./exercises.js";
import { exercises, save, sessions } from "./store.js";
import { byNewest, uid } from "./model.js";
import { capitalize } from "./format.js";

export function ExercisePicker({ open, onClose, onPick, title = "Add Exercise", exclude = [] }) {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [creating, setCreating] = useState(null);

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
      if (seen.length >= 6) break;
    }
    return seen.slice(0, 6);
  }, [sessions.value]);

  const skip = new Set(exclude);
  const q = query.trim().toLowerCase();
  const matches = exercises.value.filter((e) => !skip.has(e.id) && (!muscle || e.muscle === muscle) && (!q || e.name.toLowerCase().includes(q) || e.muscle?.includes(q) || e.equipment?.includes(q)));
  const recent = !q && !muscle ? recentIds.map((id) => matches.find((e) => e.id === id)).filter(Boolean) : [];
  const exact = matches.some((e) => e.name.toLowerCase() === q);
  const byLetter = new Map();
  for (const exercise of matches) {
    const letter = /[a-z]/i.test(exercise.name[0]) ? exercise.name[0].toUpperCase() : "#";
    if (!byLetter.has(letter)) byLetter.set(letter, []);
    byLetter.get(letter).push(exercise);
  }

  const pick = (exercise) => {
    onPick(exercise);
    onClose();
  };
  const row = (exercise) => html`<${Cell} key=${exercise.id} title=${exercise.name} subtitle=${`${capitalize(exercise.muscle || "other")} · ${capitalize(exercise.equipment || "other")}${exercise.builtIn ? "" : " · Custom"}`} onClick=${() => pick(exercise)} />`;

  if (creating) {
    return html`<${CreateExercise} open=${open} draft=${creating} onCancel=${() => setCreating(null)} onClose=${onClose} onSaved=${pick} />`;
  }

  return html`
    <${Sheet} open=${open} onClose=${onClose} title=${title} large grouped
      left=${html`<button class="nav-button" onClick=${onClose}>Cancel</button>`}
      right=${html`<button class="nav-button" onClick=${() => setCreating({ name: query.trim(), muscle: muscle || "chest", equipment: "barbell" })} aria-label="New exercise"><${Icon} name="plus" size=${22} stroke=${2.4} /></button>`}>
      <div style="display:flex;flex-direction:column;gap:12px">
        <${SearchField} value=${query} onInput=${setQuery} placeholder="Search exercises" />
        <div class="chips">
          <button class=${`chip ${!muscle ? "on" : ""}`} onClick=${() => setMuscle("")}>All</button>
          ${MUSCLES.map((name) => html`<button class=${`chip ${muscle === name ? "on" : ""}`} onClick=${() => setMuscle(muscle === name ? "" : name)}>${capitalize(name)}</button>`)}
        </div>
      </div>
      ${q && !exact ? html`<${Group}><${Cell} title=${`Create “${query.trim()}”`} action icon="plus" onClick=${() => setCreating({ name: query.trim(), muscle: muscle || "chest", equipment: "barbell" })} /></${Group}>` : null}
      ${recent.length ? html`<${Group} header="Recent">${recent.map(row)}</${Group}>` : null}
      ${[...byLetter.entries()].map(([letter, list]) => html`<${Group} header=${letter}>${list.map(row)}</${Group}>`)}
      ${!matches.length ? html`<p class="secondary subhead" style="text-align:center;padding:24px">No exercises match.</p>` : null}
    </${Sheet}>`;
}

function CreateExercise({ open, draft, onCancel, onClose, onSaved }) {
  const [name, setName] = useState(draft.name);
  const [muscle, setMuscle] = useState(draft.muscle);
  const [equipment, setEquipment] = useState(draft.equipment);
  const submit = async () => {
    if (!name.trim()) return;
    onSaved(await save({ id: uid("x"), kind: "exercise", name: name.trim(), muscle, equipment }));
  };
  const select = (value, set, options, label) => html`
    <select class="text-field right" style="width:auto;color:var(--label-2)" value=${value} onChange=${(e) => set(e.currentTarget.value)} aria-label=${label}>
      ${options.map((o) => html`<option value=${o}>${capitalize(o)}</option>`)}
    </select>`;
  return html`
    <${Sheet} open=${open} onClose=${onClose} title="New Exercise" large grouped
      left=${html`<button class="nav-button" onClick=${onCancel}>Back</button>`}
      right=${html`<button class="nav-button bold" disabled=${!name.trim()} onClick=${submit}>Add</button>`}>
      <${Group}>
        <div class="cell-block"><input class="text-field" type="text" placeholder="Name, e.g. Cable Y-Raise" value=${name} onInput=${(e) => setName(e.currentTarget.value)} /></div>
      </${Group}>
      <${Group} footer="Muscle group feeds your weekly sets. Barbell lifts get plate math and a bar warm-up.">
        <${Cell} title="Muscle group">${select(muscle, setMuscle, MUSCLES, "Muscle group")}</${Cell}>
        <${Cell} title="Equipment">${select(equipment, setEquipment, EQUIPMENT, "Equipment")}</${Cell}>
      </${Group}>
    </${Sheet}>`;
}
