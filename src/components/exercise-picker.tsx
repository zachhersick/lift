// Choose an exercise: fuzzy search (Kokonut's matcher), filter by muscle,
// recent ones first, then A–Z. Create a custom exercise when nothing fits.
import { Plus, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { fuzzyMatch } from "@/components/kokonutui/action-search-bar";
import { EQUIPMENT, MUSCLES } from "@/lib/exercises.js";
import { byNewest, uid } from "@/lib/model.js";
import { exercises, save, sessions } from "@/lib/store.js";
import { capitalize } from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { Card, Chip, Row, Section, Sheet, SheetAction } from "./kit";

type Exercise = { id: string; name: string; muscle?: string; equipment?: string; builtIn?: boolean };

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
      subtitle={`${capitalize(e.muscle || "other")} · ${capitalize(e.equipment || "other")}${e.builtIn ? "" : " · Custom"}`}
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

function CreateExercise({ open, draft, onBack, onClose, onSaved }: { open: boolean; draft: { name: string; muscle: string; equipment: string }; onBack: () => void; onClose: () => void; onSaved: (e: Exercise) => void }) {
  const [name, setName] = useState(draft.name);
  const [muscle, setMuscle] = useState(draft.muscle);
  const [equipment, setEquipment] = useState(draft.equipment);
  const submit = async () => {
    if (!name.trim()) return;
    onSaved(await save({ id: uid("x"), kind: "exercise", name: name.trim(), muscle, equipment }));
  };
  return (
    <Sheet left={<SheetAction onClick={onBack}>Back</SheetAction>} onClose={onClose} open={open} right={<SheetAction bold disabled={!name.trim()} onClick={submit}>Add</SheetAction>} tall title="New Exercise">
      <Card className="p-4">
        <input autoFocus className="w-full bg-transparent text-[17px] outline-none placeholder:text-muted-foreground" onChange={(e) => setName(e.currentTarget.value)} placeholder="Name, e.g. Cable Y-Raise" value={name} />
      </Card>
      <Section footer="The muscle group feeds your weekly sets. Barbell lifts get plate math and a bar warm-up." title="Muscle group">
        <div className="flex flex-wrap gap-2">
          {MUSCLES.map((m: string) => (
            <Chip key={m} on={muscle === m} onClick={() => setMuscle(m)}>
              {capitalize(m)}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Equipment">
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((m: string) => (
            <Chip key={m} on={equipment === m} onClick={() => setEquipment(m)}>
              {capitalize(m)}
            </Chip>
          ))}
        </div>
      </Section>
    </Sheet>
  );
}
