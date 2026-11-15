// Split: your splits with the current one marked, the days in one's rotation
// (drag to reorder) with the weekly sets it gives each muscle, and the editor
// for one day's exercises with sets, rep range, rest and supersets.
import { signal } from "@preact/signals-core";
import { Check, GripVertical, ListOrdered, MessageSquareText, Moon, Pencil, Plus, Trash2 } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import WheelPicker from "@/components/kokonutui/wheel-picker";
import { EditExerciseSheet, ExercisePicker } from "@/components/exercise-picker";
import { MuscleBars } from "@/components/insights";
import { Card, Chip, Empty, Page, Row, Section, Sheet, SheetAction, Stepper, Toggle, TopBar } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { addDay, applyTemplate, createSplit } from "@/lib/actions.js";
import { ask } from "@/lib/dialogs";
import { TEMPLATES } from "@/lib/exercises.js";
import { fromAssistant, indirectMuscles, lastDoneAt, MAIN_MUSCLES, nextSplitDay, splitIdOf, splitWeeklySets, supersetLabels, trackOf, uid, VOLUME_RANGE } from "@/lib/model.js";
import { go } from "@/lib/router.js";
import { exerciseIndex, exerciseName, finishedWorkouts, records, remove, removeSplit, saveMany, saveSettings, saveSplit, settings, splits, update } from "@/lib/store.js";
import * as format from "@/lib/format.js";
import { syncNow } from "@/lib/sync.js";
import { useValue } from "@/lib/use-signal";

// A row you can drag by its grip; the rest of the row stays tappable and
// scrolls normally.
function DragRow({ value, children, onDragEnd }: { value: any; children: ReactNode; onDragEnd: () => void }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      className="relative flex items-center bg-card"
      dragControls={controls}
      dragListener={false}
      onDragEnd={onDragEnd}
      value={value}
      whileDrag={{ scale: 1.02, boxShadow: "0 20px 40px -16px rgba(0,0,0,0.5)", zIndex: 10 }}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <button aria-label="Drag to reorder" className="grid h-14 w-11 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/60 active:cursor-grabbing" onPointerDown={(e) => controls.start(e)} type="button">
        <GripVertical className="size-5" />
      </button>
    </Reorder.Item>
  );
}

// The split being looked at. It outlives the page, so coming back from a day's
// editor returns to the same split. Looking at one never makes it current.
const viewing = signal<string | null>(null);

const ASSISTANTS: Record<string, string> = { chatgpt: "ChatGPT", claude: "Claude" };

function CurrentBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground">
      <Check className="size-3.5" strokeWidth={2} /> Current
    </span>
  );
}

export function Split() {
  const all = useValue(splits) as any[];
  const chosen = useValue(viewing);
  const current = all.find((split) => split.current);
  const shown = all.find((split) => split.id === chosen) || current;
  const days = shown.days as any[];
  const done = useValue(finishedWorkouts) as any[];
  const [order, setOrder] = useState(days);
  const [starting, setStarting] = useState(false);
  const [naming, setNaming] = useState<"new" | "rename" | null>(null);
  useEffect(() => setOrder(days), [days]);
  // Splits from an assistant arrive through sync, so check for new ones on open.
  useEffect(() => {
    syncNow();
  }, []);
  const next = shown.current ? nextSplitDay(days, done) : null;

  const persist = () => saveMany(order.map((day: any, position: number) => ({ ...day, position })));
  const index = useValue(exerciseIndex) as Map<string, any>;
  const weekly = splitWeeklySets(days, index);
  const volumeRows = [...MAIN_MUSCLES, ...[...weekly.keys()].filter((m) => !MAIN_MUSCLES.includes(m) && !["cardio", "full body", "other"].includes(m))].map((muscle) => ({ muscle, sets: weekly.get(muscle) || 0 }));
  const under = volumeRows.filter((row) => row.sets < VOLUME_RANGE[0]);

  const makeCurrent = async () => {
    await saveSettings({ currentSplit: shown.id });
    viewing.value = null;
  };
  const del = async () => {
    if (!(await ask({ title: `Delete ${shown.name}?`, message: "Its days go too. Past workouts stay in History.", confirm: "Delete", danger: true }))) return;
    await removeSplit(shown);
    viewing.value = null;
  };
  // A new split stays aside until it's made current, so nothing mixes with the days you're on.
  const startFrom = async (template: any) => {
    const split = await createSplit(template.name);
    await applyTemplate(template, split.id);
    viewing.value = split.id;
    setStarting(false);
  };
  const saveName = async (name: string) => {
    if (naming === "new") viewing.value = (await createSplit(name)).id;
    else await saveSplit(shown.id, { name });
    setNaming(null);
  };

  return (
    <Page>
      <TopBar subtitle={`Current split: ${current.name}`} title="Split" />
      <Section footer="Today follows your current split. Each split remembers its place in the rotation, and your history stays whichever you use." title="Your splits">
        <Card className="divide-y divide-border">
          {all.map((split) => (
            <Row
              className={split.id === shown.id && all.length > 1 ? "bg-accent/60" : undefined}
              key={split.id}
              onClick={() => (viewing.value = split.id)}
              subtitle={[format.plural(split.days.length, "day"), fromAssistant(split) ? `from ${ASSISTANTS[split.source]}` : null].filter(Boolean).join(" · ")}
              title={split.name}
            >
              {split.current ? <CurrentBadge /> : null}
            </Row>
          ))}
          <Row icon={Plus} onClick={() => setStarting(true)} title="New split" tone="action" />
        </Card>
      </Section>
      {!shown.current ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="flex items-start gap-2 text-[14px] text-muted-foreground">
            {fromAssistant(shown) ? <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} /> : null}
            <span><b className="font-medium text-foreground">{shown.name}</b> isn't current. Today keeps following {current.name} until you switch.</span>
          </p>
          <Button onClick={makeCurrent}>
            <Check className="size-4" strokeWidth={1.75} /> Make current
          </Button>
        </Card>
      ) : null}
      {!days.length ? (
        <Empty icon={ListOrdered} title="No days yet">
          Add your training days in the order you rotate through them, rest days included.
        </Empty>
      ) : (
        <Section footer="Drag to reorder. After the last day it starts over. Doing a different day than suggested moves the rotation along." title={all.length > 1 ? `${shown.name}: rotation` : "Rotation"}>
          <Reorder.Group as="div" axis="y" className="surface divide-y divide-border overflow-hidden rounded-2xl" onReorder={setOrder} values={order}>
            {order.map((day: any) => {
              const last = lastDoneAt(day.id, done);
              const isNext = next?.day.id === day.id;
              return (
                <DragRow key={day.id} onDragEnd={persist} value={day}>
                  <Row onClick={() => go(`split/${day.id}`)} subtitle={`${day.rest ? "Rest day" : format.plural(day.exercises?.length || 0, "exercise")}${last ? ` · ${format.relativeDay(last)}` : ""}`} title={day.name}>
                    {isNext ? <span className="text-[13px] text-primary">Next</span> : null}
                  </Row>
                </DragRow>
              );
            })}
          </Reorder.Group>
        </Section>
      )}
      {days.some((day: any) => !day.rest && day.exercises?.length) ? (
        <Section
          action={<a className="text-primary" href="#/coach">Coach</a>}
          footer={`What this rotation gives each muscle in a 7-day week from your target sets, counting half a set for assisted muscles. The green band is 10–20 hard sets, the range with the best evidence for growth.${under.length ? ` Under it: ${under.map((row) => row.muscle).join(", ")}.` : ""}`}
          title="Sets per muscle"
        >
          <MuscleBars rows={volumeRows} />
        </Section>
      ) : null}
      <Card className="divide-y divide-border">
        <Row icon={Plus} onClick={async () => go(`split/${(await addDay({ splitId: shown.id })).id}`)} title="Add training day" tone="action" />
        <Row icon={Moon} onClick={() => addDay({ rest: true, splitId: shown.id })} title="Add rest day" tone="action" />
        <Row icon={Pencil} onClick={() => setNaming("rename")} title="Rename split" tone="action" />
        {!shown.current ? <Row icon={Trash2} iconClass="text-destructive" onClick={del} title="Delete split" tone="danger" /> : null}
      </Card>

      <NameSheet initial={naming === "rename" ? shown.name : ""} onClose={() => setNaming(null)} onSave={saveName} open={naming !== null} title={naming === "new" ? "New split" : "Rename split"} />
      <Sheet onClose={() => setStarting(false)} open={starting} title="New split">
        <Card className="divide-y divide-border">
          {TEMPLATES.map((template: any) => (
            <Row chevron key={template.id} onClick={() => startFrom(template)} subtitle={template.blurb} title={template.name} />
          ))}
          <Row
            chevron
            onClick={() => {
              setStarting(false);
              setNaming("new");
            }}
            subtitle="Name it and add your own days"
            title="Blank split"
          />
        </Card>
        <p className="px-1 text-[13px] text-muted-foreground">It gets its own days. Today keeps following {current.name} until you make the new one current.</p>
      </Sheet>
    </Page>
  );
}

function NameSheet({ open, initial, title, onClose, onSave }: { open: boolean; initial: string; title: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  const submit = () => {
    if (name.trim()) onSave(name.trim().slice(0, 60));
  };
  return (
    <Sheet left={<SheetAction onClick={onClose}>Cancel</SheetAction>} onClose={onClose} open={open} right={<SheetAction bold onClick={submit}>Save</SheetAction>} title={title}>
      <Card>
        <Row title="Name">
          <input
            aria-label="Split name"
            className="w-44 bg-transparent text-right text-[15px] text-muted-foreground outline-none"
            maxLength={60}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ski season prep"
            value={name}
          />
        </Row>
      </Card>
    </Sheet>
  );
}

export function DayEditor({ id }: { id: string }) {
  const all = useValue(records) as Map<string, any>;
  const s = useValue(settings) as any;
  const day = all.get(id);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(day?.name || "");
  const [target, setTarget] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const items = day?.exercises || [];
  const [order, setOrder] = useState<any[]>(items.map((item: any, i: number) => ({ ...item, key: `${item.exerciseId}-${i}` })));
  useEffect(() => setName(day?.name || ""), [id]);
  useEffect(() => setOrder(items.map((item: any, i: number) => ({ ...item, key: `${item.exerciseId}-${i}` }))), [day?.updatedAt]);

  if (!day || day.deleted) {
    return (
      <Page>
        <TopBar backLabel="Split" backTo="split" large={false} title="Day" />
        <Empty icon={ListOrdered} title="Day not found" />
      </Page>
    );
  }

  const change = (fn: (d: any) => void) => update(id, fn);
  const labels = supersetLabels(order);
  const persistOrder = () => change((d) => (d.exercises = order.map(({ key, ...item }) => item)));

  const del = async () => {
    if (!(await ask({ title: `Delete ${day.name}?`, message: "Past workouts stay in History.", confirm: "Delete", danger: true }))) return;
    await remove(id);
    const siblings = (splits.value as any[]).find((split) => split.id === splitIdOf(day))?.days || [];
    await saveMany(siblings.filter((d: any) => d.id !== id).map((d: any, position: number) => ({ ...d, position })));
    go("split", { replace: true });
  };

  return (
    <Page>
      <TopBar backLabel="Split" backTo="split" subtitle={day.rest ? "Rest day" : format.plural(items.length, "exercise")} title={day.name || "Untitled"} />
      <Card className="divide-y divide-border">
        <Row title="Name">
          <input
            aria-label="Day name"
            className="w-44 bg-transparent text-right text-[15px] text-muted-foreground outline-none"
            onBlur={() => name.trim() && name.trim() !== day.name && change((d) => (d.name = name.trim()))}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Push, Pull, Legs…"
            value={name}
          />
        </Row>
        <Row title="Rest day">
          <Toggle checked={Boolean(day.rest)} label="Rest day" onChange={(value) => change((d) => (d.rest = value))} />
        </Row>
      </Card>

      {day.rest ? (
        <p className="px-1 text-[14px] text-muted-foreground">Rest days keep their place in the rotation. Tap “Done resting” on Today to move on.</p>
      ) : (
        <Section footer="Tap an exercise for sets, rep range, rest and supersets. Drag the grip to reorder." title="Exercises">
          {order.length ? (
            <Reorder.Group as="div" axis="y" className="surface divide-y divide-border overflow-hidden rounded-2xl" onReorder={setOrder} values={order}>
              {order.map((item, index) => (
                <DragRow key={item.key} onDragEnd={persistOrder} value={item}>
                  <Row
                    onClick={() => setTarget(index)}
                    subtitle={`${item.targetSets || 3} × ${trackOf(exerciseIndex.value.get(item.exerciseId)) !== "strength" ? (trackOf(exerciseIndex.value.get(item.exerciseId)) === "cardio" ? "cardio" : "timed") : item.repMin && item.repMax ? (item.repMin === item.repMax ? item.repMin : `${item.repMin}–${item.repMax}`) : "?"} · rest ${format.rest(item.restSec ?? s.defaultRest)}`}
                    title={
                      <span className="flex items-center gap-2">
                        {labels[index] ? (
                          <span className="sets rounded-[4px] bg-muted px-1 text-[12px] text-muted-foreground">
                            {labels[index].group}
                            {labels[index].position}
                          </span>
                        ) : null}
                        <span className="truncate">{exerciseName(item.exerciseId)}</span>
                      </span>
                    }
                  />
                </DragRow>
              ))}
            </Reorder.Group>
          ) : null}
          <Button onClick={() => setAdding(true)} variant="tinted">
            <Plus className="size-4" strokeWidth={1.75} /> Add exercise
          </Button>
        </Section>
      )}

      <Button onClick={del} variant="destructive">
        <Trash2 className="size-4" /> Delete day
      </Button>

      <ExercisePicker
        exclude={items.map((item: any) => item.exerciseId)}
        onClose={() => setAdding(false)}
        onPick={(exercise) =>
          change((d) => {
            d.exercises = [...(d.exercises || []), { exerciseId: exercise.id, targetSets: trackOf(exercise) === "cardio" ? 1 : 3, repMin: 8, repMax: 12, restSec: s.defaultRest }];
          })
        }
        open={adding}
      />
      <TargetSheet
        index={target}
        items={items}
        onClose={() => setTarget(null)}
        onEdit={(exerciseId) => {
          setTarget(null);
          setEditing(exerciseId);
        }}
        onSave={(next) => change((d) => (d.exercises = next))}
        open={target !== null}
      />
      {editing ? <EditExerciseSheet id={editing} onClose={() => setEditing(null)} open /> : null}
    </Page>
  );
}

const RESTS = [30, 45, 60, 90, 120, 150, 180, 240, 300];
// "Chest · also triceps, shoulders"
const musclesText = (exercise: any) => {
  const also = indirectMuscles(exercise);
  return `${format.capitalize(exercise?.muscle || "other")}${also.length ? ` · also ${also.join(", ")}` : ""}`;
};
const REPS = Array.from({ length: 30 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

function TargetSheet({ open, index, items, onClose, onSave, onEdit }: { open: boolean; index: number | null; items: any[]; onClose: () => void; onSave: (items: any[]) => void; onEdit: (exerciseId: string) => void }) {
  const s = useValue(settings) as any;
  const [draft, setDraft] = useState<any>(null);
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    if (!open || index === null || !items[index]) return;
    setDraft({ targetSets: 3, repMin: 8, repMax: 12, restSec: s.defaultRest, ...items[index] });
    setLinked(Boolean(items[index].supersetId && items[index + 1]?.supersetId === items[index].supersetId));
  }, [open, index]);
  if (!draft || index === null) return null;
  const hasNext = index < items.length - 1;
  const track = trackOf(exerciseIndex.value.get(draft.exerciseId));

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

  return (
    <Sheet left={<SheetAction onClick={onClose}>Cancel</SheetAction>} onClose={onClose} open={open} right={<SheetAction bold onClick={saveIt}>Save</SheetAction>} title={exerciseName(draft.exerciseId)}>
      <Card className="divide-y divide-border">
        <Row title="Sets">
          <Stepper label="sets" max={12} min={1} onChange={(v) => setDraft({ ...draft, targetSets: v })} value={draft.targetSets || 3} />
        </Row>
        <Row chevron icon={Pencil} onClick={() => onEdit(draft.exerciseId)} subtitle={musclesText(exerciseIndex.value.get(draft.exerciseId))} title="Edit exercise" tone="action" />
      </Card>
      {track === "strength" ? (
      <Section footer={`When every set reaches the top of the range, Lift suggests adding ${format.weight(s.step)} ${s.unit}.`} title="Rep range">
        <Card className="flex justify-center py-2">
          <WheelPicker
            columns={[
              { id: "min", label: "Fewest reps", className: "w-20", options: REPS },
              { id: "max", label: "Most reps", className: "w-20", options: REPS }
            ]}
            label="Rep range"
            onValueChange={(v) => setDraft({ ...draft, repMin: Number(v.min), repMax: Math.max(Number(v.min), Number(v.max)) })}
            value={{ min: String(draft.repMin || 8), max: String(draft.repMax || 12) }}
          />
        </Card>
      </Section>
      ) : (
        <p className="px-1 text-[13px] text-muted-foreground">{track === "cardio" ? "Cardio sets log incline, speed and time." : "Timed sets log a time, with optional reps."} Each set can use the built-in timer.</p>
      )}
      <Section title="Rest between sets">
        <div className="flex flex-wrap gap-2">
          {RESTS.map((sec) => (
            <Chip key={sec} on={draft.restSec === sec} onClick={() => setDraft({ ...draft, restSec: sec })}>
              {format.rest(sec)}
            </Chip>
          ))}
        </div>
      </Section>
      {hasNext ? (
        <Section footer={`Do ${exerciseName(draft.exerciseId)} and ${exerciseName(items[index + 1].exerciseId)} back to back. The rest timer starts after the second.`}>
          <Card>
            <Row title="Superset with next">
              <Toggle checked={linked} label="Superset with next" onChange={setLinked} />
            </Row>
          </Card>
        </Section>
      ) : null}
      <Button
        onClick={() => {
          onSave(items.filter((_, i) => i !== index));
          onClose();
        }}
        variant="destructive"
      >
        <Trash2 className="size-4" /> Remove from day
      </Button>
    </Sheet>
  );
}
