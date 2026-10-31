// Today: the next day in the rotation over a live gradient, this week's
// rings, what you ate, the Coach, sets per muscle, consistency, bodyweight
// and recent PRs.
import { Cloud, Moon, Play, Scale, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { type CSSProperties, lazy, Suspense, useMemo, useState } from "react";
import AppleActivityCard from "@/components/kokonutui/apple-activity-card";
import ActivityTerrain from "@/components/kokonutui/activity-terrain";
import { Sparkline } from "@/components/chart";
import { Card, FadeIn, Page, Row, Section, Sheet, TopBar } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { applyTemplate, logRest, startWorkout } from "@/lib/actions.js";
import { native } from "@/lib/api.js";
import { ramp } from "@/lib/color";
import { TEMPLATES } from "@/lib/exercises.js";
import {
  dailyVolume, dateKey, defaultWeeklyGoal, e1rm, exerciseHistory, isPersonalRecord, lastDoneAt, muscleSets, nextSplitDay,
  orderedDays, personalRecords, previousEntry, startOfWeek, trackOf, weekStreak, weekSummary
} from "@/lib/model.js";
import { go } from "@/lib/router.js";
import { activeWorkout, bodyweights, exerciseIndex, exerciseName, finishedWorkouts, sessions, settings, splitDays } from "@/lib/store.js";
import { sync } from "@/lib/sync.js";
import { isDark, tintColors } from "@/lib/theme.js";
import { now } from "@/lib/timer.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { BodyweightSheet } from "./bodyweight";
import { CoachStrip } from "@/components/insights";
import { FuelCard } from "./nutrition";

const MeshHero = lazy(() => import("@/components/mesh-hero"));

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Late session?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Today() {
  const days = useValue(splitDays) as any[];
  const done = useValue(finishedWorkouts) as any[];
  const list = useValue(sessions) as any[];
  const active = useValue(activeWorkout) as any;
  const syncState = useValue(sync) as any;
  const tick = useValue(now);
  const [choosing, setChoosing] = useState(false);
  const [weighing, setWeighing] = useState(false);
  const next = nextSplitDay(days, done);

  return (
    <Page>
      <TopBar eyebrow={format.date(Date.now(), { weekday: "long", month: "long", day: "numeric" })} title="Today">
        <h1 className="text-[34px] leading-[1.1] font-semibold tracking-[-0.03em]">{greeting()}</h1>
      </TopBar>

      {syncState.status === "signedOut" ? (
        <FadeIn>
          <Card>
            <Row chevron href={native ? "#/settings" : "/api/auth/login"} icon={Cloud} subtitle="Sign in to sync your phone and computer" title="Back up your workouts" />
          </Card>
        </FadeIn>
      ) : null}

      {active ? (
        <FadeIn>
          <button className="surface relative flex w-full items-center gap-4 overflow-hidden rounded-3xl p-4 text-left active:scale-[0.99]" onClick={() => go(`workout/${active.id}`)} type="button">
            <span className="tint-glow pointer-events-none absolute inset-0" />
            <span className="relative grid size-12 place-items-center rounded-2xl bg-success/15 text-success">
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex size-3 rounded-full bg-success" />
              </span>
            </span>
            <span className="relative flex min-w-0 flex-1 flex-col">
              <span className="text-[12px] font-semibold tracking-wide text-success uppercase">In progress</span>
              <span className="truncate text-[18px] font-semibold">{active.name}</span>
            </span>
            <span className="relative text-[17px] font-semibold tabular">{format.clock((tick - active.startedAt) / 1000)}</span>
          </button>
        </FadeIn>
      ) : null}

      {!days.length ? <SetupSplit /> : next ? <UpNext blocked={Boolean(active)} days={days} next={next} onChoose={() => setChoosing(true)} /> : null}

      <FadeIn delay={0.08}>
        <WeekRings />
      </FadeIn>
      <FadeIn delay={0.1}>
        <FuelCard />
      </FadeIn>
      <FadeIn delay={0.11}>
        <CoachStrip />
      </FadeIn>
      <FadeIn delay={0.12}>
        <MuscleVolume />
      </FadeIn>
      <FadeIn delay={0.16}>
        <Consistency />
      </FadeIn>
      <FadeIn delay={0.2}>
        <BodyCard onLog={() => setWeighing(true)} />
      </FadeIn>
      <RecentPRs />

      <Sheet onClose={() => setChoosing(false)} open={choosing} title="Choose a day">
        <Card className="divide-y divide-border">
          {orderedDays(days).map((day: any) => {
            const last = lastDoneAt(day.id, done);
            return (
              <Row
                icon={day.rest ? Moon : Play}
                iconClass={day.rest ? "bg-violet-500/15 text-violet-400" : undefined}
                key={day.id}
                onClick={async () => {
                  setChoosing(false);
                  if (day.rest) await logRest(day);
                  else startWorkout(day);
                }}
                subtitle={day.rest ? "Rest day" : format.plural(day.exercises?.length || 0, "exercise")}
                title={day.name}
                value={last ? format.relativeDay(last) : ""}
              />
            );
          })}
        </Card>
        <Card>
          <Row
            onClick={() => {
              setChoosing(false);
              startWorkout(null);
            }}
            subtitle="Add exercises as you go"
            title="Empty workout"
            tone="action"
          />
        </Card>
      </Sheet>
      <BodyweightSheet onClose={() => setWeighing(false)} open={weighing} />
    </Page>
  );
}

function UpNext({ next, days, onChoose, blocked }: { next: any; days: any[]; onChoose: () => void; blocked: boolean }) {
  const list = useValue(sessions) as any[];
  const { day, index, count, lastDoneAt: last } = next;
  const ordered = orderedDays(days);
  const after = day.rest ? ordered.slice(index + 1).concat(ordered.slice(0, index)).find((item: any) => !item.rest) : null;
  const items = day.exercises || [];

  return (
    <motion.section
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="relative isolate overflow-hidden rounded-[32px] text-white shadow-[0_24px_60px_-28px_var(--tint)] ring-1 ring-white/10"
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
    >
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_0%_0%,var(--tint),transparent_60%),radial-gradient(100%_90%_at_100%_100%,var(--tint-2),transparent_60%)] bg-zinc-950" />
      <Suspense fallback={null}>
        <MeshHero className="absolute inset-0 -z-10" />
      </Suspense>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/10 via-black/25 to-black/70" />

      <div className="flex flex-col gap-5 p-5 pt-6">
        <div className="flex items-center justify-between text-[12px] font-semibold tracking-wide text-white/75 uppercase">
          <span>Up next</span>
          <span className="rounded-full bg-white/15 px-2.5 py-1 backdrop-blur-md">
            Day {index + 1} of {count}
          </span>
        </div>
        <div>
          <h2 className="flex items-center gap-3 text-[44px] leading-none font-semibold tracking-[-0.04em]">
            {day.rest ? <Moon className="size-9" strokeWidth={2} /> : null}
            {day.rest ? "Rest day" : day.name}
          </h2>
          <p className="mt-2 text-[15px] text-white/75">
            {day.rest ? (last ? `Last rest ${format.relativeDay(last).toLowerCase()}` : "Recovery builds the gains") : `${last ? `Last done ${format.relativeDay(last).toLowerCase()}` : "Not done yet"} · ${format.plural(items.length, "exercise")}`}
          </p>
        </div>

        {!day.rest && items.length ? (
          <div className="flex flex-wrap gap-2">
            {items.slice(0, 6).map((item: any, i: number) => {
              const prev = previousEntry(list, item.exerciseId);
              const track = trackOf(exerciseIndex.value.get(item.exerciseId));
              const sets = prev?.entry.sets.filter((s: any) => s.done && s.type !== "warmup") || [];
              const top = track === "strength" ? sets.sort((a: any, b: any) => b.weight - a.weight || b.reps - a.reps)[0] : sets.sort((a: any, b: any) => (b.seconds || 0) - (a.seconds || 0))[0];
              return (
                <motion.span
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-[13px] ring-1 ring-white/15 backdrop-blur-md"
                  initial={{ opacity: 0, y: 6 }}
                  key={`${item.exerciseId}-${i}`}
                  transition={{ delay: 0.15 + i * 0.04 }}
                >
                  <span className="max-w-40 truncate font-medium">{exerciseName(item.exerciseId)}</span>
                  {top ? <span className="text-white/65 tabular">{format.shortSet(top, track)}</span> : null}
                </motion.span>
              );
            })}
            {items.length > 6 ? <span className="rounded-full px-2 py-1.5 text-[13px] text-white/70">+{items.length - 6} more</span> : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {day.rest ? (
            <>
              <Button className="bg-white text-zinc-950 shadow-none hover:bg-white" onClick={() => logRest(day)} size="lg">
                Done resting
              </Button>
              {after ? (
                <button className="h-11 text-[15px] font-semibold text-white/85 active:opacity-60 disabled:opacity-40" disabled={blocked} onClick={() => startWorkout(after)} type="button">
                  Train {after.name} instead
                </button>
              ) : null}
            </>
          ) : (
            <>
              <Button className="bg-white text-zinc-950 shadow-none hover:bg-white" disabled={blocked} onClick={() => startWorkout(day)} size="lg">
                <Play className="size-4 fill-current" /> Start {day.name}
              </Button>
              <button className="h-11 text-[15px] font-semibold text-white/85 active:opacity-60" onClick={onChoose} type="button">
                Choose another day
              </button>
            </>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function SetupSplit() {
  return (
    <Section footer="You can rename days and change every exercise later." title="Set up your split">
      <Card className="divide-y divide-border">
        {TEMPLATES.map((template: any) => (
          <Row
            chevron
            key={template.id}
            onClick={async () => {
              await applyTemplate(template);
              go("split");
            }}
            subtitle={template.blurb}
            title={template.name}
          />
        ))}
        <Row chevron onClick={() => go("split")} subtitle="Start from a blank split" title="Build my own" />
      </Card>
    </Section>
  );
}

function WeekRings() {
  const list = useValue(sessions) as any[];
  const days = useValue(splitDays) as any[];
  const s = useValue(settings) as any;
  const index = useValue(exerciseIndex) as Map<string, any>;
  const [a, b, c] = tintColors(s.tint);
  const week = useMemo(() => {
    const from = startOfWeek();
    const lastFrom = startOfWeek(from - 3 * 86_400_000);
    return { now: weekSummary(list, from, Infinity, index), last: weekSummary(list, lastFrom, from, index) };
  }, [list, index]);
  const goal = s.weeklyGoal || defaultWeeklyGoal(days);
  const kilo = (v: number) => Math.round(v / 1000);
  const activities = [
    { label: "Workouts", color: a, colorEnd: a, size: 148, current: week.now.count, target: goal, unit: "" },
    { label: "Sets", color: b, colorEnd: b, size: 118, current: week.now.sets, target: Math.max(week.last.sets, 30), unit: "" },
    { label: `Volume (k ${s.unit})`, color: c, colorEnd: c, size: 88, current: kilo(week.now.volume), target: Math.max(kilo(week.last.volume), 10), unit: "" },
    { label: "Cardio (min)", color: "#22c55e", colorEnd: "#4ade80", size: 58, current: Math.round(week.now.cardioMinutes), target: Math.max(Math.round(week.last.cardioMinutes), 60), unit: "" }
  ];
  return (
    <Section action={<span>vs. last week</span>} footer={`Workouts against your goal of ${goal} a week; sets, volume and cardio minutes against last week.`} title="This week">
      <Card>
        <AppleActivityCard activities={activities} key={`${s.tint}-${week.now.count}`} title="" />
      </Card>
    </Section>
  );
}

const LOW = 10;
const HIGH = 20;

function MuscleVolume() {
  const list = useValue(sessions) as any[];
  const index = useValue(exerciseIndex);
  const rows = useMemo(() => muscleSets(list, index, startOfWeek(), { indirect: true }), [list, index]) as { muscle: string; sets: number }[];
  const max = Math.max(HIGH + 4, ...rows.map((r) => r.sets));
  return (
    <Section footer={rows.length ? `Working sets since Monday; presses, rows and squats count half a set for the muscles they assist. The green band is ${LOW}–${HIGH} sets, the weekly range with the best evidence for growth.` : undefined} title="Sets per muscle">
      <Card className="flex flex-col gap-3.5 p-5">
        {rows.length ? (
          rows.map((row, i) => (
            <div className="grid grid-cols-[86px_1fr_28px] items-center gap-3 text-[14.5px]" key={row.muscle}>
              <span className="truncate">{format.capitalize(row.muscle)}</span>
              <span className="relative h-2.5 overflow-hidden rounded-full bg-muted">
                <span className="absolute inset-y-0 bg-success/25" style={{ left: `${(LOW / max) * 100}%`, width: `${((HIGH - LOW) / max) * 100}%` }} />
                <motion.span
                  animate={{ width: `${(row.sets / max) * 100}%` }}
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--tint-2)] to-[var(--tint)]"
                  initial={{ width: 0 }}
                  transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.1 + i * 0.05 }}
                />
              </span>
              <span className="text-right font-semibold tabular">{row.sets}</span>
            </div>
          ))
        ) : (
          <p className="text-[14.5px] text-muted-foreground">No sets yet this week.</p>
        )}
      </Card>
    </Section>
  );
}

function Consistency() {
  const list = useValue(sessions) as any[];
  const s = useValue(settings) as any;
  // From the 1st of the month three months back, so month labels never collide.
  const data = useMemo(() => {
    const volume = dailyVolume(list);
    const out: number[] = [];
    const today = new Date();
    const d = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    while (dateKey(d.getTime()) <= dateKey(today.getTime())) {
      out.push(volume.get(dateKey(d.getTime()))?.sets || 0);
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [list]);
  const streak = weekStreak(list);
  const dark = isDark(s.theme);
  const [accent] = tintColors(s.tint);
  const levels = ramp(dark ? "#111215" : "#ffffff", accent);
  const vars = {
    "--terrain-0": dark ? "#1b1d22" : "#eef0f3",
    "--terrain-1": levels[1],
    "--terrain-2": levels[2],
    "--terrain-3": levels[3],
    "--terrain-4": levels[4],
    "--terrain-accent": accent,
    "--terrain-text": dark ? "#8b909a" : "#6b7079"
  } as CSSProperties;
  return (
    <Section action={<span>{streak ? `${format.plural(streak, "week")} in a row` : "Last 4 months"}</span>} title="Consistency">
      <div style={vars}>
        <ActivityTerrain data={data} endDate={dateKey()} key={`${s.tint}-${dark}`} title="Training days" unit={["set", "sets"]} />
      </div>
    </Section>
  );
}

function BodyCard({ onLog }: { onLog: () => void }) {
  const entries = useValue(bodyweights) as any[];
  const s = useValue(settings) as any;
  const latest = entries[0];
  return (
    <Section action={<a className="text-primary" href="#/bodyweight">History</a>} title="Body">
      <Card className="flex items-center gap-4 p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Scale className="size-5" strokeWidth={2.2} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] text-muted-foreground">{latest ? format.relativeDay(new Date(`${latest.date}T12:00`).getTime()) : "Bodyweight"}</span>
          <span className="text-[22px] leading-tight font-semibold tracking-tight tabular">
            {latest ? format.weight(latest.weight) : "—"}
            <span className="ml-1 text-[13px] font-medium text-muted-foreground">{s.unit}</span>
          </span>
        </div>
        <Sparkline values={[...entries].reverse().slice(-14).map((e) => e.weight)} />
        <Button onClick={onLog} size="sm" variant="tinted">
          Log
        </Button>
      </Card>
    </Section>
  );
}

function RecentPRs() {
  const list = useValue(sessions) as any[];
  const s = useValue(settings) as any;
  const index = useValue(exerciseIndex) as Map<string, any>;
  const prs = useMemo(() => {
    const from = Date.now() - 14 * 86_400_000;
    const found = new Map<string, any>();
    for (const workout of list.filter((w) => w.startedAt >= from)) {
      for (const entry of workout.entries || []) {
        const prior = personalRecords(exerciseHistory(list, entry.exerciseId, { before: workout.startedAt }));
        for (const set of entry.sets || []) {
          const track = trackOf(index.get(entry.exerciseId));
          if (!isPersonalRecord(set, prior, track)) continue;
          const value = track === "strength" ? e1rm(set.weight, set.reps) : Number(set.seconds) || 0;
          const current = found.get(entry.exerciseId);
          if (!current || value > current.e1rm) found.set(entry.exerciseId, { exerciseId: entry.exerciseId, set, track, weight: set.weight, reps: set.reps, e1rm: value, date: workout.startedAt });
        }
      }
    }
    return [...found.values()].sort((a, b) => b.date - a.date).slice(0, 5);
  }, [list, index]);
  if (!prs.length) return null;
  return (
    <Section title="Recent PRs">
      <div className="flex flex-col gap-2">
        {prs.map((pr, i) => (
          <motion.button
            animate={{ opacity: 1, y: 0 }}
            className="surface relative flex items-center gap-3 overflow-hidden rounded-2xl p-3.5 text-left active:scale-[0.99]"
            initial={{ opacity: 0, y: 10 }}
            key={pr.exerciseId}
            onClick={() => go(`exercise/${pr.exerciseId}`)}
            transition={{ delay: 0.05 * i }}
            type="button"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-orange-500 text-white shadow-[0_8px_20px_-8px_#f59e0b]">
              <Trophy className="size-5" strokeWidth={2.2} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15.5px] font-semibold">{exerciseName(pr.exerciseId)}</span>
              <span className="text-[13px] text-muted-foreground tabular">
                {pr.track === "strength" ? `${format.weight(pr.weight)} ${s.unit} × ${pr.reps} · e1RM ${format.weight(Math.round(pr.e1rm))}` : format.describeSet(pr.set, pr.track, s.unit)}
              </span>
            </span>
            <span className="text-[13px] text-muted-foreground">{format.relativeDay(pr.date)}</span>
          </motion.button>
        ))}
      </div>
    </Section>
  );
}
