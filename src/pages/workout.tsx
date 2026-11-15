// The workout logger: one card per exercise with set rows that show last
// time's numbers, a progression hint, PR marks and the rest timer. Weight
// and reps go through the docked number pad. Also edits finished workouts.
import NumberFlow from "@number-flow/react";
import {
  ArrowRight, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronUp, Eye, Flame, Flag, Link2, List, MoreHorizontal, NotebookPen, Pencil, Play, Plus,
  Repeat2, Square, Timer, Trash2, Trophy, Unlink, X
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import HoldButton from "@/components/kokonutui/hold-button";
import WheelPicker from "@/components/kokonutui/wheel-picker";
import { LineChart } from "@/components/chart";
import { EditExerciseSheet, ExercisePicker } from "@/components/exercise-picker";
import { Card, Empty, Page, Row, Section, Sheet, SheetAction, softSpring, spring, StatTiles, Stepper, TopBar } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { ask, choose } from "@/lib/dialogs";
import { haptic } from "@/lib/haptics.js";
import { closePad, openPad, pad } from "@/lib/keypad.js";
import {
  dateKey, exerciseHistory, fromDateKey, isPersonalRecord, newEntry, newSet, nextInSuperset, personalRecords, placeholderFor,
  previousEntry, splitDiff, stepProgress, suggestion, supersetLabels, uid, warmupSets, workoutSteps, workoutVolume, FIELDS, trackOf, cardioSeconds
} from "@/lib/model.js";
import { notify } from "@/lib/notify";
import { back, go } from "@/lib/router.js";
import { badgeList, exerciseIndex, exerciseName, records, remove, save, saveExerciseNote, sessions, settings, splitDays, update } from "@/lib/store.js";
import { keepAwake, now, startRest, stopRest, unlockAudio } from "@/lib/timer.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { completeSet, finishSetTimer } from "@/lib/logging.js";
import { setTimer, startSetTimer } from "@/lib/set-timer.js";
import { cn } from "@/lib/utils";

const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
const TYPE_LABEL: Record<string, string> = { warmup: "W", drop: "D", failure: "F" };
const TYPE_NAME: Record<string, string> = { working: "Working set", warmup: "Warm-up", drop: "Drop set", failure: "To failure" };
const TYPE_COLOR: Record<string, string> = { warmup: "text-pr", drop: "text-primary", failure: "text-destructive" };

// Which exercise the focus screen is on, per workout, so iOS reloading the
// home-screen app doesn't lose your place.
const focusKey = (workoutId: string) => `lift-focus-${workoutId}`;
function readFocus(workoutId: string): string | null {
  try {
    return localStorage.getItem(focusKey(workoutId));
  } catch {
    return null;
  }
}
function writeFocus(workoutId: string, entryId: string | null) {
  try {
    if (entryId) localStorage.setItem(focusKey(workoutId), entryId);
    else localStorage.removeItem(focusKey(workoutId));
  } catch {
    // Storage blocked (private mode): the screen still works, it just won't survive a reload.
  }
}

const SLIDE = {
  enter: (direction: number) => ({ x: 24 * direction, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: -24 * direction, opacity: 0 })
};

// A live workout opens on one exercise at a time (a superset's exercises
// share a screen), with Next exercise to move on. "All exercises" switches to
// the full list, which is also how a finished workout is edited.
export function WorkoutPage({ id }: { id: string }) {
  const all = useValue(records) as Map<string, any>;
  const tick = useValue(now);
  const s = useValue(settings) as any;
  const workout = all.get(id);
  const [adding, setAdding] = useState(false);
  const [details, setDetails] = useState(false);
  const target = useValue(pad) as any;
  const history = useValue(sessions) as any[];
  const live = Boolean(workout && !workout.deleted && !workout.finishedAt);
  const [view, setView] = useState<"focus" | "all">("focus");
  const [focusId, setFocusId] = useState<string | null>(() => readFocus(id));
  const [direction, setDirection] = useState(1);
  const lastStep = useRef(0);
  const currentIds = useRef<string[]>([]);

  const steps = workoutSteps(workout?.entries || []);
  let stepIndex = steps.findIndex((step) => focusId !== null && step.entryIds.includes(focusId));
  if (stepIndex < 0) {
    // Nothing chosen yet: the first step with sets left. An exercise that was
    // removed: whatever took its place.
    const open = steps.findIndex((step) => !stepProgress(step, workout?.entries || []).complete);
    stepIndex = focusId !== null ? Math.min(lastStep.current, steps.length - 1) : open >= 0 ? open : steps.length - 1;
  }
  lastStep.current = Math.max(0, stepIndex);
  currentIds.current = steps[stepIndex]?.entryIds || [];

  const focusOn = (entryId: string, dir = 1) => {
    setDirection(dir);
    setFocusId(entryId);
    writeFocus(id, entryId);
  };
  const goStep = (index: number) => {
    const step = steps[index];
    if (!step) return;
    closePad();
    focusOn(step.entryIds[0], index >= stepIndex ? 1 : -1);
    window.scrollTo(0, 0);
  };

  // Remember the starting step right away, so finishing its sets doesn't
  // jump ahead on its own; moving on is up to Next exercise.
  useEffect(() => {
    if (focusId === null && live && currentIds.current[0]) focusOn(currentIds.current[0]);
  }, [focusId, live, steps.length]);

  // The pad's Next can run on into the next exercise: follow it there.
  useEffect(() => {
    if (!target || !live || view !== "focus" || currentIds.current.includes(target.entryId)) return;
    const step = workoutSteps(workout?.entries || []).find((s) => s.entryIds.includes(target.entryId));
    if (step) focusOn(step.entryIds[0]);
  }, [target?.entryId]);

  useEffect(() => {
    keepAwake(live);
    return () => {
      keepAwake(false);
      closePad();
    };
  }, [live]);

  // Keep the field being typed into above the number pad.
  useEffect(() => {
    if (!target) return;
    const el = document.querySelector(`[data-cell="${target.setId}-${target.field}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 350 || rect.top < 110) window.scrollBy({ top: rect.top - window.innerHeight * 0.28, behavior: "smooth" });
  }, [target?.setId, target?.field]);

  if (!workout || workout.deleted) {
    return (
      <Page>
        <TopBar backLabel="Today" backTo="today" large={false} title="Workout" />
        <Empty action={<Button onClick={() => go("today")} variant="tinted">Go to Today</Button>} icon={Flag} title="Workout not found" />
      </Page>
    );
  }

  const change = (fn: (draft: any) => void) => update(id, fn);
  const entries = workout.entries as any[];
  const labels = supersetLabels(entries);
  const doneSets = entries.reduce((sum, entry) => sum + entry.sets.filter((set: any) => set.done).length, 0);
  const totalSets = entries.reduce((sum, entry) => sum + entry.sets.length, 0);
  const volume = workoutVolume({ entries: entries.map((e) => ({ ...e, sets: e.sets.filter((x: any) => x.done) })) });
  const cardioMinutes = Math.round(cardioSeconds(workout, exerciseIndex.value) / 60);

  const finishNow = async () => {
    closePad();
    stopRest();
    // Compare the plan with the workout before unchecked sets are dropped, so
    // skipping an exercise today doesn't read as removing it from the plan.
    const asPlanned = structuredClone(workout);
    const had = new Set(badgeList.value.filter((badge: any) => badge.earnedAt).map((badge: any) => badge.id));
    await change((draft) => {
      draft.entries = draft.entries.map((entry: any) => ({ ...entry, sets: entry.sets.filter((set: any) => set.done) })).filter((entry: any) => entry.sets.length);
      draft.finishedAt = Date.now();
    });
    const earned = badgeList.value.filter((badge: any) => badge.earnedAt && !had.has(badge.id));
    if (earned.length === 1) notify(`Badge earned: ${earned[0].title}`, { detail: earned[0].detail });
    else if (earned.length) notify(`${earned.length} badges earned`, { detail: earned.map((badge: any) => badge.title).join(", ") });
    writeFocus(id, null);
    await offerSplitUpdate(asPlanned);
    go(`history/${id}?done=1`, { replace: true });
  };

  const finish = async () => {
    closePad();
    if (!doneSets) {
      if (await ask({ title: "No sets logged", message: "Nothing is checked off yet. Discard this workout?", confirm: "Discard", danger: true })) discardNow();
      return;
    }
    const unchecked = totalSets - doneSets;
    const ok = await ask({
      title: "Finish workout?",
      message: unchecked ? `${format.plural(unchecked, "unchecked set")} will be left out.` : `${format.plural(doneSets, "set")} in ${format.duration(Date.now() - workout.startedAt)}.`,
      confirm: "Finish"
    });
    if (ok) finishNow();
  };

  const discardNow = async () => {
    closePad();
    stopRest();
    writeFocus(id, null);
    await remove(id);
    go(live ? "today" : "history", { replace: true });
  };

  // Editing a past workout: filled-in rows count, empty ones are dropped.
  const doneEditing = async () => {
    closePad();
    await change((draft) => {
      for (const entry of draft.entries) {
        entry.sets = entry.sets.filter((set: any) => set.done || set.reps != null).map((set: any) => ({ ...set, weight: set.weight ?? 0, done: true }));
      }
      draft.entries = draft.entries.filter((entry: any) => entry.sets.length);
    });
    back(`history/${id}`);
  };

  const addExercise = (exercise: any) => {
    const entry = newEntry(exercise.id, { targetSets: trackOf(exercise) === "cardio" ? 1 : 3 }, s.defaultRest);
    change((draft) => draft.entries.push(entry));
    if (live && view === "focus") focusOn(entry.id);
  };
  const picker = <ExercisePicker onClose={() => setAdding(false)} onPick={addExercise} open={adding} />;
  const openPicker = () => {
    closePad();
    setAdding(true);
  };

  if (live && view === "focus") {
    const step = steps[stepIndex];
    const nextStep = steps[stepIndex + 1];
    const progress = step ? stepProgress(step, entries) : null;
    const names = (ids: string[]) => ids.map((entryId) => exerciseName(entries.find((e) => e.id === entryId)?.exerciseId)).join(" + ");
    // Last time's top set for the next exercise, like the chips on Today.
    const nextEntry = nextStep ? entries.find((e) => e.id === nextStep.entryIds[0]) : null;
    const nextTrack = nextEntry ? trackOf(exerciseIndex.value.get(nextEntry.exerciseId)) : "strength";
    const lastSets = nextEntry ? (previousEntry(history, nextEntry.exerciseId, { before: workout.startedAt })?.entry.sets || []).filter((x: any) => x.done && x.type !== "warmup") : [];
    const lastTop = nextTrack === "strength" ? [...lastSets].sort((a: any, b: any) => b.weight - a.weight || b.reps - a.reps)[0] : [...lastSets].sort((a: any, b: any) => (b.seconds || 0) - (a.seconds || 0))[0];

    return (
      <Page className="gap-4">
        <TopBar
          backLabel="Today"
          backTo="today"
          large={false}
          title={workout.name}
          trailing={
            <>
              <button
                aria-label="All exercises"
                className="grid size-9 place-items-center rounded-full bg-muted text-foreground active:bg-accent"
                onClick={() => {
                  closePad();
                  setView("all");
                }}
                type="button"
              >
                <List className="size-[18px]" strokeWidth={1.75} />
              </button>
              <Button onClick={finish} size="sm">
                Finish
              </Button>
            </>
          }
        />

        {step ? (
          <>
            <div className="flex flex-col gap-1.5 px-1">
              <div className="flex items-baseline justify-between gap-3 text-[13px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  Exercise {stepIndex + 1} of {steps.length}
                </span>
                <span className="tabular">
                  {format.clock((tick - workout.startedAt) / 1000)} · {doneSets}/{totalSets} sets
                </span>
              </div>
              <div className="flex items-center gap-1">
                {steps.map((item, i) => {
                  const p = stepProgress(item, entries);
                  return (
                    <button
                      aria-current={i === stepIndex ? "step" : undefined}
                      aria-label={`Exercise ${i + 1}: ${names(item.entryIds)}${p.complete ? ", done" : ""}`}
                      className="flex h-7 min-w-0 flex-1 items-center"
                      key={item.entryIds[0]}
                      onClick={() => goStep(i)}
                      type="button"
                    >
                      <span className={cn("relative w-full overflow-hidden rounded-full bg-muted transition-[height]", i === stepIndex ? "h-2.5 ring-2 ring-primary/35" : "h-1.5")}>
                        <motion.span
                          animate={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }}
                          className={cn("absolute inset-y-0 left-0 rounded-full", p.complete ? "bg-success" : "bg-primary")}
                          initial={false}
                          transition={spring}
                        />
                      </span>
                    </button>
                  );
                })}
                <button aria-label="Add exercise" className="ml-1 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground active:bg-accent" onClick={openPicker} type="button">
                  <Plus className="size-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <AnimatePresence custom={direction} initial={false} mode="popLayout">
              <motion.div animate="center" className="flex flex-col gap-4" custom={direction} exit="exit" initial="enter" key={step.entryIds[0]} transition={softSpring} variants={SLIDE}>
                {entries.slice(step.start, step.end + 1).map((entry, offset) => (
                  <ExerciseCard change={change} entry={entry} index={step.start + offset} key={entry.id} label={labels[step.start + offset]} live workout={workout} />
                ))}
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-col gap-3">
              {nextStep ? (
                <button className="surface flex items-center gap-3 rounded-2xl px-4 py-3 text-left" onClick={() => goStep(stepIndex + 1)} type="button">
                  <span className="text-[12px] font-medium text-muted-foreground">Up next</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{names(nextStep.entryIds)}</span>
                  {lastTop ? <span className="sets shrink-0 text-[13px] text-muted-foreground">{format.shortSet(lastTop, nextTrack)}</span> : null}
                </button>
              ) : null}
              <div className="flex gap-2">
                <Button aria-label="Previous exercise" className="w-[92px]" disabled={stepIndex === 0} onClick={() => goStep(stepIndex - 1)} size="lg" variant="secondary">
                  <ChevronLeft className="size-5" strokeWidth={1.75} /> Back
                </Button>
                {nextStep ? (
                  <Button className="flex-1" onClick={() => goStep(stepIndex + 1)} size="lg" variant={progress?.complete ? "default" : "tinted"}>
                    Next exercise <ArrowRight className="size-5" strokeWidth={1.75} />
                  </Button>
                ) : (
                  <Button className="flex-1" onClick={finish} size="lg" variant={progress?.complete ? "default" : "tinted"}>
                    <Check className="size-5" strokeWidth={1.75} /> Finish workout
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : (
          <Empty action={<Button onClick={openPicker} variant="tinted">Add exercise</Button>} icon={Plus} title="No exercises yet">
            Add the first exercise to start logging sets.
          </Empty>
        )}
        {picker}
      </Page>
    );
  }

  return (
    <Page className="gap-5">
      <TopBar
        backLabel={live ? "Today" : "Summary"}
        backTo={live ? "today" : `history/${id}`}
        title={workout.name}
        trailing={
          <>
            {live ? (
              <Button
                onClick={() => {
                  closePad();
                  setView("focus");
                  window.scrollTo(0, 0);
                }}
                size="sm"
                variant="tinted"
              >
                Focus
              </Button>
            ) : null}
            <Button onClick={live ? finish : doneEditing} size="sm">
              {live ? "Finish" : "Done"}
            </Button>
          </>
        }
      >
        <button aria-label="Workout details" className="flex w-full flex-col items-start text-left" onClick={() => setDetails(true)} type="button">
          <h1 className="text-[34px] leading-[1.1] font-medium">{workout.name}</h1>
        </button>
      </TopBar>

      <StatTiles
        items={[
          { label: live ? "Elapsed" : "Date", value: live ? <span className="tabular">{format.clock((tick - workout.startedAt) / 1000)}</span> : format.shortDate(workout.startedAt) },
          { label: "Sets", value: <NumberFlow value={doneSets} />, unit: `/${totalSets}` },
          ...(volume > 0 || !cardioMinutes ? [{ label: "Volume", value: <NumberFlow format={{ notation: volume >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }} value={volume} />, unit: s.unit }] : []),
          ...(cardioMinutes ? [{ label: "Cardio", value: <NumberFlow value={cardioMinutes} />, unit: "min" }] : [])
        ]}
      />

      {entries.length ? (
        <div className="flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {entries.map((entry, index) => (
              <motion.div animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} initial={{ opacity: 0, height: 0 }} key={entry.id} layout transition={spring}>
                <ExerciseCard
                  change={change}
                  entry={entry}
                  index={index}
                  label={labels[index]}
                  live={live}
                  onTitle={
                    live
                      ? () => {
                          closePad();
                          focusOn(entry.id);
                          setView("focus");
                          window.scrollTo(0, 0);
                        }
                      : undefined
                  }
                  workout={workout}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <Empty icon={Plus} title="No exercises yet">
          Add the first exercise to start logging sets.
        </Empty>
      )}

      <Button onClick={openPicker} size="lg" variant="tinted">
        <Plus className="size-5" strokeWidth={1.75} /> Add exercise
      </Button>

      <Section title="Notes">
        <Card className="p-4">
          <textarea
            className="min-h-16 w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            defaultValue={workout.notes || ""}
            onBlur={(e) => {
              const value = e.currentTarget.value;
              if (value !== (workout.notes || "")) change((draft) => (draft.notes = value));
            }}
            placeholder="How did it feel? Sleep, energy, anything to remember"
          />
        </Card>
      </Section>

      <div className="flex flex-col gap-2 pt-1">
        {live ? (
          <HoldButton className="h-14 w-full rounded-2xl text-[15px]" completeLabel="Finished" holdDuration={900} holdingLabel="Keep holding…" icon={Check} onHoldComplete={() => (doneSets ? setTimeout(finishNow, 450) : finish())} resetAfter={0} variant="green">
            Hold to finish
          </HoldButton>
        ) : null}
        <HoldButton className="h-12 w-full rounded-2xl" completeLabel={live ? "Discarded" : "Deleted"} holdDuration={1100} holdingLabel="Keep holding…" icon={Trash2} onHoldComplete={() => setTimeout(discardNow, 400)} variant="red">
          {live ? "Hold to discard" : "Hold to delete"}
        </HoldButton>
      </div>

      {picker}
      <DetailsSheet change={change} onClose={() => setDetails(false)} open={details} workout={workout} />
    </Page>
  );
}

// If the workout strayed from its split day, offer to make that the plan.
async function offerSplitUpdate(workout: any) {
  const day = (splitDays.value as any[]).find((d) => d.id === workout?.splitDayId);
  if (!day || day.rest) return;
  const diff = splitDiff(day, workout, exerciseName);
  if (!diff.changes.length) return;
  const shown = diff.changes.slice(0, 4).join("\n") + (diff.changes.length > 4 ? `\nand ${diff.changes.length - 4} more` : "");
  const yes = await choose({
    title: `Update ${day.name}?`,
    message: `Make today's workout the plan for ${day.name}:\n${shown}`,
    actions: [
      { label: `Update ${day.name}`, value: true, style: "primary" },
      { label: "Keep as is", value: false, style: "cancel" }
    ]
  });
  if (yes) {
    await save({ ...day, exercises: diff.exercises });
    notify(`${day.name} updated`);
  }
}

function DetailsSheet({ open, onClose, workout, change }: { open: boolean; onClose: () => void; workout: any; change: (fn: (d: any) => void) => void }) {
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
  const field = "bg-transparent text-right text-[15px] text-primary outline-none";
  return (
    <Sheet left={<SheetAction onClick={onClose}>Cancel</SheetAction>} onClose={onClose} open={open} right={<SheetAction bold onClick={saveDetails}>Done</SheetAction>} title="Workout details">
      <Card className="divide-y divide-border">
        <Row title="Name">
          <input aria-label="Workout name" className="w-40 bg-transparent text-right text-[15px] text-muted-foreground outline-none" onChange={(e) => setName(e.currentTarget.value)} value={name} />
        </Row>
        <Row title="Date">
          <input aria-label="Date" className={field} max={dateKey()} onChange={(e) => setDate(e.currentTarget.value)} type="date" value={date} />
        </Row>
        <Row title="Start">
          <input aria-label="Start time" className={field} onChange={(e) => setTime(e.currentTarget.value)} type="time" value={time} />
        </Row>
        {workout.finishedAt ? (
          <Row title="Duration">
            <Stepper format={(v) => `${v}m`} label="minutes" max={300} min={5} onChange={setMinutes} step={5} value={minutes} />
          </Row>
        ) : null}
      </Card>
      <p className="px-1 text-[13px] text-muted-foreground">{workout.finishedAt ? "Use this to log a workout you forgot, or fix the time." : "Changing the start time also changes the timer."}</p>
    </Sheet>
  );
}

type SheetKind = null | "menu" | "rest" | "note" | "swap" | "peek" | "edit" | { type: number };

// `onTitle` replaces the history peek on the title (the list uses it to jump
// back into focus on this exercise).
function ExerciseCard({ workout, entry, index, label, live, change, onTitle }: { workout: any; entry: any; index: number; label: any; live: boolean; change: (fn: (d: any) => void) => void; onTitle?: () => void }) {
  const [sheet, setSheet] = useState<SheetKind>(null);
  const index_ = useValue(exerciseIndex) as Map<string, any>;
  const history = useValue(sessions) as any[];
  const s = useValue(settings) as any;
  const target = useValue(pad) as any;
  const running = useValue(setTimer) as any;
  const exercise = index_.get(entry.exerciseId) || { name: "Unknown exercise" };
  const entries = workout.entries as any[];
  const track = trackOf(exercise);
  const fields = FIELDS[track] as string[];

  const previous = useMemo(() => previousEntry(history, entry.exerciseId, { before: workout.startedAt, excludeId: workout.id }), [history, entry.exerciseId, workout.startedAt]);
  const prior = useMemo(() => personalRecords(exerciseHistory(history, entry.exerciseId, { before: workout.startedAt, excludeId: workout.id })), [history, entry.exerciseId, workout.startedAt]);
  const hint = suggestion(previous?.entry, { repMin: entry.repMin, repMax: entry.repMax }, s.step, track, format.speedUnit(s.unit));

  const changeEntry = (fn: (t: any, d: any) => void) =>
    change((draft) => {
      const t = draft.entries.find((item: any) => item.id === entry.id);
      if (t) fn(t, draft);
    });

  const toggle = (setIndex: number) => {
    const set = entry.sets[setIndex];
    if (set.done) return changeEntry((t) => (t.sets[setIndex].done = false));
    completeSet(workout.id, entry.id, set.id);
  };

  // Cardio and timed sets: count down from the time you typed (or last
  // time's), or run as a stopwatch when there's no target.
  const startTimer = (setIndex: number) => {
    const set = entry.sets[setIndex];
    const ph = placeholderFor(entry, setIndex, previous?.entry, hint);
    closePad();
    unlockAudio();
    haptic(8);
    startSetTimer({ workoutId: workout.id, entryId: entry.id, setId: set.id, name: exercise.name, target: set.seconds ?? ph.seconds, sound: s.sound });
  };

  const addSet = () =>
    changeEntry((t) => {
      const above = t.sets[t.sets.length - 1];
      const warm = above?.type === "warmup";
      const copied = Object.fromEntries(fields.map((f) => [f, warm ? null : (above?.[f] ?? null)]));
      t.sets.push({ ...newSet(warm ? "working" : above?.type || "working"), ...copied });
    });

  const move = (delta: number) =>
    change((draft) => {
      const i = draft.entries.findIndex((item: any) => item.id === entry.id);
      const j = i + delta;
      if (j < 0 || j >= draft.entries.length) return;
      [draft.entries[i], draft.entries[j]] = [draft.entries[j], draft.entries[i]];
    });

  const linkNext = () =>
    change((draft) => {
      const i = draft.entries.findIndex((item: any) => item.id === entry.id);
      const next = draft.entries[i + 1];
      if (!next) return;
      const sid = draft.entries[i].supersetId || next.supersetId || uid("ss");
      const old = next.supersetId;
      draft.entries[i].supersetId = sid;
      for (const item of draft.entries) if (old && item.supersetId === old) item.supersetId = sid;
      next.supersetId = sid;
    });

  const addWarmups = () => {
    const firstWorking = entry.sets.findIndex((set: any) => set.type !== "warmup");
    const ph = firstWorking >= 0 ? placeholderFor(entry, firstWorking, previous?.entry, hint) : ({} as any);
    const working = (firstWorking >= 0 ? entry.sets[firstWorking].weight : null) ?? ph.weight ?? hint?.weight;
    const sets = warmupSets(working, { equipment: exercise.equipment, bar: s.barWeight, plates: s.plates, step: s.step });
    if (!sets.length) return notify(working ? "Too light for warm-ups" : "Enter a working weight first", { status: "error" });
    changeEntry((t) => {
      t.sets = [...sets.map((w: any) => ({ ...newSet("warmup"), weight: w.weight, reps: w.reps })), ...t.sets.filter((set: any) => set.type !== "warmup" || set.done)];
    });
    notify(`Added ${format.plural(sets.length, "warm-up set")}`);
  };

  const removeEntry = async () => {
    setSheet(null);
    if (entry.sets.some((set: any) => set.done) && !(await ask({ title: `Remove ${exercise.name}?`, message: "Its logged sets will be removed from this workout.", confirm: "Remove", danger: true }))) return;
    closePad();
    change((draft) => (draft.entries = draft.entries.filter((item: any) => item.id !== entry.id)));
  };

  const range =
    track === "strength" && entry.repMin && entry.repMax ? `${entry.repMin === entry.repMax ? entry.repMin : `${entry.repMin}–${entry.repMax}`} reps` : track === "cardio" ? "Cardio" : track === "timed" ? "Timed" : "";
  // Cardio has three inputs, so its "previous" numbers live in the ghosts instead of a column.
  const grid = track === "cardio" ? "grid-cols-[30px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_44px]" : "grid-cols-[34px_minmax(0,1fr)_76px_60px_44px]";
  const headers =
    track === "cardio"
      ? ["Set", "Incl %", format.speedUnit(s.unit), "Time"]
      : track === "timed"
        ? ["Set", "Previous", "Time", "Reps"]
        : ["Set", "Previous", s.unit, "Reps"];
  const show = (name: string, value: number) => (name === "seconds" ? format.clock(value) : format.weight(value));
  let number = 0;

  return (
    <div className={cn("relative", label && "pl-4")}>
      {label ? <span className={cn("absolute top-5 bottom-5 left-0 w-0.5 rounded-full bg-primary", !label.first && "-top-5", !label.last && "-bottom-5")} /> : null}
      <Card className="p-3 pt-4">
        <div className="flex items-start gap-2 px-1.5">
          <button
            className="flex min-w-0 flex-1 flex-col text-left"
            onClick={() => {
              closePad();
              if (onTitle) onTitle();
              else setSheet("peek");
            }}
            type="button"
          >
            <span className="flex items-center gap-2">
              {label ? (
                <span className="sets rounded-[4px] bg-muted px-1 text-[12px] text-muted-foreground">
                  {label.group}
                  {label.position}
                </span>
              ) : null}
              <span className="truncate text-[17px] font-medium">{exercise.name}</span>
            </span>
            <span className="text-[13px] text-muted-foreground">{[range, entry.restSec ? `Rest ${format.rest(entry.restSec)}` : "No rest timer", label ? "Superset" : ""].filter(Boolean).join(" · ")}</span>
          </button>
          <button
            aria-label={`Options for ${exercise.name}`}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground active:bg-accent"
            onClick={() => {
              closePad();
              setSheet("menu");
            }}
            type="button"
          >
            <MoreHorizontal className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        {exercise.note ? (
          <button className="mx-1.5 mt-3 flex w-[calc(100%-12px)] items-start gap-2 rounded-[10px] bg-muted px-3 py-2 text-left text-[14px] leading-snug" onClick={() => setSheet("note")} type="button">
            <NotebookPen className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <span>{exercise.note}</span>
          </button>
        ) : null}
        {entry.notes ? <p className="mx-1.5 mt-2 rounded-[10px] bg-muted px-3 py-2 text-[14px]">{entry.notes}</p> : null}

        <p className={cn("mx-1.5 mt-3 flex items-center gap-1.5 text-[13px]", hint?.kind === "up" ? "font-medium text-success" : "text-muted-foreground")}>
          {hint ? (
            hint.kind === "up" ? <ArrowUp className="size-3.5" strokeWidth={2} /> : <ArrowRight className="size-3.5" strokeWidth={1.75} />
          ) : (
            <Flame className="size-3.5" strokeWidth={1.75} />
          )}
          {hint ? hint.text : "First time. This sets your baseline."}
        </p>

        <div aria-hidden="true" className={cn("mt-3 grid gap-1.5 px-1.5 text-[12px] text-muted-foreground", grid)}>
          {headers.map((h, i) => (
            <span className={i >= (track === "cardio" ? 1 : 2) ? "text-center" : undefined} key={h}>
              {h}
            </span>
          ))}
          <span />
        </div>

        <div className="mt-1 flex flex-col">
          <AnimatePresence initial={false}>
            {entry.sets.map((set: any, setIndex: number) => {
              if (set.type !== "warmup") number += 1;
              const ph = placeholderFor(entry, setIndex, previous?.entry, hint);
              const pr = set.done && isPersonalRecord(set, prior, track);
              const timing = running?.setId === set.id;
              const field = (name: string) => {
                const active = target?.setId === set.id && target.field === name;
                const typing = active && !target.fresh;
                const value = typing ? (name === "seconds" ? format.digitsAsClock(target.text) : target.text) : set[name] != null ? show(name, set[name]) : null;
                const LABELS: Record<string, string> = { weight: "Weight", reps: "Reps", incline: "Incline", speed: "Speed", seconds: "Time" };
                return (
                  <button
                    aria-label={`${LABELS[name]}, set ${setIndex + 1}`}
                    key={name}
                    className={cn(
                      "sets relative grid h-10 place-items-center rounded-lg text-[17px] transition-colors",
                      set.done ? "bg-transparent" : "bg-muted",
                      value == null && "text-muted-foreground/60"
                    )}
                    data-cell={`${set.id}-${name}`}
                    data-placeholder={ph[name] ?? ""}
                    onClick={() => openPad({ workoutId: workout.id, entryId: entry.id, setId: set.id, field: name, value: set[name], placeholder: ph[name] })}
                    type="button"
                  >
                    {active ? <motion.span className="absolute inset-0 rounded-lg bg-card ring-2 ring-primary" layoutId="pad-focus" transition={spring} /> : null}
                    <span className="relative">{value ?? (ph[name] != null ? show(name, ph[name]) : "")}</span>
                  </button>
                );
              };
              return (
                <motion.div
                  animate={{ opacity: 1, height: "auto" }}
                  className={cn("relative -mx-1.5 grid items-center gap-1.5 rounded-xl px-3 py-1 transition-colors duration-300", grid, set.done && "bg-success/10", timing && "bg-primary/10")}
                  exit={{ opacity: 0, height: 0 }}
                  initial={{ opacity: 0, height: 0 }}
                  key={set.id}
                  transition={spring}
                >
                  <button
                    aria-label={`Set ${setIndex + 1}, ${TYPE_NAME[set.type || "working"]}`}
                    className={cn("sets grid h-9 place-items-center rounded-lg text-[15px]", set.done ? "bg-transparent" : "bg-muted", TYPE_COLOR[set.type])}
                    onClick={() => {
                      closePad();
                      setSheet({ type: setIndex });
                    }}
                    type="button"
                  >
                    {TYPE_LABEL[set.type] || number}
                  </button>
                  {track !== "cardio" ? (
                    <button
                      aria-label={ph.prev ? `Copy last time, ${format.shortSet(ph.prev, track)}` : "No previous set"}
                      className="sets h-10 truncate pl-1 text-left text-[14px] text-muted-foreground disabled:text-muted-foreground/40"
                      disabled={!ph.prev}
                      onClick={() =>
                        ph.prev &&
                        changeEntry((t) => {
                          for (const f of fields) t.sets[setIndex][f] = ph.prev[f] != null ? Number(ph.prev[f]) : track === "strength" ? 0 : null;
                        })
                      }
                      type="button"
                    >
                      {ph.prev ? format.shortSet(ph.prev, track) : "—"}
                    </button>
                  ) : null}
                  {fields.map((name) => field(name))}
                  {timing ? (
                    <button
                      aria-label="Stop timer and log this set"
                      className="relative grid h-10 place-items-center rounded-lg bg-primary text-primary-foreground transition-transform active:scale-[0.97]"
                      onClick={() => finishSetTimer()}
                      type="button"
                    >
                      <Square className="size-4 fill-current" strokeWidth={1.75} />
                    </button>
                  ) : track !== "strength" && !set.done && set.seconds == null ? (
                    <motion.button
                      aria-label={ph.seconds ? `Start a ${format.clock(ph.seconds)} countdown` : "Start a stopwatch"}
                      className="relative grid h-10 place-items-center rounded-lg bg-muted text-primary"
                      onClick={() => startTimer(setIndex)}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                    >
                      <Play className="size-[18px] fill-current" strokeWidth={1.75} />
                    </motion.button>
                  ) : (
                    <motion.button
                      aria-label={set.done ? (pr ? "Personal record, mark set not done" : "Mark set not done") : "Complete set"}
                      aria-pressed={set.done}
                      className={cn(
                        "relative grid h-10 place-items-center rounded-lg transition-colors duration-150",
                        pr ? "bg-pr text-background" : set.done ? "bg-success text-background" : "bg-muted text-muted-foreground"
                      )}
                      onClick={() => toggle(setIndex)}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                    >
                      {pr ? <Trophy className="size-[18px]" strokeWidth={1.75} /> : <Check className="size-5" strokeWidth={2} />}
                    </motion.button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        <button className="mt-1 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl text-[14px] font-medium text-primary active:bg-accent" onClick={addSet} type="button">
          <Plus className="size-4" strokeWidth={1.75} /> Add set
        </button>
      </Card>

      <Sheet onClose={() => setSheet(null)} open={sheet === "menu"} title={exercise.name}>
        <Card className="divide-y divide-border">
          {track === "strength" ? (
            <Row
              icon={Flame}
              onClick={() => {
                setSheet(null);
                addWarmups();
              }}
              subtitle="Ramp up to your working weight"
              title="Add warm-up sets"
            />
          ) : null}
          {index < entries.length - 1 && !(label && !label.last) ? (
            <Row
              icon={Link2}
              onClick={() => {
                setSheet(null);
                linkNext();
              }}
              subtitle={exerciseName(entries[index + 1].exerciseId)}
              title="Superset with next"
            />
          ) : null}
          {label ? (
            <Row
              icon={Unlink}
              onClick={() => {
                setSheet(null);
                changeEntry((t) => (t.supersetId = null));
              }}
              title="Remove from superset"
            />
          ) : null}
          <Row icon={Timer} onClick={() => setSheet("rest")} title="Rest timer" value={entry.restSec ? format.rest(entry.restSec) : "Off"} />
          <Row icon={NotebookPen} onClick={() => setSheet("note")} title={exercise.note ? "Edit note" : "Add note"} />
        </Card>
        <Card className="divide-y divide-border">
          <Row icon={Eye} onClick={() => setSheet("peek")} title="History" />
          <Row icon={Repeat2} onClick={() => setSheet("swap")} title="Swap exercise" />
          {exercise.id ? <Row icon={Pencil} onClick={() => setSheet("edit")} title="Edit exercise" /> : null}
          <Row
            disabled={index === 0}
            icon={ChevronUp}
            onClick={() => {
              move(-1);
              setSheet(null);
            }}
            title="Move up"
          />
          <Row
            disabled={index === entries.length - 1}
            icon={ChevronDown}
            onClick={() => {
              move(1);
              setSheet(null);
            }}
            title="Move down"
          />
        </Card>
        <Card>
          <Row icon={Trash2} iconClass="text-destructive" onClick={removeEntry} title="Remove exercise" tone="danger" />
        </Card>
      </Sheet>

      <RestSheet
        onClose={() => setSheet(null)}
        onSave={(seconds) => changeEntry((t) => (t.restSec = seconds))}
        open={sheet === "rest"}
        value={entry.restSec ?? s.defaultRest}
      />
      <NoteSheet exercise={exercise} id={entry.exerciseId} onClose={() => setSheet(null)} open={sheet === "note"} />
      <PeekSheet id={entry.exerciseId} onClose={() => setSheet(null)} open={sheet === "peek"} workout={workout} />

      <Sheet onClose={() => setSheet(null)} open={typeof sheet === "object" && sheet !== null} title={sheet && typeof sheet === "object" ? `Set ${sheet.type + 1}` : ""}>
        {sheet && typeof sheet === "object" && entry.sets[sheet.type] ? (
          <>
            <Card className="divide-y divide-border">
              {Object.entries(TYPE_NAME).map(([type, name]) => (
                <Row
                  key={type}
                  onClick={() => {
                    changeEntry((t) => (t.sets[sheet.type].type = type));
                    setSheet(null);
                  }}
                  title={name}
                >
                  <span className={cn("sets grid size-8 place-items-center rounded-md bg-muted text-[13px]", TYPE_COLOR[type])}>{TYPE_LABEL[type] || "1"}</span>
                  {(entry.sets[sheet.type].type || "working") === type ? <Check className="size-5 text-primary" strokeWidth={1.75} /> : <span className="size-5" />}
                </Row>
              ))}
            </Card>
            {track !== "strength" && !entry.sets[sheet.type].done ? (
              <Card>
                <Row
                  icon={Play}
                  onClick={() => {
                    const at = sheet.type;
                    setSheet(null);
                    startTimer(at);
                  }}
                  subtitle={entry.sets[sheet.type].seconds ? `Counts down from ${format.clock(entry.sets[sheet.type].seconds)}` : "Counts down from last time, or runs as a stopwatch"}
                  title="Start timer"
                  tone="action"
                />
              </Card>
            ) : null}
            <Card>
              <Row
                disabled={entry.sets.length <= 1}
                icon={X}
                iconClass="text-destructive"
                onClick={() => {
                  closePad();
                  changeEntry((t) => t.sets.splice(sheet.type, 1));
                  setSheet(null);
                }}
                title="Delete set"
                tone="danger"
              />
            </Card>
          </>
        ) : null}
      </Sheet>

      <ExercisePicker exclude={[entry.exerciseId]} onClose={() => setSheet(null)} onPick={(picked) => changeEntry((t) => (t.exerciseId = picked.id))} open={sheet === "swap"} title="Swap exercise" />
      <EditExerciseSheet id={entry.exerciseId} onClose={() => setSheet(null)} open={sheet === "edit"} />
    </div>
  );
}

export function RestSheet({ open, onClose, value, onSave, options = REST_OPTIONS }: { open: boolean; onClose: () => void; value: number; onSave: (seconds: number) => void; options?: number[] }) {
  const [picked, setPicked] = useState(String(value));
  useEffect(() => {
    if (open) setPicked(String(options.includes(value) ? value : options[0]));
  }, [open]);
  return (
    <Sheet
      left={<SheetAction onClick={onClose}>Cancel</SheetAction>}
      onClose={onClose}
      open={open}
      right={
        <SheetAction
          bold
          onClick={() => {
            onSave(Number(picked));
            onClose();
          }}
        >
          Save
        </SheetAction>
      }
      title="Rest timer"
    >
      <div className="flex justify-center py-2">
        <WheelPicker
          columns={[{ id: "rest", label: "Rest", className: "w-32", options: options.map((sec) => ({ value: String(sec), label: sec ? format.rest(sec) : "Off" })) }]}
          label="Rest between sets"
          onValueChange={(v) => setPicked(v.rest)}
          value={{ rest: picked }}
        />
      </div>
      <p className="px-1 text-center text-[13px] text-muted-foreground">Starts when you check off a set. In a superset it starts after the last exercise.</p>
    </Sheet>
  );
}

export function NoteSheet({ open, onClose, exercise, id }: { open: boolean; onClose: () => void; exercise: any; id: string }) {
  const [text, setText] = useState(exercise.note || "");
  useEffect(() => {
    if (open) setText(exercise.note || "");
  }, [open]);
  return (
    <Sheet
      left={<SheetAction onClick={onClose}>Cancel</SheetAction>}
      onClose={onClose}
      open={open}
      right={
        <SheetAction
          bold
          onClick={() => {
            saveExerciseNote(id, text);
            onClose();
          }}
        >
          Save
        </SheetAction>
      }
      title="Note"
    >
      <Card className="p-4">
        <textarea autoFocus className="min-h-28 w-full resize-none bg-transparent text-[16px] outline-none placeholder:text-muted-foreground" onChange={(e) => setText(e.currentTarget.value)} placeholder="e.g. Seat on 4, pin on 7" value={text} />
      </Card>
      <p className="px-1 text-[13px] text-muted-foreground">Shows on {exercise.name} every time you do it. Good for seat height, grip, cues.</p>
    </Sheet>
  );
}

// A quick look at an exercise's history without leaving the workout.
function PeekSheet({ open, onClose, id, workout }: { open: boolean; onClose: () => void; id: string; workout: any }) {
  const history = useValue(sessions) as any[];
  const s = useValue(settings) as any;
  const points = useMemo(() => (open ? exerciseHistory(history, id, { excludeId: workout.id }) : []), [open, history, id]) as any[];
  const records_ = personalRecords(points);
  const track = trackOf(exerciseIndex.value.get(id));
  const bodyweight = track === "strength" && points.length > 0 && points.every((p) => p.topWeight === 0);
  const chart =
    track === "cardio"
      ? { caption: "Total time", unit: "min", y: (p: any) => Math.round((p.seconds / 60) * 10) / 10, decimals: 1 }
      : track === "timed"
        ? { caption: "Longest set", unit: "sec", y: (p: any) => p.longest, decimals: 0 }
        : bodyweight
          ? { caption: "Total reps", unit: "reps", y: (p: any) => p.totalReps, decimals: 0 }
          : { caption: "Estimated 1RM", unit: s.unit, y: (p: any) => p.bestE1rm, decimals: 0 };
  return (
    <Sheet onClose={onClose} open={open} tall title={exerciseName(id)}>
      {!points.length ? (
        <Empty icon={ArrowUpDown} title="No history yet">
          After today, your sets for this exercise show up here.
        </Empty>
      ) : (
        <>
          <Card className="p-4">
            <LineChart
              caption={chart.caption}
              decimals={chart.decimals}
              height={160}
              points={points.slice(-20).map((p) => ({ x: p.date, y: chart.y(p), note: `Best ${format.shortSet(p.topSet, track)}` }))}
              unit={chart.unit}
            />
          </Card>
          <StatTiles
            items={
              track === "cardio"
                ? [
                    { label: "Longest", value: format.clock(records_.session?.seconds || 0) },
                    { label: "Farthest", value: format.distance(records_.distance?.value || 0), unit: format.distanceUnit(s.unit) },
                    { label: "Steepest", value: format.weight(records_.incline?.value || 0), unit: "%" }
                  ]
                : track === "timed"
                  ? [
                      { label: "Longest set", value: format.clock(records_.longest?.seconds || 0) },
                      { label: "Most reps", value: records_.reps?.reps || "—" },
                      { label: "Sessions", value: points.length }
                    ]
                  : bodyweight
                ? [
                    { label: "Most reps", value: records_.reps?.reps || 0 },
                    { label: "Sessions", value: points.length },
                    { label: "Last", value: format.shortDate(points[points.length - 1].date) }
                  ]
                : [
                    { label: "Est. 1RM", value: format.weight(Math.round(records_.e1rm?.value || 0)), unit: s.unit },
                    { label: "Heaviest", value: format.weight(records_.weight?.weight || 0), unit: s.unit },
                    { label: "Sessions", value: points.length }
                  ]
            }
          />
          <Section title="Recent">
            <Card className="divide-y divide-border">
              {[...points]
                .reverse()
                .slice(0, 5)
                .map((p) => (
                  <Row key={p.workoutId} subtitle={p.sets.map((x: any) => format.shortSet(x, track)).join(", ")} title={format.date(p.date)} />
                ))}
            </Card>
          </Section>
          <Button
            onClick={() => {
              onClose();
              go(`exercise/${id}`);
            }}
            variant="tinted"
          >
            Show all history
          </Button>
        </>
      )}
    </Sheet>
  );
}
