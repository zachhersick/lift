// History: a month calendar with training days, every workout, and one
// workout's summary compared with the last time you did that day.
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, Empty, FadeIn, Page, Row, Section, StatTiles, TopBar } from "@/components/kit";
import { Barbell } from "@/components/plates";
import { Button } from "@/components/ui/button";
import { ask } from "@/lib/dialogs";
import { barFor, byNewest, cardioSeconds, dateKey, e1rm, exerciseHistory, isPersonalRecord, personalRecords, plateBreakdown, previousSession, trackOf, workoutSetCount, workoutVolume } from "@/lib/model.js";
import { go, route } from "@/lib/router.js";
import { exerciseIndex, exerciseName, records, remove, sessions, settings } from "@/lib/store.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { cn } from "@/lib/utils";


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
        <FadeIn key={label}>
          <Section title={label}>
            <div className="flex flex-col gap-2">
              {items.map((workout) => (
                <button className="surface flex items-center gap-3 rounded-2xl p-4 text-left transition-colors active:bg-accent" key={workout.id} onClick={() => go(`history/${workout.id}`)} type="button">
                  <span className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-border pr-3 text-muted-foreground">
                    <span className="text-[12px]">{format.date(workout.startedAt, { weekday: "short" })}</span>
                    <span className="text-[20px] leading-none font-medium text-foreground tabular">{new Date(workout.startedAt).getDate()}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-medium">{workout.name}</span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      {format.duration(workout.finishedAt - workout.startedAt)} · {format.plural(workoutSetCount(workout), "set")} · {(workout.entries || []).slice(0, 2).map((e: any) => exerciseName(e.exerciseId)).join(", ")}
                    </span>
                  </span>
                  <span className="sets shrink-0 text-[14px]">{format.volume(workoutVolume(workout), s.unit)}</span>
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
            on && "bg-primary font-medium text-primary-foreground",
            !on && key === today && "font-medium text-primary ring-1 ring-primary/50",
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
        <p className="text-[16px] font-medium">
          {format.date(month, { month: "long", year: "numeric" })} <span className="font-normal text-muted-foreground">· {format.plural(count, "training day")}</span>
        </p>
        <div className="flex gap-1">
          <button aria-label="Previous month" className="grid size-8 place-items-center rounded-full bg-muted text-primary active:bg-accent" onClick={() => setMonth(new Date(year, m - 1, 1).getTime())} type="button">
            <ChevronLeft className="size-4" strokeWidth={1.75} />
          </button>
          <button aria-label="Next month" className="grid size-8 place-items-center rounded-full bg-muted text-primary active:bg-accent disabled:opacity-30" disabled={isCurrent} onClick={() => setMonth(new Date(year, m + 1, 1).getTime())} type="button">
            <ChevronRight className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span className="pb-1 text-[12px] font-medium text-muted-foreground" key={i}>
            {d}
          </span>
        ))}
        {cells}
      </div>
    </Card>
  );
}

// The card after finishing: the heaviest barbell PR loaded on the bar, or
// how the session compares with the last time.
function Finished({ workout, prs, previous, volume }: { workout: any; prs: any[]; previous: any; volume: number }) {
  const s = useValue(settings) as any;
  const index = useValue(exerciseIndex) as Map<string, any>;
  const loaded = prs
    .map((pr) => ({ ...pr, exercise: index.get(pr.exerciseId) }))
    .filter((pr) => trackOf(pr.exercise) === "strength" && ["barbell", "plate loaded"].includes(pr.exercise?.equipment) && pr.set.weight > 0)
    .sort((a, b) => b.set.weight - a.set.weight)[0];
  const load = loaded ? plateBreakdown(loaded.set.weight, { bar: barFor(loaded.exercise.equipment, s.barWeight), plates: s.plates }) : null;
  const before = previous ? workoutVolume(previous) : 0;
  return (
    <section aria-label="Workout finished" className="surface flex flex-col gap-3 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        {prs.length ? <Trophy className="size-4 text-pr" strokeWidth={1.75} /> : null}
        <span>Workout finished</span>
      </div>
      <h2 className="text-[28px] leading-tight font-semibold">{prs.length ? (prs.length === 1 ? "New PR" : `${prs.length} PRs`) : "Done"}</h2>
      {load && load.perSide.length ? (
        <figure className="-mx-1 flex flex-col gap-1">
          <Barbell perSide={load.perSide} plates={s.plates} />
          <figcaption className="flex items-baseline justify-between px-1 text-[13px] text-muted-foreground">
            <span className="truncate">{loaded.exercise.name}</span>
            <span className="sets shrink-0 text-foreground">
              {format.shortSet(loaded.set, "strength")} <span className="text-muted-foreground">{s.unit}</span>
            </span>
          </figcaption>
        </figure>
      ) : null}
      <p className="text-[14px] text-muted-foreground">
        {previous ? `Volume ${volume >= before ? "up" : "down"} ${Math.abs(Math.round(((volume - before) / (before || 1)) * 100))}% vs your last ${workout.name}` : "Next time, these are the numbers to beat"}
      </p>
    </section>
  );
}

function Delta({ now, before, unit = "", percent = false, neutral = false }: { now: number; before: number; unit?: string; percent?: boolean; neutral?: boolean }) {
  const diff = now - before;
  if (Math.abs(diff) < 0.5) return <span className="text-[15px] text-muted-foreground">Same</span>;
  const text = percent && before ? `${diff > 0 ? "+" : ""}${Math.round((diff / before) * 100)}%` : `${diff > 0 ? "+" : "−"}${format.weight(Math.abs(Math.round(diff)))}${unit}`;
  return <span className={cn("text-[15px] font-medium tabular", neutral ? "text-muted-foreground" : diff > 0 ? "text-success" : "text-destructive")}>{text}</span>;
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
            <Pencil className="size-4" strokeWidth={1.75} />
          </button>
        }
      />

      {justFinished ? <Finished previous={previous} prs={prs} volume={volume} workout={workout} /> : null}

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
              <Row icon={Trophy} iconClass="text-pr" key={pr.set.id} subtitle={trackFor(pr.exerciseId) === "strength" ? `e1RM ${format.weight(Math.round(e1rm(pr.set.weight, pr.set.reps)))} ${s.unit}` : format.describeSet(pr.set, trackFor(pr.exerciseId), s.unit)} title={exerciseName(pr.exerciseId)} value={format.shortSet(pr.set, trackFor(pr.exerciseId))} />
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
                    <span className={cn("sets grid size-8 place-items-center rounded-md bg-muted text-[13px]", set.type === "warmup" && "text-pr", set.type === "drop" && "text-primary", set.type === "failure" && "text-destructive")}>
                      {set.type === "warmup" ? "W" : set.type === "drop" ? "D" : set.type === "failure" ? "F" : n}
                    </span>
                    <span className="sets flex-1 text-[15px]">{format.describeSet(set, trackFor(entry.exerciseId), s.unit)}</span>
                    {prIds.has(set.id) ? (
                      <span className="flex items-center gap-1 text-[13px] text-pr">
                        <Trophy className="size-3.5" strokeWidth={1.75} /> PR
                      </span>
                    ) : trackFor(entry.exerciseId) === "strength" && set.type !== "warmup" && set.weight > 0 ? (
                      <span className="sets text-[13px] text-muted-foreground">e1RM {format.weight(Math.round(e1rm(set.weight, set.reps)))}</span>
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
