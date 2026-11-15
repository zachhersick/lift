// The Coach: insight cards computed on the phone from training and eating
// together (lib/model.js insights), each with the research it rests on; the
// weekly review Claude writes on the server when ANTHROPIC_API_KEY is set,
// once you've agreed to your data going to Anthropic (settings.aiConsent);
// and the sets-per-muscle bars against the evidence-based weekly range.
import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, Lightbulb, NotebookPen, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { Card, FadeIn, Section } from "@/components/kit";
import { ProSheet } from "@/components/pro-sheet";
import { Button } from "@/components/ui/button";
import { fromDateKey, liftsThisWeek, REVIEW_MIN_LIFTS, VOLUME_RANGE } from "@/lib/model.js";
import { postJson } from "@/lib/api.js";
import { applyRemote, coach, coachReviews, saveSettings, sessions, settings } from "@/lib/store.js";
import { sync } from "@/lib/sync.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { cn } from "@/lib/utils";

type Insight = { id: string; tone: "warn" | "info" | "good"; area?: string; title: string; body: string; action?: string; evidence?: string; source?: string };

const TONES: Record<string, { icon: ComponentType<{ className?: string; strokeWidth?: number }>; cls: string }> = {
  warn: { icon: AlertTriangle, cls: "text-pr" },
  info: { icon: Lightbulb, cls: "text-muted-foreground" },
  good: { icon: CheckCircle2, cls: "text-success" }
};

export function InsightCard({ card, className }: { card: Insight; className?: string }) {
  const { icon: Icon, cls } = TONES[card.tone];
  return (
    <Card className={cn("flex gap-3 p-4", className)}>
      <Icon className={cn("mt-0.5 size-[18px] shrink-0", cls)} strokeWidth={1.75} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-[15px] leading-snug font-medium">{card.title}</h3>
        <p className="text-[14px] leading-snug text-muted-foreground">{card.body}</p>
        {card.action ? (
          <p className="mt-1 flex items-start gap-1.5 text-[14px] leading-snug text-foreground">
            <ArrowRight className="mt-[3px] size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            {card.action}
          </p>
        ) : null}
        {card.evidence ? <p className="text-[12px] text-muted-foreground">Based on {card.evidence}</p> : null}
        {card.source ? (
          <p className="flex items-start gap-1 text-[12px] text-muted-foreground">
            <BookOpen className="mt-[2px] size-3 shrink-0" strokeWidth={1.75} />
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
    <div className="flex flex-col gap-2.5 text-[14px] leading-relaxed">
      {blocks.map((lines, i) => (
        <div className="flex flex-col gap-1" key={i}>
          {lines.map((line, j) =>
            /^\s*[-•]\s/.test(line) ? (
              <p className="flex gap-2 pl-1" key={j}>
                <span className="text-primary">•</span>
                <span>{line.replace(/^\s*[-•]\s/, "")}</span>
              </p>
            ) : (
              <p className={/^This week:?$/i.test(line.trim()) ? "mt-1 font-medium" : undefined} key={j}>
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
  const consent = Boolean((useValue(settings) as any).aiConsent);
  const reviews = useValue(coachReviews) as any[];
  const { headline } = useValue(coach) as { headline: Insight | null };
  const lifts = liftsThisWeek(useValue(sessions) as any[]);
  const enough = lifts >= REVIEW_MIN_LIFTS;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pro, setPro] = useState(false);
  const latest = reviews[0];
  const tried = useRef(false);

  const write = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await postJson("/api/coach/review", { consent: true });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "The review didn't come through.");
      await applyRemote([body.review]);
    } catch (e: any) {
      setError(e.message || "The review didn't come through.");
    } finally {
      setBusy(false);
    }
  };

  // A fresh review once a week, written when you open the Coach, for VIPs
  // with enough lifting logged that week to review.
  const stale = !latest || Date.now() - fromDateKey(latest.date) >= WEEK;
  useEffect(() => {
    if (tried.current || !consent || !state.coach || !state.user || !stale || !enough || !headline || navigator.onLine === false) return;
    tried.current = true;
    write();
  }, [consent, state.coach, state.user, stale, enough, headline]);
  const agree = () => {
    saveSettings({ aiConsent: Date.now() });
    if (enough) write();
  };

  if (state.billing && !state.user?.pro && !latest) {
    return (
      <FadeIn>
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <NotebookPen className="size-[18px] text-muted-foreground" strokeWidth={1.75} />
            <span className="flex-1 text-[15px] font-medium">Weekly review</span>
          </div>
          <p className="text-[14px] text-muted-foreground">With Lift Pro, Claude reads your training and eating and writes you a short review each week.</p>
          <Button className="self-start" onClick={() => setPro(true)} size="sm" variant="tinted">See Lift Pro</Button>
        </Card>
        <ProSheet onClose={() => setPro(false)} open={pro} />
      </FadeIn>
    );
  }
  if (!state.coach && !latest) return null;
  return (
    <FadeIn>
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <NotebookPen className="size-[18px] text-muted-foreground" strokeWidth={1.75} />
          <span className="flex-1 text-[15px] font-medium">Weekly review</span>
          {latest ? <span className="text-[13px] text-muted-foreground">{format.relativeDay(fromDateKey(latest.date))}</span> : null}
        </div>
        {busy && !latest ? <p className="text-[14px] text-muted-foreground">Reading your last six weeks…</p> : null}
        {latest ? <ReviewText text={latest.text} /> : !busy ? <p className="text-[14px] text-muted-foreground">Claude reads your training, meals and weigh-ins and writes what to change this week.</p> : null}
        {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
        {state.coach && !consent ? (
          <div className="flex flex-col gap-2 rounded-xl bg-muted p-3 text-[13px] leading-snug text-muted-foreground">
            <p>
              To write it, Lift sends a summary of your last six weeks (workouts, meals, weigh-ins and targets, no email or name) to Anthropic's Claude. Anthropic doesn't train on it. See the{" "}
              <a className="text-primary underline" href="/privacy.html">
                privacy policy
              </a>
              .
            </p>
            <Button onClick={agree} size="sm" variant="tinted">
              Agree and turn on reviews
            </Button>
          </div>
        ) : null}
        {state.coach && consent && !enough ? (
          <p className="text-[13px] text-muted-foreground">
            Log {REVIEW_MIN_LIFTS} lifts this week for {latest ? "a new" : "your"} review ({lifts}/{REVIEW_MIN_LIFTS}).
          </p>
        ) : null}
        {state.coach && consent ? (
          <Button disabled={busy || !state.user || !enough} onClick={write} size="sm" variant="tinted">
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
      {!nutrition.length ? <Card className="p-4 text-[14px] text-muted-foreground">Log a week of meals and weigh-ins and the Coach starts connecting them with your training.</Card> : null}
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
    <Card className="flex flex-col gap-3 p-5">
      {rows.map((row, i) => (
        <div className="grid grid-cols-[86px_1fr_minmax(36px,auto)] items-center gap-3 text-[14px]" key={row.muscle}>
          <span className="truncate">{format.capitalize(row.muscle)}</span>
          <span className="relative h-2 overflow-hidden rounded-full bg-muted">
            <span className="absolute inset-y-0 bg-success/20" style={{ left: `${(low / max) * 100}%`, width: `${((high - low) / max) * 100}%` }} />
            {row.after !== undefined ? (
              <motion.span
                animate={{ width: `${(row.after / max) * 100}%` }}
                className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
                initial={{ width: 0 }}
                transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: 0.25 + i * 0.04 }}
              />
            ) : null}
            <motion.span
              animate={{ width: `${(row.sets / max) * 100}%` }}
              className={cn("absolute inset-y-0 left-0 rounded-full", row.sets < low ? "bg-pr" : "bg-primary")}
              initial={{ width: 0 }}
              transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: 0.05 + i * 0.04 }}
            />
          </span>
          <span className={cn("text-right font-medium tabular", row.sets < low && row.after === undefined && "text-pr")}>
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
