// Fuel: what you ate (logged from an assistant or by hand) against targets from
// your goal, micronutrients against their Daily Values, the maintenance Lift
// works out from your log and weigh-ins, the last two weeks of calories and
// the Coach.
import { Check, ChevronLeft, ChevronRight, Copy, MessageSquareText, Plus, Utensils } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { CoachSection } from "@/components/insights";
import { MealSheet } from "@/components/meal-sheet";
import { Card, Empty, FadeIn, Page, Row, Section, Segmented, StatTiles, TopBar, useWide } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { dailyIntake, dateKey, dayTotals, fromAssistant, fromDateKey, MICROS, microAverages, RATE_BANDS, rateStatus, shiftDateKey, weightRate } from "@/lib/model.js";
import { apiOrigin } from "@/lib/api.js";
import { notify } from "@/lib/notify";
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
        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
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
        <motion.span animate={{ width: `${fraction * 100}%` }} className="absolute inset-y-0 left-0 rounded-full" initial={{ width: 0 }} style={{ background: color }} transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }} />
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
          <span className={cn("font-medium tabular", compact ? "text-[22px]" : "text-[26px]")}>{kcal(totals.calories)}</span>
          <span className="text-[12px] text-muted-foreground">{t.calories ? `of ${kcal(t.calories)}` : "kcal"}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {left !== null ? (
          <span className={cn("text-[13px] font-medium", left < 0 ? "text-pr" : "text-muted-foreground")}>{left >= 0 ? `${kcal(left)} kcal left` : `${kcal(-left)} kcal over`}</span>
        ) : null}
        <MacroBar color="var(--tint)" label="Protein" target={t.protein} value={totals.protein} />
        <MacroBar color="var(--carbs)" label="Carbs" target={t.carbs} value={totals.carbs} />
        <MacroBar color="var(--fat)" label="Fat" target={t.fat} value={totals.fat} />
      </div>
    </div>
  );
}


// On Today: today's ring and macros, tap for the Fuel page.
export function FuelCard() {
  const list = useValue(meals) as any[];
  const today = dateKey();
  const todays = list.filter((m) => m.date === today);
  const totals = dayTotals(todays);
  const last = todays[0];
  const chat = list.find(fromAssistant);
  return (
    <Section action={<a className="text-primary" href="#/nutrition">Details</a>} title="Fuel">
      <a className="surface block overflow-hidden rounded-2xl" href="#/nutrition">
        <DaySummary compact totals={totals} />
        <div className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-[13px] text-muted-foreground">
          {chat ? <MessageSquareText className="size-3.5" strokeWidth={1.75} /> : <Utensils className="size-3.5" strokeWidth={1.75} />}
          <span className="truncate">
            {last ? `${format.plural(todays.length, "meal")} today · last ${format.time(last.eatenAt || last.updatedAt)}` : list.length ? "Nothing logged yet today" : "Log meals from Claude or ChatGPT, or add them here"}
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
            <span className="absolute -top-4 right-0 text-[11px] text-muted-foreground tabular">{kcal(t.calories)}</span>
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
                    transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: i * 0.02 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-14 gap-1.5 text-center text-[11px] text-muted-foreground">
        {days.map((d) => (
          <span className={d === selected ? "font-medium text-foreground" : undefined} key={d}>
            {format.date(fromDateKey(d), { weekday: "narrow" })}
          </span>
        ))}
      </div>
    </div>
  );
}

const microAmount = (n: number) => (n < 10 ? String(Math.round(n * 10) / 10) : Math.round(n).toLocaleString());

// Micronutrients for one day, or averaged over the last 7 days, against
// their Daily Values. Only what some meal reported is shown.
function Micronutrients({ day }: { day: string }) {
  const list = useValue(meals) as any[];
  const [range, setRange] = useState<"day" | "week">("day");
  const intake = useMemo(() => dailyIntake(list), [list]);
  const totals = intake.get(day);
  const rows =
    range === "day"
      ? MICROS.filter((m: any) => totals?.microMeals?.[m.key]).map((m: any) => ({
          ...m,
          value: totals.micros[m.key],
          note: totals.microMeals[m.key] < totals.meals ? `${totals.microMeals[m.key]} of ${totals.meals} meals` : ""
        }))
      : microAverages(Array.from({ length: 7 }, (_, i) => intake.get(shiftDateKey(dateKey(), -i - 1))).filter(Boolean))
          .filter((m: any) => m.days)
          .map((m: any) => ({ ...m, value: m.avg, note: `avg of ${format.plural(m.days, "day")}` }));
  return (
    <Section
      action={<Segmented label="Micronutrient range" onChange={setRange} options={[{ value: "day", label: "Day" }, { value: "week", label: "7-day avg" }]} size="sm" value={range} />}
      footer={rows.length ? "Percent of the FDA Daily Value. Sodium, saturated fat and cholesterol are limits to stay under. A nutrient a meal didn't estimate counts as unknown, not zero." : undefined}
      title="Micros"
    >
      {rows.length ? (
        <Card className="flex flex-col gap-3 p-4">
          {rows.map((m: any) => {
            const pct = m.dv ? (m.value / m.dv) * 100 : null;
            const over = m.kind === "limit" && pct !== null && pct > 100;
            return (
              <div className="flex flex-col gap-1" key={m.key}>
                <div className="flex items-baseline justify-between gap-2 text-[14px]">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{m.label}</span>
                    {m.note ? <span className="ml-1.5 text-[12px] text-muted-foreground">{m.note}</span> : null}
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular">
                    {microAmount(m.value)} {m.unit}
                    {pct !== null ? <span className={cn("ml-2 font-medium", over ? "text-pr" : "text-foreground")}>{Math.round(pct)}%</span> : null}
                  </span>
                </div>
                {pct !== null ? (
                  <span className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                    <motion.span
                      animate={{ width: `${Math.min(100, pct)}%` }}
                      className={cn("absolute inset-y-0 left-0 rounded-full", over ? "bg-pr" : m.kind === "limit" ? "bg-muted-foreground/50" : "bg-primary")}
                      initial={{ width: 0 }}
                      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                ) : null}
              </div>
            );
          })}
        </Card>
      ) : (
        <Card className="p-4 text-[14px] text-muted-foreground">
          {range === "day" ? "No micronutrients logged for this day." : "No micronutrients logged this week."} Ask your assistant to include sodium, potassium, fiber, vitamins and minerals when it logs a meal, or add them in a meal under Micronutrients.
        </Card>
      )}
    </Section>
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
      <Card className="p-4 text-[14px] text-muted-foreground">Log your bodyweight to get a maintenance estimate. After 10 days of meals and weigh-ins Lift works out what you actually burn.</Card>
    );
  }
  return (
    <Card className="divide-y divide-border">
      <div className="flex flex-col gap-1 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-muted-foreground">Maintenance</span>
          <span className={cn("text-[12px]", m.confidence === "high" ? "text-success" : "text-muted-foreground")}>
            {CONFIDENCE[m.confidence]}
          </span>
        </div>
        <span className="text-[30px] leading-tight font-medium tabular">
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

const ASSISTANT: Record<string, string> = { claude: "Claude", chatgpt: "ChatGPT" };
const STEPS: Record<string, string[]> = {
  claude: ["In Claude, open Customize → Connectors", "Add a custom connector and paste the URL", "Approve Lift, then ask Claude to log what you ate"],
  chatgpt: ["In ChatGPT, open Settings → Apps & Connectors → Advanced and turn on Developer mode", "Create a connector with OAuth and paste the URL", "Approve Lift, then ask ChatGPT to log what you ate"]
};

// Connect Claude or ChatGPT: the connector URL, the steps for each app and
// whether a meal has come in from one yet. Setup only; the connector's
// sign-in and permissions live on the server.
export function ConnectPanel() {
  const list = useValue(meals) as any[];
  const [app, setApp] = useState<"claude" | "chatgpt">("claude");
  const [copied, setCopied] = useState(false);
  const url = `${apiOrigin}/api/mcp`;
  const last = list.filter(fromAssistant).sort((a, b) => (b.loggedAt || b.updatedAt || 0) - (a.loggedAt || a.updatedAt || 0))[0];
  const when = last ? last.loggedAt || last.updatedAt : 0;
  const recent = when && Date.now() - when < 7 * 86_400_000;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      notify("Couldn't copy. Select the URL instead", { status: "error" });
    }
  };
  return (
    <Section footer="Assistants can log and edit meals and build splits. They never see or change your logged workouts." title="Log from an assistant">
      <Card className="flex flex-col gap-5 p-5">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", recent ? "bg-success" : last ? "bg-pr" : "bg-muted-foreground/40")} />
          <p className="min-w-0 flex-1 text-[14px]">
            {last ? (
              <>
                <span className="font-medium">{ASSISTANT[last.source] || "An assistant"}</span>
                <span className="text-muted-foreground"> logged {last.name} {format.ago(when).replace(/^[A-Z]/, (c) => c.toLowerCase())}</span>
              </>
            ) : (
              <span className="text-muted-foreground">No meals from an assistant yet</span>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-muted-foreground">Connector URL</span>
          <div className="flex items-center gap-2">
            <code className="sets min-w-0 flex-1 truncate rounded-[10px] bg-muted px-3 py-2 text-[13px] select-all">{url}</code>
            <Button aria-label="Copy connector URL" onClick={copy} size="sm" variant="tinted">
              {copied ? <Check className="size-4 text-success" strokeWidth={1.75} /> : <Copy className="size-4" strokeWidth={1.75} />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Segmented label="Assistant" onChange={setApp} options={[{ value: "claude", label: "Claude" }, { value: "chatgpt", label: "ChatGPT" }]} size="sm" value={app} />
          <ol className="flex flex-col gap-2">
            {STEPS[app].map((step, i) => (
              <li className="flex gap-3 text-[14px] leading-5" key={step}>
                <span className="sets grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </Card>
    </Section>
  );
}

export function NutritionPage() {
  const list = useValue(meals) as any[];
  const t = useValue(targets) as any;
  const [day, setDay] = useState(dateKey());
  const [sheet, setSheet] = useState<any>(null);
  // Meals from an assistant arrive through sync, so check for new ones on open.
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
  const wide = useWide();
  const label = day === today ? "Today" : day === shiftDateKey(today, -1) ? "Yesterday" : format.date(fromDateKey(day), { weekday: "long", month: "short", day: "numeric" });

  const dayView = (
    <FadeIn className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <button aria-label="Previous day" className="grid size-9 place-items-center rounded-full bg-muted active:bg-accent" onClick={() => setDay(shiftDateKey(day, -1))} type="button">
          <ChevronLeft className="size-5" strokeWidth={1.75} />
        </button>
        <span className="text-[16px] font-medium">{label}</span>
        <button aria-label="Next day" className="grid size-9 place-items-center rounded-full bg-muted active:bg-accent disabled:opacity-30" disabled={day >= today} onClick={() => setDay(shiftDateKey(day, 1))} type="button">
          <ChevronRight className="size-5" strokeWidth={1.75} />
        </button>
      </div>
      <Card>
        <DaySummary totals={totals} />
      </Card>
    </FadeIn>
  );
  const mealsView = (
    <Section title="Meals">
      {todays.length ? (
        <Card className="divide-y divide-border">
          {[...todays].sort((a, b) => (a.eatenAt || 0) - (b.eatenAt || 0)).map((m) => (
            <Row
              chevron
              icon={fromAssistant(m) ? MessageSquareText : Utensils}
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
  );
  const microView = (
    <Micronutrients day={day} />
  );
  const weeksView = (
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
  );
  const energyView = (
    <Section footer="Maintenance is average intake minus the energy that went into or came out of your bodyweight. It sharpens as you log." title="Energy balance">
      <MaintenanceCard />
    </Section>
  );
  const coachView = (
    <CoachSection />
  );

  return (
    <Page wide>
      <TopBar
        backLabel="Today"
        backTo={wide ? undefined : "today"}
        title="Fuel"
        trailing={
          <button aria-label="Add meal" className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground" onClick={() => setSheet("new")} type="button">
            <Plus className="size-5" strokeWidth={1.75} />
          </button>
        }
      />

      {!list.length ? (
        <Empty action={<Button onClick={() => setSheet("new")} variant="tinted">Add a meal</Button>} icon={Utensils} title="No meals yet">
          Connect Claude or ChatGPT below and every meal you confirm in the chat lands here. You can also add meals by hand.
        </Empty>
      ) : null}

      {wide ? (
        <div className="grid grid-cols-12 items-start gap-6">
          <div className="col-span-7 flex flex-col gap-8">
            {dayView}
            {mealsView}
            {weeksView}
          </div>
          <div className="col-span-5 flex flex-col gap-8">
            <ConnectPanel />
            {energyView}
            {microView}
            {coachView}
          </div>
        </div>
      ) : (
        <>
          {dayView}
          {mealsView}
          <ConnectPanel />
          {microView}
          {weeksView}
          {energyView}
          {coachView}
        </>
      )}

      <MealSheet date={day} meal={sheet && sheet !== "new" ? sheet : null} onClose={() => setSheet(null)} open={sheet !== null} />
    </Page>
  );
}
