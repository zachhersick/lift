// Choose an exercise: fuzzy search (Kokonut's matcher), filter by muscle,
// recent ones first, then A–Z. Create a custom exercise when nothing fits,
// and edit any exercise's primary and secondary muscles, equipment or
// tracking type, and the name of one you made.
import { Plus, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { fuzzyMatch } from "@/components/kokonutui/action-search-bar";
import { BUILT_IN, EQUIPMENT, MUSCLES } from "@/lib/exercises.js";
import { byNewest, exerciseInUse, indirectMuscles, inferredSecondary, uid } from "@/lib/model.js";
import { exerciseIndex, exercises, resetExercise, save, saveExercise, sessions, workouts } from "@/lib/store.js";
import { ask } from "@/lib/dialogs";
import { notify } from "@/lib/notify";
import { capitalize } from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { Card, Chip, Row, Section, Sheet, SheetAction } from "./kit";

type Exercise = { id: string; name: string; muscle?: string; equipment?: string; builtIn?: boolean; track?: string };

const TRACK_LABEL: Record<string, string> = { cardio: "Cardio", timed: "Timed" };
const TRACK_HELP: Record<string, string> = { strength: "Weight and reps", cardio: "Incline, speed and time", timed: "Time, with optional reps" };

function Highlight({ text, matches }: { text: string; matches: number[] }) {
  if (!matches.length) return <>{text}</>;
  const set = new Set(matches);
  return (
    <>
      {text.split("").map((ch, i) => (
        <span className={set.has(i) ? "text-primary" : undefined} key={i}>
          {ch}
        </span>
      ))}
    </>
  );
}

export function ExercisePicker({ open, onClose, onPick, title = "Add Exercise", exclude = [] }: { open: boolean; onClose: () => void; onPick: (exercise: Exercise) => void; title?: string; exclude?: string[] }) {
  const all = useValue(exercises) as Exercise[];
  const history = useValue(sessions);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [creating, setCreating] = useState<null | { name: string; muscle: string; equipment: string }>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setMuscle("");
      setCreating(null);
    }
  }, [open]);

  const recentIds = useMemo(() => {
    const seen: string[] = [];
    for (const workout of [...history].sort(byNewest)) {
      for (const entry of workout.entries || []) if (!seen.includes(entry.exerciseId)) seen.push(entry.exerciseId);
      if (seen.length >= 6) break;
    }
    return seen.slice(0, 6);
  }, [history]);

  const skip = new Set(exclude);
  const q = query.trim();
  const pool = all.filter((e) => !skip.has(e.id) && (!muscle || e.muscle === muscle));
  const ranked = q
    ? pool
        .map((e) => {
          // Name matches rank first and get highlighted; muscle/equipment matches still count.
          const onName = fuzzyMatch(e.name, q);
          const other = onName ? null : fuzzyMatch(`${e.muscle} ${e.equipment}`, q);
          return { e, m: onName ?? (other && { score: other.score - 50, matches: [] }) };
        })
        .filter((x) => x.m)
        .sort((a, b) => b.m!.score - a.m!.score)
    : [];
  const exact = pool.some((e) => e.name.toLowerCase() === q.toLowerCase());
  const recent = !q && !muscle ? recentIds.map((id) => pool.find((e) => e.id === id)).filter(Boolean) as Exercise[] : [];
  const byLetter = new Map<string, Exercise[]>();
  if (!q) {
    for (const e of pool) {
      const letter = /[a-z]/i.test(e.name[0]) ? e.name[0].toUpperCase() : "#";
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter)!.push(e);
    }
  }

  const pick = (exercise: Exercise) => {
    onPick(exercise);
    onClose();
  };
  const row = (e: Exercise, matches: number[] = []) => (
    <Row
      key={e.id}
      onClick={() => pick(e)}
      subtitle={`${capitalize(e.muscle || "other")} · ${capitalize(e.equipment || "other")}${e.track && TRACK_LABEL[e.track] ? ` · ${TRACK_LABEL[e.track]}` : ""}${e.builtIn ? "" : " · Custom"}`}
      title={<Highlight matches={matches} text={e.name} />}
    />
  );

  if (creating) {
    return <CreateExercise draft={creating} onBack={() => setCreating(null)} onClose={onClose} onSaved={pick} open={open} />;
  }

  return (
    <Sheet
      left={<SheetAction onClick={onClose}>Cancel</SheetAction>}
      onClose={onClose}
      open={open}
      right={
        <button aria-label="New exercise" className="grid size-9 place-items-center rounded-full text-primary active:bg-accent" onClick={() => setCreating({ name: q, muscle: muscle || "chest", equipment: "barbell" })} type="button">
          <Plus className="size-5" strokeWidth={2.4} />
        </button>
      }
      tall
      title={title}
    >
      <div className="flex flex-col gap-3">
        <label className="flex h-11 items-center gap-2 rounded-2xl bg-muted px-3.5 text-muted-foreground focus-within:ring-2 focus-within:ring-primary/40">
          <Search className="size-[18px] shrink-0" strokeWidth={2.2} />
          <input
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search 100+ exercises"
            type="search"
            value={query}
          />
          {query ? (
            <button aria-label="Clear search" className="grid size-6 place-items-center rounded-full bg-muted-foreground/30 text-background" onClick={() => setQuery("")} type="button">
              <X className="size-3.5" strokeWidth={3} />
            </button>
          ) : null}
        </label>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <Chip on={!muscle} onClick={() => setMuscle("")}>
            All
          </Chip>
          {MUSCLES.map((name: string) => (
            <Chip key={name} on={muscle === name} onClick={() => setMuscle(muscle === name ? "" : name)}>
              {capitalize(name)}
            </Chip>
          ))}
        </div>
      </div>

      {q && !exact ? (
        <Card>
          <Row icon={Plus} onClick={() => setCreating({ name: q, muscle: muscle || "chest", equipment: "barbell" })} title={`Create “${q}”`} tone="action" />
        </Card>
      ) : null}

      {q ? (
        ranked.length ? (
          <Section title="Results">
            <Card className="divide-y divide-border">{ranked.slice(0, 40).map((x) => row(x.e, x.m!.matches))}</Card>
          </Section>
        ) : (
          <p className="py-8 text-center text-[14.5px] text-muted-foreground">No exercises match “{q}”.</p>
        )
      ) : (
        <>
          {recent.length ? (
            <Section title="Recent">
              <Card className="divide-y divide-border">{recent.map((e) => row(e))}</Card>
            </Section>
          ) : null}
          {[...byLetter.entries()].map(([letter, list]) => (
            <motion.section animate={{ opacity: 1 }} className="flex flex-col gap-2" initial={{ opacity: 0 }} key={letter}>
              <h3 className="px-1 text-[13px] font-semibold text-muted-foreground">{letter}</h3>
              <Card className="divide-y divide-border">{list.map((e) => row(e))}</Card>
            </motion.section>
          ))}
        </>
      )}
    </Sheet>
  );
}

type Fields = { name: string; muscle: string; equipment: string; track: string; secondary: string[] };

// Muscles that can be secondary: anything but the primary one, cardio and
// full body.
const SECONDARY = MUSCLES.filter((m: string) => !["cardio", "full body"].includes(m));
const sameMuscles = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();

// What to store as an exercise's secondary muscles: nothing when they match
// what its name implies (so they keep following the name), else the list.
function secondaryToSave(fields: Fields) {
  return sameMuscles(fields.secondary, inferredSecondary({ name: fields.name.trim(), muscle: fields.muscle })) ? undefined : fields.secondary;
}

// Name, primary and secondary muscles, tracking type and equipment, for
// creating or editing.
function ExerciseFields({ value, onChange, trackLocked, autoFocus, nameLocked }: { value: Fields; onChange: (next: Fields) => void; trackLocked?: string; autoFocus?: boolean; nameLocked?: boolean }) {
  const set = (change: Partial<Fields>) => onChange({ ...value, ...change });
  const toggle = (muscle: string) => set({ secondary: value.secondary.includes(muscle) ? value.secondary.filter((m) => m !== muscle) : [...value.secondary, muscle] });
  return (
    <>
      <Card className="p-4">
        {nameLocked ? (
          <p className="text-[17px]">{value.name}</p>
        ) : (
          <input aria-label="Exercise name" autoFocus={autoFocus} className="w-full bg-transparent text-[17px] outline-none placeholder:text-muted-foreground" onChange={(e) => set({ name: e.currentTarget.value })} placeholder="Name, e.g. Cable Y-Raise" value={value.name} />
        )}
      </Card>
      <Section footer="Every set counts toward this muscle's weekly sets in the Coach and split analysis. Barbell and plate-loaded lifts get plate math." title="Primary muscle">
        <div className="flex flex-wrap gap-2">
          {MUSCLES.map((m: string) => (
            <Chip key={m} on={value.muscle === m} onClick={() => set({ muscle: m, secondary: value.secondary.filter((x) => x !== m) })}>
              {capitalize(m)}
            </Chip>
          ))}
        </div>
      </Section>
      {value.muscle !== "cardio" && value.track !== "cardio" ? (
        <Section footer="Muscles it also works, like triceps on a bench press. Each set counts as half a set for them (Pelland et al., 2024)." title="Secondary muscles">
          <div className="flex flex-wrap gap-2">
            {SECONDARY.filter((m: string) => m !== value.muscle).map((m: string) => (
              <Chip key={m} on={value.secondary.includes(m)} onClick={() => toggle(m)}>
                {capitalize(m)}
              </Chip>
            ))}
          </div>
        </Section>
      ) : null}
      <Section footer={trackLocked ? `Fixed once sets are logged: your past sets were recorded as ${trackLocked.toLowerCase()}. Make a new exercise to log it another way.` : TRACK_HELP[value.track]} title="Logged as">
        <div className="flex flex-wrap gap-2">
          {["strength", "cardio", "timed"].map((t) => (
            <Chip className={trackLocked && value.track !== t ? "pointer-events-none opacity-40" : undefined} key={t} on={value.track === t} onClick={() => !trackLocked && set({ track: t })}>
              {capitalize(t)}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Equipment">
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((m: string) => (
            <Chip key={m} on={value.equipment === m} onClick={() => set({ equipment: m })}>
              {capitalize(m)}
            </Chip>
          ))}
        </div>
      </Section>
    </>
  );
}

function CreateExercise({ open, draft, onBack, onClose, onSaved }: { open: boolean; draft: { name: string; muscle: string; equipment: string }; onBack: () => void; onClose: () => void; onSaved: (e: Exercise) => void }) {
  const [fields, setFields] = useState<Fields>({ ...draft, track: draft.muscle === "cardio" ? "cardio" : "strength", secondary: [] });
  const submit = async () => {
    if (!fields.name.trim()) return;
    onSaved(await save({ id: uid("x"), kind: "exercise", ...fields, name: fields.name.trim(), secondary: secondaryToSave(fields) }));
  };
  return (
    <Sheet left={<SheetAction onClick={onBack}>Back</SheetAction>} onClose={onClose} open={open} right={<SheetAction bold disabled={!fields.name.trim()} onClick={submit}>Add</SheetAction>} tall title="New Exercise">
      <ExerciseFields autoFocus onChange={setFields} value={fields} />
    </Sheet>
  );
}

// Fix an exercise: rename one you made, move it to the right muscle group
// (say, triceps instead of chest) or set the muscles it also works. Past
// workouts follow the change; for built-ins it's an override you can reset.
export function EditExerciseSheet({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const index = useValue(exerciseIndex) as Map<string, any>;
  const list = useValue(workouts) as any[];
  const exercise = index.get(id);
  const [fields, setFields] = useState<Fields>({ name: "", muscle: "chest", equipment: "barbell", track: "strength", secondary: [] });
  useEffect(() => {
    if (open && exercise) setFields({ name: exercise.name || "", muscle: exercise.muscle || "chest", equipment: exercise.equipment || "other", track: exercise.track || "strength", secondary: indirectMuscles(exercise) });
  }, [open]);
  if (!exercise) return null;
  const inUse = exerciseInUse(list, id);
  const original = exercise.builtIn ? BUILT_IN.find((e: any) => e.id === id) : null;
  const changed = original && ((["name", "muscle", "equipment", "track"] as const).some((key) => (exercise[key] || "") !== (original[key] || "")) || !sameMuscles(indirectMuscles(exercise), inferredSecondary(original)));
  const submit = async () => {
    if (!fields.name.trim()) return;
    await saveExercise(id, { ...fields, name: exercise.builtIn ? exercise.name : fields.name.trim(), track: inUse ? exercise.track || "strength" : fields.track, secondary: secondaryToSave({ ...fields, name: exercise.name }) });
    notify(`${fields.name.trim()} updated`);
    onClose();
  };
  return (
    <Sheet left={<SheetAction onClick={onClose}>Cancel</SheetAction>} onClose={onClose} open={open} right={<SheetAction bold disabled={!fields.name.trim()} onClick={submit}>Save</SheetAction>} tall title="Edit Exercise">
      <ExerciseFields nameLocked={exercise.builtIn} onChange={setFields} trackLocked={inUse ? capitalize(exercise.track || "strength") : undefined} value={fields} />
      <p className="px-1 text-[13px] text-muted-foreground">
        Changes apply everywhere, including past workouts, your split, charts and the Coach.{exercise.builtIn ? " This is a built-in exercise, so the change is saved as your own version." : ""}
      </p>
      {changed ? (
        <Card>
          <Row
            onClick={async () => {
              if (await ask({ title: `Reset ${original.name}?`, message: "Goes back to the built-in muscles, equipment and type. Your note stays.", confirm: "Reset" })) {
                await resetExercise(id);
                onClose();
              }
            }}
            title="Reset to built-in"
            tone="action"
          />
        </Card>
      ) : null}
    </Sheet>
  );
}
