// Today: the next day in the rotation with its first lift loaded on the bar,
// this week's numbers, what you ate, the Coach, sets per muscle,
// consistency, bodyweight and recent PRs.
import { Cloud, Moon, Play, Scale, Trophy } from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";
import ActivityTerrain from "@/components/kokonutui/activity-terrain";
import { Sparkline } from "@/components/chart";
import { Card, FadeIn, Page, Row, Section, Sheet, StatTiles, TopBar, motion, softSpring, useWide } from "@/components/kit";
import { Barbell } from "@/components/plates";
import { Button } from "@/components/ui/button";
import { applyTemplate, logRest, startWorkout } from "@/lib/actions.js";
import { native } from "@/lib/api.js";
import { ramp } from "@/lib/color";
import { TEMPLATES } from "@/lib/exercises.js";
import {
  barFor, dailyVolume, dateKey, defaultWeeklyGoal, e1rm, exerciseHistory, isPersonalRecord, lastDoneAt, muscleSets, nextSplitDay,
  orderedDays, personalRecords, plateBreakdown, previousEntry, startOfWeek, trackOf, weekStreak, weekSummary
} from "@/lib/model.js";
import { go } from "@/lib/router.js";
import { activeWorkout, bodyweights, exerciseIndex, exerciseName, finishedWorkouts, sessions, settings, splitDays } from "@/lib/store.js";
import { sync } from "@/lib/sync.js";
import { isDark, tintColor } from "@/lib/theme.js";
import { now } from "@/lib/timer.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { cn } from "@/lib/utils";
import { BodyweightSheet } from "./bodyweight";
import { CoachStrip } from "@/components/insights";
import { FuelCard } from "./nutrition";

const LOADED = new Set(["barbell", "plate loaded"]);

export function Today() {
  const days = useValue(splitDays) as any[];
  const done = useValue(finishedWorkouts) as any[];
  const active = useValue(activeWorkout) as any;
  const syncState = useValue(sync) as any;
  const tick = useValue(now);
  const [choosing, setChoosing] = useState(false);
  const [weighing, setWeighing] = useState(false);
  const next = nextSplitDay(days, done);
  const wide = useWide();

  return (
    <Page wide>
      <TopBar eyebrow={format.date(Date.now(), { weekday: "long" })} title="Today">
        <h1 className="text-[34px] leading-[1.15] font-semibold tracking-[-0.01em]">{format.date(Date.now(), { month: "long", day: "numeric" })}</h1>
      </TopBar>

      {syncState.status === "signedOut" ? (
        <Card>
          <Row chevron href={native ? "#/settings" : "/api/auth/login"} icon={Cloud} subtitle="Sign in to sync your phone and computer" title="Back up your workouts" />
        </Card>
      ) : null}

      {wide ? (
        // Beside the sidebar: the next session and its context on the left,
        // the week's numbers on the right. The running workout lives in the
        // sidebar here.
        <FadeIn className="grid grid-cols-12 items-start gap-6">
          <div className="col-span-7 flex flex-col gap-6">
            {!days.length ? <SetupSplit /> : next ? <UpNext blocked={Boolean(active)} days={days} next={next} onChoose={() => setChoosing(true)} /> : null}
            <WeeklyVolume />
            <CoachStrip grid />
            <Consistency />
          </div>
          <div className="col-span-5 flex flex-col gap-6">
            <ThisWeek />
            {days.length ? <Rotation days={days} next={next} /> : null}
            <FuelCard />
            <BodyCard onLog={() => setWeighing(true)} />
            <MuscleVolume />
            <RecentPRs />
          </div>
        </FadeIn>
      ) : (
      <FadeIn className="flex flex-col gap-8">
        {active ? (
          <button className="surface flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors active:bg-accent" onClick={() => go(`workout/${active.id}`)} type="button">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] text-success">In progress</span>
              <span className="truncate text-[17px] font-medium">{active.name}</span>
            </span>
            <span className="sets text-[17px]">{format.clock((tick - active.startedAt) / 1000)}</span>
          </button>
        ) : null}

        {!days.length ? <SetupSplit /> : next ? <UpNext blocked={Boolean(active)} days={days} next={next} onChoose={() => setChoosing(true)} /> : null}

        <ThisWeek />
        <FuelCard />
        <CoachStrip />
        <MuscleVolume />
        <Consistency />
        <BodyCard onLog={() => setWeighing(true)} />
        <RecentPRs />
      </FadeIn>
      )}

      <Sheet onClose={() => setChoosing(false)} open={choosing} title="Choose a day">
        <Card className="divide-y divide-border">
          {orderedDays(days).map((day: any) => {
            const last = lastDoneAt(day.id, done);
            return (
              <Row
                icon={day.rest ? Moon : Play}
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

/** The heaviest finished working set from the last time this exercise was done. */
function topSet(list: any[], exerciseId: string, track: string) {
  const prev = previousEntry(list, exerciseId);
  const sets = prev?.entry.sets.filter((s: any) => s.done && s.type !== "warmup") || [];
  return track === "strength" ? sets.sort((a: any, b: any) => b.weight - a.weight || b.reps - a.reps)[0] : sets.sort((a: any, b: any) => (b.seconds || 0) - (a.seconds || 0))[0];
}

function UpNext({ next, days, onChoose, blocked }: { next: any; days: any[]; onChoose: () => void; blocked: boolean }) {
  const list = useValue(sessions) as any[];
  const s = useValue(settings) as any;
  const index = useValue(exerciseIndex) as Map<string, any>;
  const { day, index: position, count, lastDoneAt: last } = next;
  const ordered = orderedDays(days);
  const after = day.rest ? ordered.slice(position + 1).concat(ordered.slice(0, position)).find((item: any) => !item.rest) : null;
  const items = (day.exercises || []).map((item: any) => {
    const exercise = index.get(item.exerciseId);
    const track = trackOf(exercise);
    return { ...item, exercise, track, top: topSet(list, item.exerciseId, track) };
  });
  // The day's first barbell or plate-loaded lift, loaded as it was last time.
  const lead = items.find((item: any) => item.track === "strength" && LOADED.has(item.exercise?.equipment) && item.top?.weight > 0);
  const load = lead ? plateBreakdown(lead.top.weight, { bar: barFor(lead.exercise.equipment, s.barWeight), plates: s.plates }) : null;

  return (
    <section aria-label="Up next" className="surface flex flex-col gap-4 rounded-2xl p-5">
      <div className="flex items-baseline justify-between text-[13px] text-muted-foreground">
        <span>Up next</span>
        <span className="tabular">
          Day {position + 1} of {count}
        </span>
      </div>
      <div className="-mt-2">
        <h2 className="flex items-center gap-2 text-[28px] leading-tight font-semibold">
          {day.rest ? <Moon className="size-6 text-muted-foreground" strokeWidth={1.75} /> : null}
          {day.rest ? "Rest day" : day.name}
        </h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {day.rest ? (last ? `Last rest ${format.relativeDay(last).toLowerCase()}` : "No rest logged yet") : `${last ? `Last done ${format.relativeDay(last).toLowerCase()}` : "Not done yet"} · ${format.plural(items.length, "exercise")}`}
        </p>
      </div>

      {load && load.perSide.length ? (
        <figure className="-mx-1 flex flex-col gap-1 lg:max-w-[420px]">
          <Barbell perSide={load.perSide} plates={s.plates} />
          <figcaption className="flex items-baseline justify-between px-1 text-[13px] text-muted-foreground">
            <span className="truncate">{lead.exercise.name}, last top set</span>
            <span className="sets shrink-0 text-foreground">
              {format.shortSet(lead.top, "strength")} <span className="text-muted-foreground">{s.unit}</span>
            </span>
          </figcaption>
        </figure>
      ) : null}

      {!day.rest && items.length ? (
        <ul className="divide-y divide-border border-y border-border">
          {items.slice(0, 6).map((item: any, i: number) => (
            <li className="flex h-10 items-center justify-between gap-3 text-[15px]" key={`${item.exerciseId}-${i}`}>
              <span className="truncate">{exerciseName(item.exerciseId)}</span>
              {item.top ? <span className="sets shrink-0 text-[14px] text-muted-foreground">{format.shortSet(item.top, item.track)}</span> : null}
            </li>
          ))}
          {items.length > 6 ? <li className="flex h-10 items-center text-[14px] text-muted-foreground">{items.length - 6} more</li> : null}
        </ul>
      ) : null}

      <div className="flex flex-col gap-1">
        {day.rest ? (
          <>
            <Button onClick={() => logRest(day)} size="lg">
              Done resting
            </Button>
            {after ? (
              <button className="h-11 rounded-[10px] text-[15px] text-primary transition-opacity active:opacity-60 disabled:opacity-40" disabled={blocked} onClick={() => startWorkout(after)} type="button">
                Train {after.name} instead
              </button>
            ) : null}
          </>
        ) : (
          <>
            <Button disabled={blocked} onClick={() => startWorkout(day)} size="lg">
              <Play className="size-4 fill-current" strokeWidth={1.75} /> Start {day.name}
            </Button>
            <button className="h-11 rounded-[10px] text-[15px] text-primary transition-opacity active:opacity-60" onClick={onChoose} type="button">
              Choose another day
            </button>
          </>
        )}
      </div>
    </section>
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

function ThisWeek() {
  const list = useValue(sessions) as any[];
  const days = useValue(splitDays) as any[];
  const s = useValue(settings) as any;
  const index = useValue(exerciseIndex) as Map<string, any>;
  const week = useMemo(() => {
    const from = startOfWeek();
    const lastFrom = startOfWeek(from - 3 * 86_400_000);
    return { now: weekSummary(list, from, Infinity, index), last: weekSummary(list, lastFrom, from, index) };
  }, [list, index]);
  const goal = s.weeklyGoal || defaultWeeklyGoal(days);
  const kilo = (v: number) => format.weight(Math.round(v / 100) / 10);
  return (
    <Section title="This week">
      <StatTiles
        items={[
          { label: "Workouts", value: week.now.count, unit: `of ${goal}`, sub: `${week.last.count} last week` },
          { label: "Sets", value: week.now.sets, sub: `${week.last.sets} last week` },
          { label: "Volume", value: kilo(week.now.volume), unit: `k ${s.unit}`, sub: `${kilo(week.last.volume)}k last week` },
          { label: "Cardio", value: Math.round(week.now.cardioMinutes), unit: "min", sub: `${Math.round(week.last.cardioMinutes)} last week` }
        ]}
      />
    </Section>
  );
}

// Wide screens: training volume for the last eight weeks, this week in the
// accent and the rest in a neutral step.
function WeeklyVolume() {
  const list = useValue(sessions) as any[];
  const s = useValue(settings) as any;
  const index = useValue(exerciseIndex) as Map<string, any>;
  const weeks = useMemo(() => {
    const out = [];
    let from = startOfWeek();
    for (let i = 0; i < 8; i += 1) {
      const to: number = i === 0 ? Infinity : out[out.length - 1].from;
      out.push({ from, to, ...weekSummary(list, from, to, index) });
      from = startOfWeek(from - 3 * 86_400_000);
    }
    return out.reverse();
  }, [list, index]);
  const top = Math.max(1, ...weeks.map((w) => w.volume));
  const current = weeks[weeks.length - 1];
  const previous = weeks[weeks.length - 2];
  const average = weeks.slice(0, -1).reduce((sum, w) => sum + w.volume, 0) / Math.max(1, weeks.length - 1);
  return (
    <Section action={<span>Last 8 weeks</span>} title="Weekly volume">
      <Card className="flex flex-col gap-5 p-5">
        <div className="flex items-end justify-between gap-6">
          <div className="flex flex-col">
            <span className="text-[13px] text-muted-foreground">This week so far</span>
            <span className="text-[34px] leading-[1.15] font-medium tabular">
              {format.volume(current.volume, "").trim()}
              <span className="ml-1 text-[15px] font-normal text-muted-foreground">{s.unit}</span>
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 text-right text-[13px]">
            <dt className="text-muted-foreground">Last week</dt>
            <dt className="text-muted-foreground">8-week average</dt>
            <dd className="sets text-[15px]">{format.volume(previous.volume, s.unit)}</dd>
            <dd className="sets text-[15px]">{format.volume(average, s.unit)}</dd>
          </dl>
        </div>
        <div aria-label={`Weekly volume, ${weeks.map((w) => format.volume(w.volume, s.unit)).join(", ")}`} className="grid h-40 grid-cols-8 items-end gap-3" role="img">
          {weeks.map((w, i) => (
            <div className="flex h-full flex-col justify-end gap-2" key={w.from}>
              <span className="relative flex flex-1 items-end">
                <span className="absolute inset-x-0 top-[calc(100%-var(--avg))] border-t border-dashed border-border" style={{ "--avg": `${(average / top) * 100}%` } as CSSProperties} />
                <motion.span
                  animate={{ scaleY: 1 }}
                  className={cn("w-full origin-bottom rounded-t-md", i === weeks.length - 1 ? "bg-primary" : "bg-foreground/15")}
                  initial={{ scaleY: 0 }}
                  style={{ height: `${Math.max(2, (w.volume / top) * 100)}%` }}
                  transition={{ ...softSpring, delay: Math.min(i, 5) * 0.04 }}
                />
              </span>
              <span className="sets text-center text-[11px] whitespace-nowrap text-muted-foreground">{format.date(w.from, { month: "numeric", day: "numeric" })}</span>
            </div>
          ))}
        </div>
      </Card>
    </Section>
  );
}

// Wide screens: the whole rotation, with the next day marked.
function Rotation({ days, next }: { days: any[]; next: any }) {
  const done = useValue(finishedWorkouts) as any[];
  return (
    <Section action={<a className="text-primary" href="#/split">Edit</a>} title="Rotation">
      <Card className="divide-y divide-border">
        {orderedDays(days).map((day: any, i: number) => {
          const last = lastDoneAt(day.id, done);
          const isNext = next?.day.id === day.id;
          return (
            <a className="flex h-12 items-center gap-3 px-4 transition-colors hover:bg-accent/60" href={`#/split/${day.id}`} key={day.id}>
              <span className={cn("sets w-5 text-[13px]", isNext ? "text-primary" : "text-muted-foreground")}>{i + 1}</span>
              <span className={cn("flex-1 truncate text-[15px]", isNext && "font-medium")}>{day.name}{day.rest && !/rest/i.test(day.name) ? <span className="text-muted-foreground"> · rest</span> : null}</span>
              {isNext ? <span className="text-[13px] text-primary">Next</span> : <span className="text-[13px] text-muted-foreground">{last ? format.relativeDay(last) : "Not yet"}</span>}
            </a>
          );
        })}
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
    <Section footer={rows.length ? `Working sets since Monday; presses, rows and squats count half a set for the muscles they assist. The shaded band is ${LOW}–${HIGH} sets, the weekly range with the best evidence for growth.` : undefined} title="Sets per muscle">
      <Card className="flex flex-col gap-3 p-5">
        {rows.length ? (
          rows.map((row) => (
            <div className="grid grid-cols-[88px_1fr_32px] items-center gap-3 text-[14px]" key={row.muscle}>
              <span className="truncate">{format.capitalize(row.muscle)}</span>
              <span className="relative h-2 overflow-hidden rounded-full bg-muted">
                <span className="absolute inset-y-0 bg-success/20" style={{ left: `${(LOW / max) * 100}%`, width: `${((HIGH - LOW) / max) * 100}%` }} />
                <motion.span animate={{ scaleX: row.sets / max }} className="absolute inset-0 origin-left rounded-full bg-primary" initial={{ scaleX: 0 }} transition={softSpring} />
              </span>
              <span className="text-right tabular">{row.sets}</span>
            </div>
          ))
        ) : (
          <p className="text-[14px] text-muted-foreground">No sets yet this week</p>
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
  const accent = tintColor(s.tint, dark);
  const levels = ramp(dark ? "#19191b" : "#ffffff", accent);
  const vars = {
    "--terrain-0": dark ? "#232325" : "#f4f4f5",
    "--terrain-1": levels[1],
    "--terrain-2": levels[2],
    "--terrain-3": levels[3],
    "--terrain-4": levels[4],
    "--terrain-accent": accent,
    "--terrain-text": dark ? "#8e8e94" : "#6b6b70"
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
      <Card className="flex items-center gap-3 p-4">
        <Scale className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] text-muted-foreground">{latest ? format.relativeDay(new Date(`${latest.date}T12:00`).getTime()) : "Bodyweight"}</span>
          <span className="text-[24px] leading-tight font-medium tabular">
            {latest ? format.weight(latest.weight) : "—"}
            <span className="ml-1 text-[13px] font-normal text-muted-foreground">{s.unit}</span>
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
      <Card className="divide-y divide-border">
        {prs.map((pr) => (
          <button className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors active:bg-accent" key={pr.exerciseId} onClick={() => go(`exercise/${pr.exerciseId}`)} type="button">
            <Trophy className="size-[18px] shrink-0 text-pr" strokeWidth={1.75} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px]">{exerciseName(pr.exerciseId)}</span>
              <span className="sets text-[13px] text-muted-foreground">
                {pr.track === "strength" ? `${format.weight(pr.weight)} × ${pr.reps} · e1RM ${format.weight(Math.round(pr.e1rm))} ${s.unit}` : format.describeSet(pr.set, pr.track, s.unit)}
              </span>
            </span>
            <span className="text-[13px] text-muted-foreground">{format.relativeDay(pr.date)}</span>
          </button>
        ))}
      </Card>
    </Section>
  );
}
