// Coach: the split analyzer (score, suggested edits to your split's
// exercises with the research behind each, applied with a tap), then
// everything else the Coach has to say, grouped into training, nutrition,
// and recovery and cardio, with the weekly AI review, sets per muscle against
// the evidence-based range, and the research the rules are built on.
import { BookOpen, Check, GraduationCap, ListOrdered, ScanSearch, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { InsightCard, MuscleBars, WeeklyReview } from "@/components/insights";
import { Card, Empty, FadeIn, Page, Section, Segmented, softSpring, TopBar } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { analyzeSplit, applySplitEdit, MAIN_MUSCLES, muscleSets, splitWeeklySets } from "@/lib/model.js";
import { go } from "@/lib/router.js";
import { coach, exerciseIndex, records, sessions, splitDays, update } from "@/lib/store.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";

const AREAS = [
  { area: "training", title: "Training" },
  { area: "nutrition", title: "Nutrition" },
  { area: "recovery", title: "Recovery & cardio" }
];

// What each rule rests on. Shown so the advice can be checked.
const SOURCES = [
  ["Schoenfeld, Ogborn & Krieger, 2017", "J Sports Sci", "More weekly sets build more muscle; about 10+ sets per muscle a week beats fewer."],
  ["Baz-Valle et al., 2022", "J Hum Kinet", "Most of the hypertrophy benefit comes by about 12–20 sets per muscle a week."],
  ["Pelland et al., 2024", "Sports Med (preprint)", "Counting indirect work as half a set fits the dose-response data best; returns diminish at high volumes, and past about 10 sets for a muscle in one session."],
  ["Schoenfeld, Ogborn & Krieger, 2016; Schoenfeld et al., 2019", "Sports Med; J Sports Sci", "Training a muscle twice a week grows it at least as well as once."],
  ["Schoenfeld et al., 2016", "J Strength Cond Res", "3-minute rests produced more strength and size than 1-minute rests in trained men."],
  ["Singer et al., 2024", "Front Sports Act Living", "Rest longer than 60 seconds gives a small hypertrophy edge."],
  ["Schoenfeld et al., 2017", "J Strength Cond Res", "Light (up to ~30 reps) and heavy loads build similar muscle when sets go near failure; heavy loads build more strength."],
  ["Lopez et al., 2021", "Med Sci Sports Exerc", "Low, moderate and high loads build similar muscle when sets are taken close to failure."],
  ["Maeo et al., 2023", "Eur J Sport Sci", "Overhead triceps extensions grew the triceps about 40% more than pushdowns."],
  ["Maeo et al., 2021", "Med Sci Sports Exerc", "Seated leg curls, which stretch the hamstrings more, grew them more than lying curls."],
  ["Kinoshita et al., 2023", "Front Physiol", "Standing calf raises grew the gastrocnemius; seated raises barely did."],
  ["Kassiano et al., 2022", "J Strength Cond Res", "Varying exercises and loading can refresh progress without losing gains."],
  ["Bell et al., 2023", "Sports Med Open", "Deloading: briefly cutting volume and effort to shed accumulated fatigue."],
  ["Morton et al., 2018", "Br J Sports Med", "Protein helps muscle gain up to about 1.6 g/kg a day, with 2.2 g/kg as the upper end."],
  ["Iraki et al., 2019; Helms et al., 2014", "Sports; JISSN", "Gain about 0.25–0.5% of bodyweight a week when bulking; lose about 0.5–1% when cutting."],
  ["Kerksick et al., 2017", "JISSN", "Carbohydrate and protein around training support performance and recovery."],
  ["Bull et al., 2020 (WHO guidelines)", "Br J Sports Med", "150–300 minutes of moderate aerobic activity a week, plus strength training."],
  ["Wilson et al., 2012", "J Strength Cond Res", "Cardio interferes with lifting gains mostly when it's long, frequent or running-heavy."],
  ["Kolber et al., 2009", "J Strength Cond Res", "Recreational lifters often show front-to-back shoulder strength imbalances."],
  ["FDA Daily Values", "21 CFR 101.9", "Reference amounts for each micronutrient on a 2,000 kcal diet."]
];

// What each analyzer rule is about, by its priority.
const TOPIC: Record<number, string> = { 1: "Volume", 2: "Sets per session", 3: "Frequency", 4: "Push/pull balance", 5: "Volume", 6: "Exercise choice", 7: "Stalled lift", 8: "Rest", 9: "Rep range" };
const STAMP = "lift-split-analyzed";

const repsText = ([min, max]: (number | undefined)[]) => (min && max ? (min === max ? `${min}` : `${min}–${max}`) : "?");
function changeText(change: any) {
  if (change.field === "exercise") return `Swap for ${change.to}`;
  if (change.field === "sets") return `${change.from} → ${change.to} sets`;
  if (change.field === "reps") return `${repsText(change.from)} → ${repsText(change.to)} reps`;
  return `Rest ${change.from ? format.rest(change.from) : "default"} → ${format.rest(change.to)}`;
}
function readStamp() {
  try {
    return Number(localStorage.getItem(STAMP)) || null;
  } catch {
    return null;
  }
}

function Suggestion({ suggestion, onApply }: { suggestion: any; onApply: () => void }) {
  const { item } = suggestion;
  const detail = suggestion.kind === "add" ? [`New: ${item.targetSets} × ${repsText([item.repMin, item.repMax])}`, `rest ${format.rest(item.restSec)}`] : suggestion.changes.map(changeText);
  return (
    <motion.div className="flex gap-3 px-4 py-3" exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }} layout transition={softSpring}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[12px] font-medium text-muted-foreground">{TOPIC[suggestion.priority]}</span>
        <h4 className="text-[15px] leading-snug font-medium">{suggestion.kind === "add" ? `Add ${suggestion.name}` : suggestion.name}</h4>
        <div className="flex flex-wrap gap-1.5">
          {detail.map((text: string) => (
            <span className="sets rounded-[4px] bg-muted px-1.5 py-0.5 text-[13px]" key={text}>
              {text}
            </span>
          ))}
        </div>
        <p className="text-[13px] leading-snug text-muted-foreground">{suggestion.why}</p>
        <p className="flex items-start gap-1 text-[12px] text-muted-foreground/80">
          <BookOpen className="mt-[2px] size-3 shrink-0" strokeWidth={1.75} />
          {suggestion.source}
        </p>
      </div>
      <Button aria-label={`Apply: ${suggestion.kind === "add" ? `add ${suggestion.name}` : `${suggestion.name}, ${detail.join(", ")}`}`} className="shrink-0 self-start" onClick={onApply} size="sm" variant="tinted">
        Apply
      </Button>
    </motion.div>
  );
}

// The split analyzer: one button runs analyzeSplit over your split and logs,
// then lists the edits it found. Results stay live, so applying one (or a
// change made elsewhere) re-runs the analysis.
function SplitAnalysis() {
  const days = useValue(splitDays) as any[];
  const ordered = days;
  const index = useValue(exerciseIndex) as Map<string, any>;
  const logged = useValue(sessions) as any[];
  const [phase, setPhase] = useState<"idle" | "scanning" | "done">("idle");
  const [stamp, setStamp] = useState(readStamp);
  const [undo, setUndo] = useState<Map<string, any[]> | null>(null);
  const result = useMemo(() => analyzeSplit({ splitDays: days, exerciseIndex: index, workouts: logged }), [days, index, logged]);

  const analyze = () => {
    setPhase("scanning");
    setTimeout(() => {
      setPhase("done");
      const now = Date.now();
      setStamp(now);
      try {
        localStorage.setItem(STAMP, String(now));
      } catch {}
    }, 700);
  };
  // Remembers each day's exercises before its first change, for Undo.
  const remember = (dayIds: string[]) => {
    const saved = new Map(undo || []);
    for (const id of dayIds) if (!saved.has(id)) saved.set(id, structuredClone((records.value as Map<string, any>).get(id)?.exercises || []));
    setUndo(saved);
  };
  const apply = (suggestion: any) => {
    remember([suggestion.dayId]);
    update(suggestion.dayId, (day: any) => {
      const next = applySplitEdit(day.exercises || [], suggestion.edit);
      if (next) day.exercises = next;
    });
  };
  const applyAll = () => {
    remember(result.plan.map((day: any) => day.id));
    for (const day of result.plan) update(day.id, (d: any) => (d.exercises = day.exercises));
  };
  const revert = () => {
    for (const [id, exercises] of undo || []) update(id, (d: any) => (d.exercises = exercises));
    setUndo(null);
  };

  if (!result.ready) {
    return (
      <Section title="Split analysis">
        <Empty action={<Button onClick={() => go("split")} variant="tinted"><ListOrdered className="size-4" /> Open Split</Button>} icon={ScanSearch} title="No split to analyze">
          Add your training days and their exercises, and the Coach checks them against the research.
        </Empty>
      </Section>
    );
  }

  const byDay = ordered
    .map((day: any) => ({ day, list: result.suggestions.filter((s: any) => s.dayId === day.id) }))
    .filter((group: any) => group.list.length);

  return (
    <Section
      action={phase === "done" && result.suggestions.length ? <button className="font-medium text-primary" onClick={applyAll} type="button">Apply all</button> : null}
      footer={phase === "done" ? "Each change comes from a published finding (listed under The science). Applying edits your split; past workouts stay as logged." : undefined}
      title="Split analysis"
    >
      {phase !== "done" ? (
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-start gap-3">
            <ScanSearch className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <h3 className="text-[16px] font-medium">
                {format.plural(result.days, "day")} · {format.plural(result.exercises, "exercise")}
              </h3>
              <p className="text-[13px] leading-snug text-muted-foreground">Checks weekly sets, sets per session, frequency, push/pull balance, exercise choice, rest, rep ranges and stalled lifts against the research, then finds the smallest changes that fix them.</p>
            </div>
          </div>
          {phase === "scanning" ? (
            <span className="relative h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.span animate={{ width: "100%" }} className="absolute inset-y-0 left-0 rounded-full bg-primary" initial={{ width: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
            </span>
          ) : null}
          <Button disabled={phase === "scanning"} onClick={analyze}>
            <ScanSearch className="size-4" strokeWidth={1.75} /> {phase === "scanning" ? "Analyzing…" : "Analyze my split"}
          </Button>
          {stamp ? <p className="text-center text-[12px] text-muted-foreground">Last analyzed {format.ago(stamp).replace(/^[A-Z]/, (c) => c.toLowerCase())}</p> : null}
        </Card>
      ) : (
        <FadeIn className="flex flex-col gap-3">
          <Card className="flex flex-col gap-2.5 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-muted-foreground">Split score</span>
              <span className="text-[13px] text-muted-foreground">{result.suggestions.length ? `${format.plural(result.suggestions.length, "change")} suggested` : "Nothing to change"}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[34px] leading-none font-medium tabular">{result.score.before}</span>
              {result.score.after > result.score.before ? <span className="text-[17px] font-medium text-primary tabular">→ {result.score.after} after changes</span> : null}
            </div>
            <span className="relative h-2 overflow-hidden rounded-full bg-muted">
              <motion.span animate={{ width: `${result.score.after}%` }} className="absolute inset-y-0 left-0 rounded-full bg-primary/30" initial={{ width: 0 }} transition={softSpring} />
              <motion.span animate={{ width: `${result.score.before}%` }} className="absolute inset-y-0 left-0 rounded-full bg-primary" initial={{ width: 0 }} transition={softSpring} />
            </span>
            <p className="text-[12px] leading-snug text-muted-foreground">Out of 100: half for 10–20 weekly sets per muscle, then training each muscle about twice a week, pulling as much as pushing, and rest and rep ranges.</p>
          </Card>

          <AnimatePresence>
            {undo ? (
              <motion.div animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} initial={{ opacity: 0, y: -8 }} transition={softSpring}>
                <Card className="flex items-center gap-3 px-4 py-3">
                  <Check className="size-4 text-success" strokeWidth={1.75} />
                  <span className="flex-1 text-[14px]">Split updated</span>
                  <Button onClick={revert} size="sm" variant="ghost">
                    <Undo2 className="size-4" /> Undo
                  </Button>
                </Card>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {byDay.map(({ day, list }: any) => (
            <div className="flex flex-col gap-1.5" key={day.id}>
              <span className="px-1 text-[13px] font-medium text-muted-foreground">{day.name}</span>
              <Card className="divide-y divide-border overflow-hidden">
                <AnimatePresence initial={false}>
                  {list.map((suggestion: any) => (
                    <Suggestion key={suggestion.id} onApply={() => apply(suggestion)} suggestion={suggestion} />
                  ))}
                </AnimatePresence>
              </Card>
            </div>
          ))}
          {!result.suggestions.length ? (
            <Card className="flex items-center gap-3 p-4">
              <Check className="size-[18px] shrink-0 text-success" strokeWidth={1.75} />
              <p className="text-[14px] leading-snug">Your split is in line with the research. Keep pushing each set close to failure and adding weight or reps over time.</p>
            </Card>
          ) : null}

          <span className="px-1 pt-1 text-[13px] font-medium text-muted-foreground">Sets per muscle a week{result.suggestions.length ? ", now → after changes" : ""}</span>
          <MuscleBars rows={result.muscles.map((row: any) => ({ muscle: row.muscle, sets: row.before, after: result.suggestions.length ? row.after : undefined }))} />
          <Button onClick={() => setPhase("idle")} variant="tinted">
            <ScanSearch className="size-4" strokeWidth={1.75} /> Done
          </Button>
        </FadeIn>
      )}
    </Section>
  );
}

function SetsPerMuscle() {
  const list = useValue(sessions) as any[];
  const index = useValue(exerciseIndex) as Map<string, any>;
  const days = useValue(splitDays) as any[];
  const [range, setRange] = useState<"done" | "split">("done");
  const rows = useMemo(() => {
    const done = new Map(muscleSets(list, index, Date.now() - 14 * 86_400_000, { indirect: true }).map((row: any) => [row.muscle, row.sets / 2]));
    const source = range === "done" ? done : splitWeeklySets(days, index);
    const extra = [...source.keys()].filter((muscle) => !MAIN_MUSCLES.includes(muscle) && !["cardio", "full body", "other"].includes(muscle));
    return [...MAIN_MUSCLES, ...extra].map((muscle) => ({ muscle, sets: (source.get(muscle) as number) || 0 }));
  }, [list, index, days, range]);
  return (
    <Section
      action={<Segmented label="Sets source" onChange={setRange} options={[{ value: "done", label: "Last 2 weeks" }, { value: "split", label: "Your split" }]} size="sm" value={range} />}
      footer="Hard sets per muscle per week. Presses, rows, squats and hinges count half a set for the muscles they assist. The green band is 10–20 sets, where the research shows most of the growth; red bars are under it."
      title="Sets per muscle"
    >
      <MuscleBars rows={rows} />
    </Section>
  );
}

export function CoachPage() {
  const { headline, cards } = useValue(coach) as { headline: any; cards: any[] };
  return (
    <Page>
      <TopBar subtitle="Science-based advice from your training, eating and bodyweight." title="Coach" />

      <SplitAnalysis />

      {headline ? (
        <FadeIn>
          <InsightCard card={headline} />
        </FadeIn>
      ) : null}
      <WeeklyReview />

      {!cards.length ? (
        <Empty icon={GraduationCap} title="Nothing to flag yet">
          The Coach needs a couple of weeks of workouts, or a split to read, plus meals and weigh-ins for the nutrition side. Every card waits until there's enough data.
        </Empty>
      ) : null}

      {AREAS.map(({ area, title }) => {
        const list = cards.filter((card) => card.area === area);
        return list.length ? (
          <Section key={area} title={title}>
            {list.map((card) => (
              <InsightCard card={card} key={card.id} />
            ))}
          </Section>
        ) : null;
      })}

      <SetsPerMuscle />

      <Section footer="The Coach's rules follow these findings. Cards marked “your own logs” are patterns in your data, not proof of cause. The Coach is general fitness information, not medical advice: check with a doctor before big changes to training or diet." title="The science">
        <Card className="divide-y divide-border">
          {SOURCES.map(([who, where, finding]) => (
            <div className="flex gap-3 px-4 py-3" key={who}>
              <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[14px] font-medium">
                  {who} <span className="font-normal text-muted-foreground">· {where}</span>
                </span>
                <span className="text-[13px] leading-snug text-muted-foreground">{finding}</span>
              </div>
            </div>
          ))}
        </Card>
      </Section>
    </Page>
  );
}
