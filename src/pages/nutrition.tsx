// Fuel: what you ate (logged from ChatGPT or by hand) against targets from
// your goal, the maintenance Lift works out from your log and weigh-ins,
// and the last two weeks of calories.
import { ChevronLeft, ChevronRight, Plus, Sparkles, Utensils } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { MealSheet } from "@/components/meal-sheet";
import { Card, Empty, FadeIn, Page, Row, Section, StatTiles, TopBar } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { dailyIntake, dateKey, dayTotals, fromDateKey, RATE_BANDS, rateStatus, shiftDateKey, weightRate } from "@/lib/model.js";
import { bodyweights, maintenance, meals, settings, targets } from "@/lib/store.js";
import { syncNow } from "@/lib/sync.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { cn } from "@/lib/utils";

export const GOAL_LABEL: Record<string, string> = { cut: "Cut", maintain: "Maintain", leanBulk: "Lean bulk" };
const kcal = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString());

function Ring({ value, target, size = 120, stroke = 12 }: { value: number; target: number | null; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const fraction = target ? value / target : 0;
  const over = fraction > 1;
  return (
    <svg aria-hidden="true" className="-rotate-90" height={size} width={size}>
      <circle cx={size / 2} cy={size / 2} fill="none" r={r} stroke="currentColor" strokeOpacity="0.1" strokeWidth={stroke} />
      <motion.circle
        animate={{ pathLength: Math.min(1, fraction) }}
        cx={size / 2}
        cy={size / 2}
        fill="none"
        initial={{ pathLength: 0 }}
        r={r}
        stroke={over ? "var(--pr)" : "var(--tint)"}
        strokeLinecap="round"
        strokeWidth={stroke}
        transition={{ type: "spring", stiffness: 70, damping: 18 }}
      />
    </svg>
  );
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number | null; color: string }) {
  const fraction = target ? Math.min(1, value / target) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular">
          {Math.round(value)}
          {target ? ` / ${target}` : ""} g
        </span>
      </div>
      <span className="relative h-2 overflow-hidden rounded-full bg-muted">
        <motion.span animate={{ width: `${fraction * 100}%` }} className="absolute inset-y-0 left-0 rounded-full" initial={{ width: 0 }} style={{ background: color }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
      </span>
    </div>
  );
}

// The ring and macro bars for one day.
function DaySummary({ totals, compact = false }: { totals: any; compact?: boolean }) {
  const t = useValue(targets) as any;
  const left = t.calories ? t.calories - totals.calories : null;
  return (
    <div className={cn("flex items-center gap-5", compact ? "p-4" : "p-5")}>
      <div className="relative grid shrink-0 place-items-center">
        <Ring size={compact ? 104 : 124} target={t.calories} value={totals.calories} />
        <div className="absolute flex flex-col items-center leading-tight">
          <span className={cn("font-semibold tracking-tight tabular", compact ? "text-[22px]" : "text-[26px]")}>{kcal(totals.calories)}</span>
          <span className="text-[11.5px] text-muted-foreground">{t.calories ? `of ${kcal(t.calories)}` : "kcal"}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {left !== null ? (
          <span className={cn("text-[13px] font-medium", left < 0 ? "text-pr" : "text-muted-foreground")}>{left >= 0 ? `${kcal(left)} kcal left` : `${kcal(-left)} kcal over`}</span>
        ) : null}
        <MacroBar color="var(--tint)" label="Protein" target={t.protein} value={totals.protein} />
        <MacroBar color="var(--tint-2)" label="Carbs" target={t.carbs} value={totals.carbs} />
        <MacroBar color="var(--tint-3)" label="Fat" target={t.fat} value={totals.fat} />
      </div>
    </div>
  );
}

const fromChatGPT = (list: any[]) => list.find((m) => m.source === "chatgpt");

// On Today: today's ring and macros, tap for the Fuel page.
export function FuelCard() {
  const list = useValue(meals) as any[];
  const today = dateKey();
  const todays = list.filter((m) => m.date === today);
  const totals = dayTotals(todays);
  const last = todays[0];
  const chat = fromChatGPT(list);
  return (
    <Section action={<a className="text-primary" href="#/nutrition">Details</a>} title="Fuel">
      <a className="surface block overflow-hidden rounded-3xl active:scale-[0.99]" href="#/nutrition">
        <DaySummary compact totals={totals} />
        <div className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-[13px] text-muted-foreground">
          {chat ? <Sparkles className="size-3.5 text-primary" strokeWidth={2.4} /> : <Utensils className="size-3.5" strokeWidth={2.4} />}
          <span className="truncate">
            {last ? `${format.plural(todays.length, "meal")} today · last ${format.time(last.eatenAt || last.updatedAt)}` : list.length ? "Nothing logged yet today" : "Log meals from ChatGPT or add them here"}
          </span>
        </div>
      </a>
    </Section>
  );
}

// Calories for the 14 days ending on `end`. Unlogged days are hollow, not zero.
function CalorieBars({ end, selected, onSelect }: { end: string; selected: string; onSelect: (date: string) => void }) {
  const list = useValue(meals) as any[];
  const t = useValue(targets) as any;
  const intake = useMemo(() => dailyIntake(list), [list]);
  const days = Array.from({ length: 14 }, (_, i) => shiftDateKey(end, i - 13));
  const values = days.map((d) => intake.get(d)?.calories ?? null);
  const top = Math.max(t.calories ? t.calories * 1.25 : 0, ...values.map((v) => v || 0), 1);
  return (
    <div className="px-4 pt-5 pb-3">
      <div className="relative">
        {t.calories ? (
          <div className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-muted-foreground/50" style={{ bottom: `${(t.calories / top) * 100}%` }}>
            <span className="absolute -top-4 right-0 text-[10.5px] text-muted-foreground tabular">{kcal(t.calories)}</span>
          </div>
        ) : null}
        <div className="grid h-32 grid-cols-14 items-end gap-1.5">
          {days.map((d, i) => {
            const v = values[i];
            const on = d === selected;
            return (
              <button aria-label={`${format.date(fromDateKey(d))}: ${v == null ? "not logged" : `${kcal(v)} kcal`}`} className="flex h-full items-end" key={d} onClick={() => onSelect(d)} type="button">
                {v == null ? (
                  <span className={cn("block h-2 w-full rounded-full border border-dashed border-muted-foreground/40", on && "border-primary")} />
                ) : (
                  <motion.span
                    animate={{ height: `${Math.max(4, (v / top) * 100)}%` }}
                    className={cn("block w-full rounded-md", on ? "bg-primary" : t.calories && v > t.calories * 1.1 ? "bg-pr/60" : "bg-primary/35")}
                    initial={{ height: 0 }}
                    transition={{ type: "spring", stiffness: 140, damping: 20, delay: i * 0.02 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-14 gap-1.5 text-center text-[10.5px] text-muted-foreground">
        {days.map((d) => (
          <span className={d === selected ? "font-semibold text-foreground" : undefined} key={d}>
            {format.date(fromDateKey(d), { weekday: "narrow" })}
          </span>
        ))}
      </div>
    </div>
  );
}

const CONFIDENCE: Record<string, string> = { high: "Solid estimate", medium: "Getting there", rough: "Rough guess", none: "" };

function MaintenanceCard() {
  const m = useValue(maintenance) as any;
  const t = useValue(targets) as any;
  const s = useValue(settings) as any;
  const weights = useValue(bodyweights) as any[];
  const rate = weightRate(weights);
  const status = rateStatus(rate, t.goal);
  const [low, high] = RATE_BANDS[t.goal as keyof typeof RATE_BANDS];
  const pct = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 100) / 100}%`;
  if (!m.calories) {
    return (
      <Card className="p-4 text-[14.5px] text-muted-foreground">Log your bodyweight to get a maintenance estimate. After 10 days of meals and weigh-ins Lift works out what you actually burn.</Card>
    );
  }
  return (
    <Card className="divide-y divide-border">
      <div className="flex flex-col gap-1 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-muted-foreground">Maintenance</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", m.confidence === "high" ? "bg-success/15 text-success" : m.confidence === "medium" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
            {CONFIDENCE[m.confidence]}
          </span>
        </div>
        <span className="text-[30px] leading-tight font-semibold tracking-tight tabular">
          {kcal(m.calories)}
          <span className="ml-1 text-[14px] font-medium text-muted-foreground">kcal/day</span>
        </span>
        <span className="text-[13px] leading-snug text-muted-foreground">
          {m.method === "adaptive"
            ? `From ${m.loggedDays} logged days averaging ${kcal(m.avgIntake)} kcal while your weight moved ${m.weightPerWeek >= 0 ? "+" : ""}${format.weight(Math.round(m.weightPerWeek * 100) / 100)} ${s.unit}/week.`
            : `Based on bodyweight alone. ${m.loggedDays < 10 ? `${10 - m.loggedDays} more logged days` : "A longer run of weigh-ins"} and Lift will measure it from your log instead.`}
        </span>
      </div>
      <Row title={`${GOAL_LABEL[t.goal]} target`} value={`${kcal(t.calories)} kcal · ${t.protein ?? "—"} g protein`} />
      {rate ? (
        <Row
          subtitle={`Goal range ${pct(low)} to ${pct(high)} a week`}
          title={`${rate.perWeek >= 0 ? "Gaining" : "Losing"} ${format.weight(Math.abs(Math.round(rate.perWeek * 100) / 100))} ${s.unit}/week`}
          value={<span className={status === "in" ? "text-success" : "text-pr"}>{status === "in" ? "On track" : status === "below" ? "Too slow" : "Too fast"}</span>}
        />
      ) : null}
    </Card>
  );
}

export function NutritionPage() {
  const list = useValue(meals) as any[];
  const t = useValue(targets) as any;
  const [day, setDay] = useState(dateKey());
  const [sheet, setSheet] = useState<any>(null);
  // Meals from ChatGPT arrive through sync, so check for new ones on open.
  useEffect(() => {
    syncNow();
  }, []);

  const today = dateKey();
  const todays = list.filter((m) => m.date === day);
  const totals = dayTotals(todays);
  const intake = useMemo(() => dailyIntake(list), [list]);
  const week = Array.from({ length: 7 }, (_, i) => intake.get(shiftDateKey(today, -i - 1))).filter(Boolean) as any[];
  const avg = week.length ? week.reduce((sum, d) => sum + d.calories, 0) / week.length : null;
  const proteinDays = t.protein ? week.filter((d) => d.protein >= t.protein * 0.9).length : null;
  const label = day === today ? "Today" : day === shiftDateKey(today, -1) ? "Yesterday" : format.date(fromDateKey(day), { weekday: "long", month: "short", day: "numeric" });

  return (
    <Page>
      <TopBar
        backLabel="Today"
        backTo="today"
        title="Fuel"
        trailing={
          <button aria-label="Add meal" className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground" onClick={() => setSheet("new")} type="button">
            <Plus className="size-5" strokeWidth={2.6} />
          </button>
        }
      />

      {!list.length ? (
        <Empty action={<Button onClick={() => setSheet("new")} variant="tinted">Add a meal</Button>} icon={Utensils} title="No meals yet">
          Connect ChatGPT in Settings and every meal you confirm in your Health chat lands here. You can also add meals by hand.
        </Empty>
      ) : null}

      <FadeIn className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <button aria-label="Previous day" className="grid size-9 place-items-center rounded-full bg-muted active:bg-accent" onClick={() => setDay(shiftDateKey(day, -1))} type="button">
            <ChevronLeft className="size-5" strokeWidth={2.4} />
          </button>
          <span className="text-[16px] font-semibold">{label}</span>
          <button aria-label="Next day" className="grid size-9 place-items-center rounded-full bg-muted active:bg-accent disabled:opacity-30" disabled={day >= today} onClick={() => setDay(shiftDateKey(day, 1))} type="button">
            <ChevronRight className="size-5" strokeWidth={2.4} />
          </button>
        </div>
        <Card>
          <DaySummary totals={totals} />
        </Card>
      </FadeIn>

      <Section title="Meals">
        {todays.length ? (
          <Card className="divide-y divide-border">
            {[...todays].sort((a, b) => (a.eatenAt || 0) - (b.eatenAt || 0)).map((m) => (
              <Row
                chevron
                icon={m.source === "chatgpt" ? Sparkles : Utensils}
                key={m.id}
                onClick={() => setSheet(m)}
                subtitle={`${m.eatenAt ? `${format.time(m.eatenAt)} · ` : ""}P ${Math.round(m.protein || 0)} · C ${Math.round(m.carbs || 0)} · F ${Math.round(m.fat || 0)}`}
                title={m.name}
                value={`${kcal(m.calories)}`}
              />
            ))}
          </Card>
        ) : (
          <Card>
            <Row icon={Plus} onClick={() => setSheet("new")} title={`Add a meal for ${label.toLowerCase() === "today" ? "today" : label}`} tone="action" />
          </Card>
        )}
      </Section>

      <Section action={<span>tap a day</span>} footer="Dashed days weren't logged, so they're left out of averages instead of counting as zero." title="Last 2 weeks">
        <Card>
          <CalorieBars end={today} onSelect={setDay} selected={day} />
        </Card>
        <StatTiles
          items={[
            { label: "7-day avg", value: kcal(avg), unit: avg == null ? undefined : "kcal" },
            { label: "Protein hit", value: proteinDays == null || !week.length ? "—" : `${proteinDays}/${week.length}`, sub: "logged days" },
            { label: "Logged", value: `${week.length}/7`, sub: "last 7 days" }
          ]}
        />
      </Section>

      <Section footer="Maintenance is average intake minus the energy that went into or came out of your bodyweight. It sharpens as you log." title="Energy balance">
        <MaintenanceCard />
      </Section>

      <MealSheet date={day} meal={sheet && sheet !== "new" ? sheet : null} onClose={() => setSheet(null)} open={sheet !== null} />
    </Page>
  );
}
