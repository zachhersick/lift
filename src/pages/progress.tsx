// Progress: training volume over time, bodyweight, and every exercise with
// its trend; the exercise page swipes between charts and lists records.
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, Dumbbell, NotebookPen, Scale, Search, Sparkles, Trash2, Utensils } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import MetricCard from "@/components/kokonutui/metric-card";
import SmoothTab from "@/components/kokonutui/smooth-tab";
import { LineChart, Sparkline } from "@/components/chart";
import { Card, Empty, FadeIn, Page, Row, Section, Segmented, StatTiles, TopBar } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { ask } from "@/lib/dialogs";
import { dateKey, exerciseHistory, finished, personalRecords, trackOf, trend, workingSets } from "@/lib/model.js";
import { go } from "@/lib/router.js";
import { bodyweights, exerciseIndex, maintenance, remove, sessions, settings } from "@/lib/store.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { cn } from "@/lib/utils";
import { NoteSheet } from "./workout";

const UPPER = new Set(["chest", "back", "shoulders", "biceps", "triceps", "forearms"]);
const LOWER = new Set(["quads", "hamstrings", "glutes", "calves"]);

// Daily volume split into upper body, lower body and everything else, for
// the last 180 days (the metric card compares each period with the one before).
function useVolumeSeries() {
  const list = useValue(sessions) as any[];
  const index = useValue(exerciseIndex) as Map<string, any>;
  return useMemo(() => {
    const byDay = new Map<string, number[]>();
    for (const workout of finished(list)) {
      const key = dateKey(workout.startedAt);
      const parts = byDay.get(key) || [0, 0, 0];
      for (const entry of workout.entries || []) {
        const muscle = index.get(entry.exerciseId)?.muscle || "other";
        const slot = UPPER.has(muscle) ? 0 : LOWER.has(muscle) ? 1 : 2;
        for (const set of workingSets(entry)) parts[slot] += (Number(set.weight) || 0) * (Number(set.reps) || 0);
      }
      byDay.set(key, parts);
    }
    const out = [];
    const today = new Date();
    for (let i = 179; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = dateKey(d.getTime());
      out.push({ date: key, parts: byDay.get(key) || [0, 0, 0] });
    }
    return out;
  }, [list, index]);
}

function TrendBadge({ value }: { value: string }) {
  const map: Record<string, [any, string, string]> = {
    up: [ArrowUpRight, "Up", "bg-success/15 text-success"],
    down: [ArrowDownRight, "Down", "bg-destructive/15 text-destructive"],
    flat: [ArrowRight, "Flat", "bg-muted text-muted-foreground"],
    new: [Sparkles, "New", "bg-primary/15 text-primary"]
  };
  const [Icon, text, cls] = map[value] || map.new;
  return (
    <span className={cn("flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-semibold", cls)}>
      <Icon className="size-3.5" strokeWidth={2.6} />
      {text}
    </span>
  );
}

export function Progress() {
  const list = useValue(sessions) as any[];
  const index = useValue(exerciseIndex) as Map<string, any>;
  const entries = useValue(bodyweights) as any[];
  const s = useValue(settings) as any;
  const [query, setQuery] = useState("");
  const series = useVolumeSeries();
  const rows = useMemo(() => {
    const ids = new Set<string>();
    for (const workout of list) for (const entry of workout.entries || []) ids.add(entry.exerciseId);
    return [...ids]
      .map((id) => {
        const history = exerciseHistory(list, id) as any[];
        return { id, exercise: index.get(id), history, last: history[history.length - 1], trend: trend(history) };
      })
      .filter((row) => row.last)
      .sort((a, b) => b.last.date - a.last.date);
  }, [list, index]);
  const q = query.trim().toLowerCase();
  const shown = rows.filter((row) => !q || (row.exercise?.name || "").toLowerCase().includes(q));
  const count = (t: string) => rows.filter((r) => r.trend === t).length;
  const latest = entries[0];
  const energy = useValue(maintenance) as any;

  return (
    <Page>
      <TopBar subtitle={rows.length ? `${format.plural(rows.length, "exercise")} tracked` : undefined} title="Progress" />
      {rows.length ? (
        <FadeIn>
          <MetricCard data={series} defaultPeriod={30} events={[]} format="number" label={`Training volume (${s.unit})`} periods={[7, 30, 90]} segments={["Upper body", "Lower body", "Core & other"]} />
        </FadeIn>
      ) : null}

      <FadeIn delay={0.05}>
        <button className="surface flex w-full items-center gap-4 rounded-3xl p-4 text-left active:scale-[0.99]" onClick={() => go("bodyweight")} type="button">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Scale className="size-5" strokeWidth={2.2} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13px] text-muted-foreground">Bodyweight</span>
            <span className="text-[20px] font-semibold tracking-tight tabular">{latest ? `${format.weight(latest.weight)} ${s.unit}` : "Not logged yet"}</span>
          </span>
          <Sparkline values={[...entries].reverse().slice(-14).map((e) => e.weight)} />
        </button>
      </FadeIn>
      <FadeIn delay={0.07}>
        <button className="surface flex w-full items-center gap-4 rounded-3xl p-4 text-left active:scale-[0.99]" onClick={() => go("nutrition")} type="button">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Utensils className="size-5" strokeWidth={2.2} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13px] text-muted-foreground">Fuel · maintenance</span>
            <span className="text-[20px] font-semibold tracking-tight tabular">{energy.calories ? `${energy.calories.toLocaleString()} kcal` : "Not enough data"}</span>
          </span>
          <ChevronRight className="size-[18px] text-muted-foreground/60" strokeWidth={2.4} />
        </button>
      </FadeIn>

      {!rows.length ? (
        <Empty icon={Dumbbell} title="Nothing to chart yet">
          After a couple of workouts, each exercise gets its own chart and records.
        </Empty>
      ) : (
        <>
          <StatTiles
            items={[
              { label: "Going up", value: count("up") },
              { label: "Holding", value: count("flat") },
              { label: "Going down", value: count("down") }
            ]}
          />
          <Section footer="Trend compares your best estimated 1RM over the last three sessions with the three before." title="Exercises">
            <label className="flex h-11 items-center gap-2 rounded-2xl bg-muted px-3.5 text-muted-foreground">
              <Search className="size-[18px]" strokeWidth={2.2} />
              <input className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground" onChange={(e) => setQuery(e.currentTarget.value)} placeholder="Search your exercises" type="search" value={query} />
            </label>
            <Card className="divide-y divide-border">
              {shown.map((row, i) => (
                <motion.div animate={{ opacity: 1 }} initial={{ opacity: 0 }} key={row.id} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                  <Row chevron onClick={() => go(`exercise/${row.id}`)} subtitle={`${format.shortSet(row.last.topSet, trackOf(row.exercise))} · ${format.relativeDay(row.last.date)}`} title={row.exercise?.name || "Unknown exercise"}>
                    <Sparkline values={row.history.slice(-12).map((p: any) => p.score ?? (p.bestE1rm || p.totalReps))} width={52} />
                    <TrendBadge value={row.trend} />
                  </Row>
                </motion.div>
              ))}
              {!shown.length ? <Row title="No matches" /> : null}
            </Card>
          </Section>
        </>
      )}
    </Page>
  );
}

const RANGES = [
  { value: 30, label: "1M" },
  { value: 90, label: "3M" },
  { value: 365, label: "1Y" },
  { value: 0, label: "All" }
];

export function ExerciseDetail({ id }: { id: string }) {
  const list = useValue(sessions) as any[];
  const index = useValue(exerciseIndex) as Map<string, any>;
  const s = useValue(settings) as any;
  const [range, setRange] = useState(90);
  const [noting, setNoting] = useState(false);
  const exercise = index.get(id);
  const history = useMemo(() => exerciseHistory(list, id) as any[], [list, id]);
  const records = useMemo(() => personalRecords(history), [history]);
  const track = trackOf(exercise);
  const bodyweight = track === "strength" && history.length > 0 && history.every((p) => p.topWeight === 0);

  if (!exercise) {
    return (
      <Page>
        <TopBar backLabel="Progress" backTo="progress" large={false} title="Exercise" />
        <Empty icon={Dumbbell} title="Exercise not found" />
      </Page>
    );
  }

  const from = range ? Date.now() - range * 86_400_000 : 0;
  const inRange = history.filter((p) => p.date >= from);
  const chart = (caption: string, unit: string, value: (p: any) => number, decimals = 0) => (
    <LineChart caption={caption} decimals={decimals} height={170} points={inRange.map((p) => ({ x: p.date, y: value(p), note: `Best ${format.shortSet(p.topSet, track)}` }))} unit={unit} />
  );
  const minutes = (seconds: number) => Math.round((seconds / 60) * 10) / 10;
  const tabs =
    track === "cardio"
      ? [
          { id: "time", title: "Time", content: chart("Total time", "min", (p) => minutes(p.seconds), 1) },
          { id: "distance", title: "Distance", content: chart("Distance", format.distanceUnit(s.unit), (p) => Math.round(p.distance * 100) / 100, 2) },
          { id: "speed", title: "Speed", content: chart("Top speed", format.speedUnit(s.unit), (p) => p.topSpeed, 1) },
          { id: "incline", title: "Incline", content: chart("Steepest incline", "%", (p) => p.maxIncline, 1) }
        ]
      : track === "timed"
        ? [
            { id: "longest", title: "Longest", content: chart("Longest set", "sec", (p) => p.longest) },
            { id: "total", title: "Total", content: chart("Total time", "min", (p) => minutes(p.seconds), 1) },
            { id: "reps", title: "Reps", content: chart("Total reps", "reps", (p) => p.totalReps) }
          ]
        : bodyweight
    ? [{ id: "reps", title: "Reps", content: chart("Total reps", "reps", (p) => p.totalReps) }]
    : [
        { id: "e1rm", title: "Est. 1RM", content: chart("Estimated 1RM", s.unit, (p) => p.bestE1rm) },
        { id: "top", title: "Heaviest", content: chart("Heaviest set", s.unit, (p) => p.topWeight) },
        { id: "volume", title: "Volume", content: chart("Session volume", s.unit, (p) => p.volume) },
        { id: "reps", title: "Reps", content: chart("Total reps", "reps", (p) => p.totalReps) }
      ];
  const repRecords = [...records.repsAtWeight.entries()].sort((a: any, b: any) => b[0] - a[0]).slice(0, 8);

  const removeCustom = async () => {
    if (await ask({ title: `Delete ${exercise.name}?`, message: "It disappears from the library. Past workouts keep their sets.", confirm: "Delete", danger: true })) {
      await remove(id);
      go("progress", { replace: true });
    }
  };

  return (
    <Page>
      <TopBar backLabel="Progress" backTo="progress" subtitle={`${format.capitalize(exercise.muscle || "other")} · ${format.capitalize(exercise.equipment || "other")}`} title={exercise.name} />
      {!history.length ? (
        <Empty icon={Dumbbell} title="No sets yet">
          Do this exercise in a workout and its chart starts here.
        </Empty>
      ) : (
        <>
          <FadeIn className="flex flex-col gap-3">
            <SmoothTab activeColor="bg-primary" activeTextColor="text-primary-foreground" className="max-w-none" items={tabs} key={`${range}-${history.length}`} label="Chart" />
            <Segmented label="Range" onChange={setRange} options={RANGES} size="sm" value={range} />
          </FadeIn>

          <StatTiles
            items={
              track === "cardio"
                ? [
                    { label: "Longest", value: format.clock(records.session?.seconds || 0), sub: records.session ? format.shortDate(records.session.date) : "" },
                    { label: "Farthest", value: format.distance(records.distance?.value || 0), unit: format.distanceUnit(s.unit), sub: records.distance ? format.shortDate(records.distance.date) : "" },
                    { label: "Fastest", value: format.weight(records.speed?.value || 0), unit: format.speedUnit(s.unit), sub: records.speed ? format.shortDate(records.speed.date) : "" },
                    { label: "Steepest", value: format.weight(records.incline?.value || 0), unit: "%", sub: records.incline ? format.shortDate(records.incline.date) : "" }
                  ]
                : track === "timed"
                  ? [
                      { label: "Longest set", value: format.clock(records.longest?.seconds || 0), sub: records.longest ? format.shortDate(records.longest.date) : "" },
                      { label: "Most reps", value: records.reps?.reps || "—", sub: records.reps ? format.shortDate(records.reps.date) : "" },
                      { label: "Sessions", value: history.length }
                    ]
                  : bodyweight
                ? [
                    { label: "Most reps", value: records.reps?.reps || 0, sub: records.reps ? format.shortDate(records.reps.date) : "" },
                    { label: "Best session", value: `${Math.max(...history.map((p) => p.totalReps))}`, unit: "reps" },
                    { label: "Sessions", value: history.length }
                  ]
                : [
                    { label: "Est. 1RM", value: format.weight(Math.round(records.e1rm?.value || 0)), unit: s.unit, sub: records.e1rm ? `${format.weight(records.e1rm.weight)} × ${records.e1rm.reps}` : "" },
                    { label: "Heaviest", value: format.weight(records.weight?.weight || 0), unit: s.unit, sub: records.weight ? `× ${records.weight.reps}` : "" },
                    { label: "Most reps", value: records.reps?.reps || 0, sub: records.reps ? `at ${format.weight(records.reps.weight)}` : "" },
                    { label: "Best session", value: format.volume(records.volume?.value || 0, "").trim(), unit: s.unit, sub: records.volume ? format.shortDate(records.volume.date) : "" }
                  ]
            }
          />

          {track === "strength" && !bodyweight && repRecords.length > 1 ? (
            <Section title="Best reps at each weight">
              <Card className="divide-y divide-border">
                {repRecords.map(([weight, record]: any) => (
                  <Row key={weight} subtitle={format.shortDate(record.date)} title={`${format.weight(weight)} ${s.unit}`} value={`${record.reps} reps`} />
                ))}
              </Card>
            </Section>
          ) : null}

          <Section title="History">
            <Card className="divide-y divide-border">
              {[...history].reverse().map((p) => (
                <Row chevron key={p.workoutId} onClick={() => go(`history/${p.workoutId}`)} subtitle={p.sets.map((x: any) => format.shortSet(x, track)).join(", ")} title={format.date(p.date)} />
              ))}
            </Card>
          </Section>
        </>
      )}

      <Section footer="Shows on this exercise in every workout." title="Note">
        <Card>
          <Row chevron icon={NotebookPen} iconClass="bg-amber-400/15 text-amber-500" onClick={() => setNoting(true)} title={exercise.note || "Add a note"} tone={exercise.note ? undefined : "action"} />
        </Card>
      </Section>
      {!exercise.builtIn ? (
        <Button onClick={removeCustom} variant="destructive">
          <Trash2 className="size-4" /> Delete custom exercise
        </Button>
      ) : null}
      <NoteSheet exercise={exercise} id={id} onClose={() => setNoting(false)} open={noting} />
    </Page>
  );
}
