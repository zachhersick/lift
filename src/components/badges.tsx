// Badges and the profile header, shared by your profile and a friend's.
import { Dumbbell, Flame, Medal, Scale, Sparkles, Sunrise, Trophy, Weight } from "lucide-react";
import { type ComponentType, useState } from "react";
import { Card, Sheet, StatTiles } from "./kit";
import * as format from "@/lib/format.js";
import { cn } from "@/lib/utils";

const ICONS: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = { sparkles: Sparkles, dumbbell: Dumbbell, flame: Flame, trophy: Trophy, scale: Scale, weight: Weight, medal: Medal, sunrise: Sunrise };

type Badge = { id: string; title: string; detail: string; icon: string; earnedAt: number | null; progress?: number };

export const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "?";

export function ProfileHeader({ name, detail, summary }: { name: string; detail?: string; summary: any }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 px-1">
        <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-primary/15 text-[22px] font-semibold text-primary">
          {initials(name)}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[22px] leading-tight font-semibold tracking-tight">{name}</span>
          {detail ? <span className="truncate text-[14px] text-muted-foreground">{detail}</span> : null}
        </div>
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

// Earned badges in colour, the rest dimmed with how close you are. Tap one
// for what it takes.
export function BadgeGrid({ badges, empty = "No badges yet." }: { badges: Badge[]; empty?: string }) {
  const [open, setOpen] = useState<Badge | null>(null);
  if (!badges.length) return <Card className="p-4 text-[15px] text-muted-foreground">{empty}</Card>;
  const Icon = open ? ICONS[open.icon] || Medal : Medal;
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {badges.map((badge) => {
          const BadgeIcon = ICONS[badge.icon] || Medal;
          const earned = Boolean(badge.earnedAt);
          return (
            <button className="surface flex min-w-0 flex-col items-center gap-2 rounded-3xl px-2 py-4 text-center active:bg-accent" key={badge.id} onClick={() => setOpen(badge)} type="button">
              <span className={cn("grid size-12 place-items-center rounded-full", earned ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/60")}>
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
        })}
      </div>
      <Sheet onClose={() => setOpen(null)} open={Boolean(open)} title="Badge">
        {open ? (
          <div className="flex flex-col items-center gap-3 px-2 pt-2 pb-4 text-center">
            <span className={cn("grid size-20 place-items-center rounded-full", open.earnedAt ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
              <Icon className="size-10" strokeWidth={1.8} />
            </span>
            <h3 className="text-[22px] font-semibold tracking-tight">{open.title}</h3>
            <p className="max-w-72 text-[15px] text-muted-foreground">{open.detail}</p>
            <p className="text-[14px] font-medium">
              {open.earnedAt ? `Earned ${format.date(open.earnedAt, { month: "long", day: "numeric", year: "numeric" })}` : `${Math.round((open.progress || 0) * 100)}% of the way there`}
            </p>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
