// The Coach: insight cards computed on the phone from training and eating
// together (lib/model.js insights), each with the research it rests on; the
// weekly review Claude writes on the server when ANTHROPIC_API_KEY is set;
// and the sets-per-muscle bars against the evidence-based weekly range.
import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { Card, FadeIn, Section } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { fromDateKey, VOLUME_RANGE } from "@/lib/model.js";
import { applyRemote, coach, coachReviews } from "@/lib/store.js";
import { sync } from "@/lib/sync.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { cn } from "@/lib/utils";

type Insight = { id: string; tone: "warn" | "info" | "good"; area?: string; title: string; body: string; action?: string; evidence?: string; source?: string };

const TONES: Record<string, { icon: ComponentType<{ className?: string; strokeWidth?: number }>; cls: string }> = {
  warn: { icon: AlertTriangle, cls: "bg-pr/15 text-pr" },
  info: { icon: Lightbulb, cls: "bg-primary/15 text-primary" },
  good: { icon: CheckCircle2, cls: "bg-success/15 text-success" }
};

export function InsightCard({ card, className }: { card: Insight; className?: string }) {
  const { icon: Icon, cls } = TONES[card.tone];
  return (
    <Card className={cn("flex gap-3 p-4", className)}>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", cls)}>
        <Icon className="size-[18px]" strokeWidth={2.2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-[15.5px] leading-snug font-semibold">{card.title}</h3>
        <p className="text-[14px] leading-snug text-muted-foreground">{card.body}</p>
        {card.action ? (
          <p className="mt-1 flex items-start gap-1.5 text-[14px] leading-snug font-medium text-primary">
            <ArrowRight className="mt-[3px] size-3.5 shrink-0" strokeWidth={2.6} />
            {card.action}
          </p>
        ) : null}
        {card.evidence ? <p className="text-[12px] text-muted-foreground/80">Based on {card.evidence}</p> : null}
        {card.source ? (
          <p className="flex items-start gap-1 text-[12px] text-muted-foreground/80">
            <BookOpen className="mt-[2px] size-3 shrink-0" strokeWidth={2.4} />
            {card.source}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

// On Today: the week in one line and the cards in a swipeable row.
export function CoachStrip() {
  const { headline, cards } = useValue(coach) as { headline: Insight | null; cards: Insight[] };
  if (!cards.length) return null;
  return (
    <Section action={<a className="text-primary" href="#/coach">All</a>} title="Coach">
      {headline ? <p className="-mt-1 px-1 text-[14px] text-muted-foreground">{headline.title}</p> : null}
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1">
        {cards.map((card) => (
          <InsightCard className="w-[85%] max-w-sm shrink-0 snap-start" card={card} key={card.id} />
        ))}
      </div>
    </Section>
  );
}

// Plain text from Claude: paragraphs, with "- " lines as a list.
function ReviewText({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((block) => block.split("\n").filter((line) => line.trim()));
  return (
    <div className="flex flex-col gap-2.5 text-[14.5px] leading-relaxed">
      {blocks.map((lines, i) => (
        <div className="flex flex-col gap-1" key={i}>
          {lines.map((line, j) =>
            /^\s*[-•]\s/.test(line) ? (
              <p className="flex gap-2 pl-1" key={j}>
                <span className="text-primary">•</span>
                <span>{line.replace(/^\s*[-•]\s/, "")}</span>
              </p>
            ) : (
              <p className={/^This week:?$/i.test(line.trim()) ? "mt-1 font-semibold" : undefined} key={j}>
                {line}
              </p>
            )
          )}
        </div>
      ))}
    </div>
  );
}

const WEEK = 7 * 86_400_000;

export function WeeklyReview() {
  const state = useValue(sync) as any;
  const reviews = useValue(coachReviews) as any[];
  const { headline } = useValue(coach) as { headline: Insight | null };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = reviews[0];
  const tried = useRef(false);

  const write = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/coach/review", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "The review didn't come through.");
      await applyRemote([body.review]);
    } catch (e: any) {
      setError(e.message || "The review didn't come through.");
    } finally {
      setBusy(false);
    }
  };

  // A fresh review once a week, written when you open Fuel.
  const stale = !latest || Date.now() - fromDateKey(latest.date) >= WEEK;
  useEffect(() => {
    if (tried.current || !state.coach || !state.user || !stale || !headline || navigator.onLine === false) return;
    tried.current = true;
    write();
  }, [state.coach, state.user, stale, headline]);

  if (!state.coach && !latest) return null;
  return (
    <FadeIn>
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-[var(--tint)] to-[var(--tint-2)] text-white">
            <Sparkles className="size-4" strokeWidth={2.4} />
          </span>
          <span className="flex-1 text-[15.5px] font-semibold">Weekly review</span>
          {latest ? <span className="text-[13px] text-muted-foreground">{format.relativeDay(fromDateKey(latest.date))}</span> : null}
        </div>
        {busy && !latest ? <p className="text-[14.5px] text-muted-foreground">Reading your last six weeks…</p> : null}
        {latest ? <ReviewText text={latest.text} /> : !busy ? <p className="text-[14.5px] text-muted-foreground">Claude reads your training, meals and weigh-ins and writes what to change this week.</p> : null}
        {error ? <p className="text-[13.5px] text-destructive">{error}</p> : null}
        {state.coach ? (
          <Button disabled={busy || !state.user} onClick={write} size="sm" variant="tinted">
            <RefreshCw className={cn("size-4", busy && "animate-spin")} /> {busy ? "Writing…" : latest ? "Write a new review" : "Write this week's review"}
          </Button>
        ) : null}
        <p className="text-[12px] text-muted-foreground/80">Written by Claude from your Lift data. It's coaching, not medical advice.</p>
      </Card>
    </FadeIn>
  );
}

// On the Fuel page: the nutrition cards, with the rest on the Coach page.
export function CoachSection() {
  const { cards } = useValue(coach) as { cards: Insight[] };
  const nutrition = cards.filter((card) => card.area === "nutrition");
  return (
    <Section action={<a className="text-primary" href="#/coach">All coaching</a>} footer="Each card waits until there's enough data, and says what it's based on." title="Coach">
      {nutrition.map((card) => (
        <InsightCard card={card} key={card.id} />
      ))}
      {!nutrition.length ? <Card className="p-4 text-[14.5px] text-muted-foreground">Log a week of meals and weigh-ins and the Coach starts connecting them with your training.</Card> : null}
    </Section>
  );
}

// Weekly sets per muscle with the 10–20 band the research supports.
// `after`, when given, is drawn as a lighter bar: the sets once suggested
// changes are applied.
export function MuscleBars({ rows }: { rows: { muscle: string; sets: number; after?: number }[] }) {
  const [low, high] = VOLUME_RANGE;
  const max = Math.max(high + 4, ...rows.map((r) => Math.max(r.sets, r.after ?? 0)));
  const half = (n: number) => Math.round(n * 2) / 2;
  return (
    <Card className="flex flex-col gap-3.5 p-5">
      {rows.map((row, i) => (
        <div className="grid grid-cols-[86px_1fr_minmax(36px,auto)] items-center gap-3 text-[14.5px]" key={row.muscle}>
          <span className="truncate">{format.capitalize(row.muscle)}</span>
          <span className="relative h-2.5 overflow-hidden rounded-full bg-muted">
            <span className="absolute inset-y-0 bg-success/25" style={{ left: `${(low / max) * 100}%`, width: `${((high - low) / max) * 100}%` }} />
            {row.after !== undefined ? (
              <motion.span
                animate={{ width: `${(row.after / max) * 100}%` }}
                className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
                initial={{ width: 0 }}
                transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.25 + i * 0.04 }}
              />
            ) : null}
            <motion.span
              animate={{ width: `${(row.sets / max) * 100}%` }}
              className={cn("absolute inset-y-0 left-0 rounded-full", row.sets < low ? "bg-pr" : "bg-gradient-to-r from-[var(--tint-2)] to-[var(--tint)]")}
              initial={{ width: 0 }}
              transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.05 + i * 0.04 }}
            />
          </span>
          <span className={cn("text-right font-semibold tabular", row.sets < low && row.after === undefined && "text-pr")}>
            {row.after !== undefined && half(row.after) !== half(row.sets) ? (
              <>
                <span className={cn(row.sets < low && "text-pr")}>{half(row.sets)}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="text-primary">{half(row.after)}</span>
              </>
            ) : (
              half(row.sets)
            )}
          </span>
        </div>
      ))}
    </Card>
  );
}
