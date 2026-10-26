// Split: the days in your rotation (drag to reorder) with the weekly sets it
// gives each muscle, and the editor for one day's exercises with sets, rep
// range, rest and supersets.
import { GripVertical, ListOrdered, Moon, Plus, Trash2 } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import WheelPicker from "@/components/kokonutui/wheel-picker";
import { ExercisePicker } from "@/components/exercise-picker";
import { MuscleBars } from "@/components/insights";
import { Card, Chip, Empty, Page, Row, Section, Sheet, SheetAction, Stepper, Toggle, TopBar } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { addDay, applyTemplate } from "@/lib/actions.js";
import { ask } from "@/lib/dialogs";
import { TEMPLATES } from "@/lib/exercises.js";
import { lastDoneAt, MAIN_MUSCLES, nextSplitDay, splitWeeklySets, supersetLabels, trackOf, uid, VOLUME_RANGE } from "@/lib/model.js";
import { go } from "@/lib/router.js";
import { exerciseIndex, exerciseName, finishedWorkouts, records, remove, saveMany, settings, splitDays, update } from "@/lib/store.js";
import * as format from "@/lib/format.js";
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

export function Split() {
  const days = useValue(splitDays) as any[];
  const done = useValue(finishedWorkouts) as any[];
  const [order, setOrder] = useState(days);
  const [templates, setTemplates] = useState(false);
  useEffect(() => setOrder(days), [days]);
  const next = nextSplitDay(days, done);

  const persist = () => saveMany(order.map((day: any, position: number) => ({ ...day, position })));
  const index = useValue(exerciseIndex) as Map<string, any>;
  const weekly = splitWeeklySets(days, index);
  const volumeRows = [...MAIN_MUSCLES, ...[...weekly.keys()].filter((m) => !MAIN_MUSCLES.includes(m) && !["cardio", "full body", "other"].includes(m))].map((muscle) => ({ muscle, sets: weekly.get(muscle) || 0 }));
  const under = volumeRows.filter((row) => row.sets < VOLUME_RANGE[0]);

  return (
    <Page>
      <TopBar subtitle="Your rotation, in order. Drag to reorder." title="Split" />
      {!days.length ? (
        <Empty icon={ListOrdered} title="No days yet">
          Add your training days in the order you rotate through them, rest days included.
        </Empty>
      ) : (
        <Section footer="After the last day it starts over. Doing a different day than suggested moves the rotation along." title="Rotation">
          <Reorder.Group as="div" axis="y" className="surface divide-y divide-border overflow-hidden rounded-3xl" onReorder={setOrder} values={order}>
            {order.map((day: any) => {
              const last = lastDoneAt(day.id, done);
              const isNext = next?.day.id === day.id;
              return (
                <DragRow key={day.id} onDragEnd={persist} value={day}>
                  <Row onClick={() => go(`split/${day.id}`)} subtitle={`${day.rest ? "Rest day" : format.plural(day.exercises?.length || 0, "exercise")}${last ? ` · ${format.relativeDay(last)}` : ""}`} title={day.name}>
                    {isNext ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[12px] font-semibold text-primary">Next</span> : null}
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
        <Row icon={Plus} onClick={async () => go(`split/${(await addDay()).id}`)} title="Add training day" tone="action" />
        <Row icon={Moon} iconClass="bg-violet-500/15 text-violet-400" onClick={() => addDay({ rest: true })} title="Add rest day" tone="action" />
        <Row icon={ListOrdered} onClick={() => setTemplates(true)} title="Add days from a template" tone="action" />
      </Card>

      <Sheet onClose={() => setTemplates(false)} open={templates} title="Templates">
        <Card className="divide-y divide-border">
          {TEMPLATES.map((template: any) => (
            <Row
              chevron
              key={template.id}
              onClick={async () => {
                await applyTemplate(template);
                setTemplates(false);
              }}
              subtitle={template.blurb}
              title={template.name}
            />
          ))}
        </Card>
        <p className="px-1 text-[13px] text-muted-foreground">Adds the template's days to the end of your rotation.</p>
      </Sheet>
    </Page>
  );
}

export function DayEditor({ id }: { id: string }) {
  const all = useValue(records) as Map<string, any>;
  const s = useValue(settings) as any;
  const day = all.get(id);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(day?.name || "");
  const [target, setTarget] = useState<number | null>(null);
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
    await saveMany((splitDays.value as any[]).filter((d) => d.id !== id).map((d, position) => ({ ...d, position })));
    go("split", { replace: true });
  };

  return (
    <Page>
      <TopBar backLabel="Split" backTo="split" subtitle={day.rest ? "Rest day" : format.plural(items.length, "exercise")} title={day.name || "Untitled"} />
      <Card className="divide-y divide-border">
        <Row title="Name">
          <input
            aria-label="Day name"
            className="w-44 bg-transparent text-right text-[15.5px] text-muted-foreground outline-none"
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
            <Reorder.Group as="div" axis="y" className="surface divide-y divide-border overflow-hidden rounded-3xl" onReorder={setOrder} values={order}>
              {order.map((item, index) => (
                <DragRow key={item.key} onDragEnd={persistOrder} value={item}>
                  <Row
                    onClick={() => setTarget(index)}
                    subtitle={`${item.targetSets || 3} × ${trackOf(exerciseIndex.value.get(item.exerciseId)) !== "strength" ? (trackOf(exerciseIndex.value.get(item.exerciseId)) === "cardio" ? "cardio" : "timed") : item.repMin && item.repMax ? (item.repMin === item.repMax ? item.repMin : `${item.repMin}–${item.repMax}`) : "?"} · rest ${format.rest(item.restSec ?? s.defaultRest)}`}
                    title={
                      <span className="flex items-center gap-2">
                        {labels[index] ? (
                          <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-bold text-primary">
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
            <Plus className="size-4" strokeWidth={2.6} /> Add exercise
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
      <TargetSheet index={target} items={items} onClose={() => setTarget(null)} onSave={(next) => change((d) => (d.exercises = next))} open={target !== null} />
    </Page>
  );
}

const RESTS = [30, 45, 60, 90, 120, 150, 180, 240, 300];
const REPS = Array.from({ length: 30 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

function TargetSheet({ open, index, items, onClose, onSave }: { open: boolean; index: number | null; items: any[]; onClose: () => void; onSave: (items: any[]) => void }) {
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
      <Card>
        <Row title="Sets">
          <Stepper label="sets" max={12} min={1} onChange={(v) => setDraft({ ...draft, targetSets: v })} value={draft.targetSets || 3} />
        </Row>
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
