// History: a month calendar with training days, every workout, and one
// workout's summary compared with the last time you did that day.
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { lazy, Suspense, useMemo, useState } from "react";
import SwooshText from "@/components/kokonutui/swoosh-text";
import { Card, Empty, FadeIn, Page, Row, Section, StatTiles, TopBar } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { ask } from "@/lib/dialogs";
import { byNewest, cardioSeconds, dateKey, e1rm, exerciseHistory, isPersonalRecord, personalRecords, previousSession, trackOf, workoutSetCount, workoutVolume } from "@/lib/model.js";
import { go, route } from "@/lib/router.js";
import { exerciseIndex, exerciseName, records, remove, sessions, settings } from "@/lib/store.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { cn } from "@/lib/utils";

const MeshHero = lazy(() => import("@/components/mesh-hero"));

export function History() {
  const list = useValue(sessions) as any[];
  const s = useValue(settings) as any;
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const sorted = useMemo(() => [...list].sort(byNewest), [list]);
  const trained = useMemo(() => new Set(sorted.map((w) => dateKey(w.startedAt))), [sorted]);
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const workout of sorted) {
      const label = format.date(workout.startedAt, { month: "long", year: "numeric" });
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(workout);
    }
    return [...map.entries()];
  }, [sorted]);

  return (
    <Page>
      <TopBar subtitle={sorted.length ? format.plural(sorted.length, "workout") : undefined} title="History" />
      <FadeIn>
        <Calendar month={month} setMonth={setMonth} trained={trained} />
      </FadeIn>
      {!sorted.length ? (
        <Empty icon={CalendarDays} title="No workouts yet">
          Finished workouts show up here.
        </Empty>
      ) : null}
      {groups.map(([label, items], gi) => (
        <FadeIn delay={0.05 * gi} key={label}>
          <Section title={label}>
            <div className="flex flex-col gap-2">
              {items.map((workout) => (
                <button className="surface flex items-center gap-3 rounded-2xl p-4 text-left active:scale-[0.99]" key={workout.id} onClick={() => go(`history/${workout.id}`)} type="button">
                  <span className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-primary/12 py-1.5 text-primary">
                    <span className="text-[10.5px] font-semibold uppercase">{format.date(workout.startedAt, { weekday: "short" })}</span>
                    <span className="text-[18px] leading-none font-semibold tabular">{new Date(workout.startedAt).getDate()}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[16px] font-semibold">{workout.name}</span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      {format.duration(workout.finishedAt - workout.startedAt)} · {format.plural(workoutSetCount(workout), "set")} · {(workout.entries || []).slice(0, 2).map((e: any) => exerciseName(e.exerciseId)).join(", ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-[14px] font-semibold tabular">{format.volume(workoutVolume(workout), s.unit)}</span>
                </button>
              ))}
            </div>
          </Section>
        </FadeIn>
      ))}
    </Page>
  );
}

function Calendar({ month, setMonth, trained }: { month: number; setMonth: (v: number) => void; trained: Set<string> }) {
  const first = new Date(month);
  const year = first.getFullYear();
  const m = first.getMonth();
  const days = new Date(year, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const today = dateKey();
  let count = 0;
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(<span key={`b${i}`} />);
  for (let day = 1; day <= days; day += 1) {
    const key = dateKey(new Date(year, m, day).getTime());
    const on = trained.has(key);
    if (on) count += 1;
    cells.push(
      <span className="grid h-10 place-items-center" key={key}>
        <span
          className={cn(
            "grid size-9 place-items-center rounded-full text-[15px] tabular",
            on && "bg-gradient-to-br from-[var(--tint)] to-[var(--tint-2)] font-semibold text-white shadow-[0_6px_16px_-8px_var(--tint)]",
            !on && key === today && "font-semibold text-primary ring-1 ring-primary/50",
            !on && key !== today && "text-foreground/80"
          )}
        >
          {day}
        </span>
      </span>
    );
  }
  const isCurrent = year === new Date().getFullYear() && m === new Date().getMonth();
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-[16px] font-semibold">
          {format.date(month, { month: "long", year: "numeric" })} <span className="font-normal text-muted-foreground">· {format.plural(count, "training day")}</span>
        </p>
        <div className="flex gap-1">
          <button aria-label="Previous month" className="grid size-8 place-items-center rounded-full bg-muted text-primary active:bg-accent" onClick={() => setMonth(new Date(year, m - 1, 1).getTime())} type="button">
            <ChevronLeft className="size-4" strokeWidth={2.8} />
          </button>
          <button aria-label="Next month" className="grid size-8 place-items-center rounded-full bg-muted text-primary active:bg-accent disabled:opacity-30" disabled={isCurrent} onClick={() => setMonth(new Date(year, m + 1, 1).getTime())} type="button">
            <ChevronRight className="size-4" strokeWidth={2.8} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span className="pb-1 text-[12px] font-semibold text-muted-foreground" key={i}>
            {d}
          </span>
        ))}
        {cells}
      </div>
    </Card>
  );
}

function Delta({ now, before, unit = "", percent = false, neutral = false }: { now: number; before: number; unit?: string; percent?: boolean; neutral?: boolean }) {
  const diff = now - before;
  if (Math.abs(diff) < 0.5) return <span className="text-[15px] text-muted-foreground">Same</span>;
  const text = percent && before ? `${diff > 0 ? "+" : ""}${Math.round((diff / before) * 100)}%` : `${diff > 0 ? "+" : "−"}${format.weight(Math.abs(Math.round(diff)))}${unit}`;
  return <span className={cn("text-[15px] font-semibold tabular", neutral ? "text-muted-foreground" : diff > 0 ? "text-success" : "text-destructive")}>{text}</span>;
}

export function WorkoutDetail({ id }: { id: string }) {
  const all = useValue(records) as Map<string, any>;
  const list = useValue(sessions) as any[];
  const s = useValue(settings) as any;
  const r = useValue(route) as any;
  const index = useValue(exerciseIndex) as Map<string, any>;
  const trackFor = (exerciseId: string) => trackOf(index.get(exerciseId));
  const workout = all.get(id);
  const justFinished = r.query.get("done") === "1";

  const prs = useMemo(() => {
    if (!workout) return [];
    const found: any[] = [];
    for (const entry of workout.entries || []) {
      const prior = personalRecords(exerciseHistory(list, entry.exerciseId, { before: workout.startedAt, excludeId: workout.id }));
      for (const set of entry.sets) if (isPersonalRecord(set, prior, trackFor(entry.exerciseId))) found.push({ set, exerciseId: entry.exerciseId });
    }
    return found;
  }, [workout, list, index]);

  if (!workout || workout.deleted) {
    return (
      <Page>
        <TopBar backLabel="History" backTo="history" large={false} title="Workout" />
        <Empty icon={CalendarDays} title="Workout not found" />
      </Page>
    );
  }

  const prIds = new Set(prs.map((pr) => pr.set.id));
  const previous = previousSession(list, workout);
  const minutes = workout.finishedAt - workout.startedAt;
  const volume = workoutVolume(workout);
  const sets = workoutSetCount(workout);

  const del = async () => {
    if (await ask({ title: "Delete workout?", message: "This can't be undone.", confirm: "Delete", danger: true })) {
      await remove(id);
      go("history", { replace: true });
    }
  };

  return (
    <Page>
      <TopBar
        backLabel={justFinished ? "Today" : "History"}
        backTo={justFinished ? "today" : "history"}
        subtitle={`${format.date(workout.startedAt, { weekday: "long", month: "long", day: "numeric" })} at ${format.time(workout.startedAt)}`}
        title={workout.name}
        trailing={
          <button aria-label="Edit workout" className="grid size-9 place-items-center rounded-full bg-muted text-primary active:bg-accent" onClick={() => go(`workout/${id}`)} type="button">
            <Pencil className="size-4" strokeWidth={2.4} />
          </button>
        }
      />

      {justFinished ? (
        <motion.section
          animate={{ opacity: 1, scale: 1 }}
          className="relative isolate overflow-hidden rounded-[32px] px-6 py-10 text-center text-white ring-1 ring-white/10"
          initial={{ opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 240, damping: 24 }}
        >
          <div className="absolute inset-0 -z-10 bg-zinc-950 bg-[radial-gradient(100%_80%_at_50%_0%,var(--tint),transparent_70%)]" />
          <Suspense fallback={null}>
            <MeshHero className="absolute inset-0 -z-10" intensity={1.2} />
          </Suspense>
          <div className="absolute inset-0 -z-10 bg-black/35" />
          <motion.span
            animate={{ scale: 1, rotate: 0 }}
            className={cn("mx-auto mb-4 grid size-16 place-items-center rounded-full shadow-2xl", prs.length ? "bg-gradient-to-br from-amber-300 to-orange-500" : "bg-white text-zinc-950")}
            initial={{ scale: 0, rotate: -30 }}
            transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.15 }}
          >
            {prs.length ? <Trophy className="size-8" strokeWidth={2.2} /> : <span className="text-[28px]">✓</span>}
          </motion.span>
          <SwooshText accent="var(--tint)" as="h2" className="text-[40px] leading-none text-white" depth={10} length={0.16} text={prs.length ? (prs.length === 1 ? "New PR" : `${prs.length} PRs`) : "Done"} />
          <p className="mt-3 text-[15px] text-white/80">
            {previous
              ? `Volume ${volume >= workoutVolume(previous) ? "up" : "down"} ${Math.abs(Math.round(((volume - workoutVolume(previous)) / (workoutVolume(previous) || 1)) * 100))}% from your last ${workout.name}.`
              : "Next time, these are the numbers to beat."}
          </p>
        </motion.section>
      ) : null}

      <StatTiles
        items={[
          { label: "Time", value: format.duration(minutes) },
          { label: "Sets", value: sets },
          ...(volume > 0 || !cardioSeconds(workout, index) ? [{ label: "Volume", value: format.volume(volume, "").trim(), unit: s.unit }] : []),
          ...(cardioSeconds(workout, index) ? [{ label: "Cardio", value: Math.round(cardioSeconds(workout, index) / 60), unit: "min" }] : [])
        ]}
      />

      {previous ? (
        <Section footer={`Compared with your last ${previous.name}, ${format.date(previous.startedAt)}.`} title="vs. last time">
          <Card className="divide-y divide-border">
            <Row subtitle={format.volume(workoutVolume(previous), s.unit)} title="Volume">
              <Delta before={workoutVolume(previous)} now={volume} percent />
            </Row>
            <Row subtitle={String(workoutSetCount(previous))} title="Sets">
              <Delta before={workoutSetCount(previous)} now={sets} />
            </Row>
            <Row subtitle={format.duration(previous.finishedAt - previous.startedAt)} title="Duration">
              <Delta before={Math.round((previous.finishedAt - previous.startedAt) / 60_000)} neutral now={Math.round(minutes / 60_000)} unit=" min" />
            </Row>
          </Card>
        </Section>
      ) : null}

      {prs.length ? (
        <Section title="Personal records">
          <Card className="divide-y divide-border">
            {prs.map((pr) => (
              <Row icon={Trophy} iconClass="bg-gradient-to-br from-amber-300 to-orange-500 text-white" key={pr.set.id} subtitle={trackFor(pr.exerciseId) === "strength" ? `e1RM ${format.weight(Math.round(e1rm(pr.set.weight, pr.set.reps)))} ${s.unit}` : format.describeSet(pr.set, trackFor(pr.exerciseId), s.unit)} title={exerciseName(pr.exerciseId)} value={format.shortSet(pr.set, trackFor(pr.exerciseId))} />
            ))}
          </Card>
        </Section>
      ) : null}

      {(workout.entries || []).map((entry: any) => {
        let n = 0;
        return (
          <Section action={<a className="text-primary" href={`#/exercise/${entry.exerciseId}`}>History</a>} key={entry.id} title={exerciseName(entry.exerciseId)}>
            <Card className="divide-y divide-border">
              {entry.sets.map((set: any) => {
                if (set.type !== "warmup") n += 1;
                return (
                  <div className="flex items-center gap-3 px-4 py-3" key={set.id}>
                    <span className={cn("grid size-8 place-items-center rounded-lg bg-muted text-[13px] font-semibold tabular", set.type === "warmup" && "text-amber-500", set.type === "drop" && "text-violet-400", set.type === "failure" && "text-red-400")}>
                      {set.type === "warmup" ? "W" : set.type === "drop" ? "D" : set.type === "failure" ? "F" : n}
                    </span>
                    <span className="flex-1 text-[15.5px] tabular">{format.describeSet(set, trackFor(entry.exerciseId), s.unit)}</span>
                    {prIds.has(set.id) ? (
                      <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[12px] font-bold text-amber-500">
                        <Trophy className="size-3.5" strokeWidth={2.6} /> PR
                      </span>
                    ) : trackFor(entry.exerciseId) === "strength" && set.type !== "warmup" && set.weight > 0 ? (
                      <span className="text-[13px] text-muted-foreground tabular">e1RM {format.weight(Math.round(e1rm(set.weight, set.reps)))}</span>
                    ) : null}
                  </div>
                );
              })}
            </Card>
          </Section>
        );
      })}

      {workout.notes ? (
        <Section title="Notes">
          <Card className="p-4 text-[15px]">{workout.notes}</Card>
        </Section>
      ) : null}

      <div className="flex flex-col gap-2">
        {justFinished ? (
          <Button onClick={() => go("today", { replace: true })} size="lg">
            Done
          </Button>
        ) : null}
        <Button onClick={del} variant="destructive">
          Delete workout
        </Button>
      </div>
    </Page>
  );
}
