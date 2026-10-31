// Badges, the profile header and the pinned lift, shared by your profile and
// a friend's.
import { ChevronDown, Crown, Dumbbell, Flame, Medal, Pin, Scale, Sparkles, Sunrise, Trophy, Weight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ComponentType, type ReactNode, useState } from "react";
import { Card, Row, Sheet, softSpring, StatTiles } from "./kit";
import * as format from "@/lib/format.js";
import { cn } from "@/lib/utils";

const ICONS: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = { crown: Crown, sparkles: Sparkles, dumbbell: Dumbbell, flame: Flame, trophy: Trophy, scale: Scale, weight: Weight, medal: Medal, sunrise: Sunrise };

type Badge = { id: string; title: string; detail: string; icon: string; earnedAt: number | null; progress?: number; status?: string };

export const initials = (name: string) =>
  name
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "?";

export function ProfileHeader({ name, detail, summary, action }: { name: string; detail?: string; summary: any; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 px-1">
        <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-primary/15 text-[22px] font-semibold text-primary">
          {initials(name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[22px] leading-tight font-semibold tracking-tight">{name}</span>
          {detail ? <span className="truncate text-[14px] text-muted-foreground">{detail}</span> : null}
        </div>
        {action}
      </div>
      <StatTiles
        items={[
          { label: "Streak", value: summary.streak, unit: summary.streak === 1 ? "week" : "weeks" },
          { label: "This week", value: summary.sessionsThisWeek, unit: summary.sessionsThisWeek === 1 ? "workout" : "workouts" },
          { label: "Workouts", value: summary.totalSessions, sub: "all time" }
        ]}
      />
    </div>
  );
}

// The pinned lift and its PRs: heaviest set and best estimated 1RM.
export function PinnedLift({ pinned, unit, children }: { pinned: any; unit: string; children?: ReactNode }) {
  const set = (record: any) => `${format.weight(record.weight)} ${unit} × ${record.reps}`;
  return (
    <Card className="divide-y divide-border">
      <Row icon={Pin} subtitle={pinned.heaviest ? "Personal records" : "No sets logged yet"} title={pinned.name}>
        {children}
      </Row>
      {pinned.heaviest ? (
        <div className="grid grid-cols-2 divide-x divide-border">
          <div className="flex flex-col gap-0.5 px-4 py-3">
            <span className="text-[12.5px] font-medium text-muted-foreground">Heaviest set</span>
            <span className="text-[20px] font-semibold tracking-tight tabular">{set(pinned.heaviest)}</span>
            <span className="text-[12px] text-muted-foreground">{format.date(pinned.heaviest.date, { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
          {pinned.e1rm ? (
            <div className="flex flex-col gap-0.5 px-4 py-3">
              <span className="text-[12.5px] font-medium text-muted-foreground">Best e1RM</span>
              <span className="text-[20px] font-semibold tracking-tight tabular">
                {format.weight(Math.round(pinned.e1rm.value))}
                <span className="ml-0.5 text-[13px] font-medium text-muted-foreground">{unit}</span>
              </span>
              <span className="text-[12px] text-muted-foreground">from {set(pinned.e1rm)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function BadgeTile({ badge, onOpen }: { badge: Badge; onOpen: () => void }) {
  const BadgeIcon = ICONS[badge.icon] || Medal;
  const earned = Boolean(badge.earnedAt);
  return (
    <button className="surface flex min-w-0 flex-col items-center gap-2 rounded-3xl px-2 py-4 text-center active:bg-accent" onClick={onOpen} type="button">
      <span className={cn("grid size-12 place-items-center rounded-full", earned ? (badge.status ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary") : "bg-muted text-muted-foreground/60")}>
        <BadgeIcon className="size-6" strokeWidth={2} />
      </span>
      <span className={cn("line-clamp-2 text-[12.5px] leading-tight font-medium", !earned && "text-muted-foreground")}>{badge.title}</span>
      {!earned && badge.progress != null ? (
        <span aria-hidden className="h-1 w-10 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-primary/60" style={{ width: `${Math.round(badge.progress * 100)}%` }} />
        </span>
      ) : null}
    </button>
  );
}

const LOCKED_KEY = "lift:lockedBadges";
function rememberedOpen() {
  try {
    return localStorage.getItem(LOCKED_KEY) === "1";
  } catch {
    return false;
  }
}

// Earned badges, and (when `locked` is given) the rest behind a disclosure
// with how close you are. Tap any badge for what it takes.
export function BadgeGrid({ badges, locked, empty = "No badges yet." }: { badges: Badge[]; locked?: Badge[]; empty?: string }) {
  const [open, setOpen] = useState<Badge | null>(null);
  const [showLocked, setShowLocked] = useState(rememberedOpen);
  const toggle = () => {
    setShowLocked(!showLocked);
    try {
      localStorage.setItem(LOCKED_KEY, showLocked ? "0" : "1");
    } catch {}
  };
  const Icon = open ? ICONS[open.icon] || Medal : Medal;
  return (
    <>
      {badges.length ? (
        <div className="grid grid-cols-3 gap-3">
          {badges.map((badge) => (
            <BadgeTile badge={badge} key={badge.id} onOpen={() => setOpen(badge)} />
          ))}
        </div>
      ) : (
        <Card className="p-4 text-[15px] text-muted-foreground">{empty}</Card>
      )}
      {locked?.length ? (
        <>
          <button aria-expanded={showLocked} className="flex h-11 items-center justify-center gap-1.5 rounded-full text-[14.5px] font-medium text-primary active:opacity-60" onClick={toggle} type="button">
            {showLocked ? "Hide" : "Show"} {format.plural(locked.length, "locked badge")}
            <motion.span animate={{ rotate: showLocked ? 180 : 0 }} transition={softSpring}>
              <ChevronDown className="size-4" strokeWidth={2.6} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {showLocked ? (
              <motion.div animate={{ height: "auto", opacity: 1 }} className="overflow-hidden" exit={{ height: 0, opacity: 0 }} initial={{ height: 0, opacity: 0 }} transition={softSpring}>
                <div className="grid grid-cols-3 gap-3 pb-1">
                  {locked.map((badge) => (
                    <BadgeTile badge={badge} key={badge.id} onOpen={() => setOpen(badge)} />
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : null}
      <Sheet onClose={() => setOpen(null)} open={Boolean(open)} title="Badge">
        {open ? (
          <div className="flex flex-col items-center gap-3 px-2 pt-2 pb-4 text-center">
            <span className={cn("grid size-20 place-items-center rounded-full", open.earnedAt ? (open.status ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary") : "bg-muted text-muted-foreground")}>
              <Icon className="size-10" strokeWidth={1.8} />
            </span>
            <h3 className="text-[22px] font-semibold tracking-tight">{open.title}</h3>
            <p className="max-w-72 text-[15px] text-muted-foreground">{open.detail}</p>
            <p className="text-[14px] font-medium">
              {open.earnedAt ? (open.status ? open.status : `Earned ${format.date(open.earnedAt, { month: "long", day: "numeric", year: "numeric" })}`) : `${Math.round((open.progress || 0) * 100)}% of the way there`}
            </p>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
