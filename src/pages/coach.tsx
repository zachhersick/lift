// Coach: everything the Coach has to say, grouped into training, nutrition,
// and recovery and cardio, with the weekly AI review, sets per muscle against
// the evidence-based range, and the research the rules are built on.
import { BookOpen, GraduationCap } from "lucide-react";
import { useMemo, useState } from "react";
import { InsightCard, MuscleBars, WeeklyReview } from "@/components/insights";
import { Card, Empty, FadeIn, Page, Section, Segmented, TopBar } from "@/components/kit";
import { MAIN_MUSCLES, muscleSets, splitWeeklySets } from "@/lib/model.js";
import { coach, exerciseIndex, sessions, splitDaysAll } from "@/lib/store.js";
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
  ["Pelland et al., 2024", "Sports Med (preprint)", "Counting indirect work as half a set fits the dose-response data best; returns diminish at high volumes."],
  ["Schoenfeld, Ogborn & Krieger, 2016; Schoenfeld et al., 2019", "Sports Med; J Sports Sci", "Training a muscle twice a week grows it at least as well as once."],
  ["Schoenfeld et al., 2016", "J Strength Cond Res", "3-minute rests produced more strength and size than 1-minute rests in trained men."],
  ["Singer et al., 2024", "Front Sports Act Living", "Rest longer than 60 seconds gives a small hypertrophy edge."],
  ["Schoenfeld et al., 2017", "J Strength Cond Res", "Light (up to ~30 reps) and heavy loads build similar muscle when sets go near failure; heavy loads build more strength."],
  ["Bell et al., 2023", "Sports Med Open", "Deloading: briefly cutting volume and effort to shed accumulated fatigue."],
  ["Morton et al., 2018", "Br J Sports Med", "Protein helps muscle gain up to about 1.6 g/kg a day, with 2.2 g/kg as the upper end."],
  ["Iraki et al., 2019; Helms et al., 2014", "Sports; JISSN", "Gain about 0.25–0.5% of bodyweight a week when bulking; lose about 0.5–1% when cutting."],
  ["Kerksick et al., 2017", "JISSN", "Carbohydrate and protein around training support performance and recovery."],
  ["Bull et al., 2020 (WHO guidelines)", "Br J Sports Med", "150–300 minutes of moderate aerobic activity a week, plus strength training."],
  ["Wilson et al., 2012", "J Strength Cond Res", "Cardio interferes with lifting gains mostly when it's long, frequent or running-heavy."],
  ["Kolber et al., 2009", "J Strength Cond Res", "Recreational lifters often show front-to-back shoulder strength imbalances."],
  ["FDA Daily Values", "21 CFR 101.9", "Reference amounts for each micronutrient on a 2,000 kcal diet."]
];

function SetsPerMuscle() {
  const list = useValue(sessions) as any[];
  const index = useValue(exerciseIndex) as Map<string, any>;
  const days = useValue(splitDaysAll) as any[];
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
      <TopBar backLabel="Today" backTo="today" subtitle="Science-based advice from your training, eating and bodyweight." title="Coach" />

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

      <Section footer="The Coach's rules follow these findings. Cards marked “your own logs” are patterns in your data, not proof of cause." title="The science">
        <Card className="divide-y divide-border">
          {SOURCES.map(([who, where, finding]) => (
            <div className="flex gap-3 px-4 py-3" key={who}>
              <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={2.2} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[14px] font-medium">
                  {who} <span className="font-normal text-muted-foreground">· {where}</span>
                </span>
                <span className="text-[13.5px] leading-snug text-muted-foreground">{finding}</span>
              </div>
            </div>
          ))}
        </Card>
      </Section>
    </Page>
  );
}
