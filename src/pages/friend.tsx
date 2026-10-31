// A friend's profile: their stats and badges, your lifts next to theirs, and
// their recent workouts. Everything comes from their server-side summary,
// minus what they chose not to share.
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { BadgeGrid, ProfileHeader } from "@/components/badges";
import { Card, Empty, Page, Row, Section, TopBar } from "@/components/kit";
import { ask } from "@/lib/dialogs";
import { BADGES, compareLifts } from "@/lib/model.js";
import { notify } from "@/lib/notify";
import { back } from "@/lib/router.js";
import { social } from "@/lib/social.js";
import { profile } from "@/lib/store.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";

function CompareRow({ row, them, unit }: { row: any; them: string; unit: string }) {
  const top = Math.max(row.mine, row.theirs, 1);
  const bar = (label: string, value: number, ratio: number | null, mine: boolean) => (
    <div className="grid grid-cols-[64px_1fr_auto] items-center gap-3 text-[13.5px]">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-muted">
        <span className={mine ? "block h-full rounded-full bg-primary" : "block h-full rounded-full bg-muted-foreground/50"} style={{ width: `${Math.max(4, (value / top) * 100)}%` }} />
      </span>
      <span className="tabular">
        {format.weight(Math.round(value))} {unit}
        {ratio != null ? <span className="text-muted-foreground"> · {ratio}×</span> : null}
      </span>
    </div>
  );
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <span className="text-[15px] font-medium">{row.name}</span>
      {bar("You", row.mine, row.myRatio, true)}
      {bar(them, row.theirs, row.theirRatio, false)}
    </div>
  );
}

export function FriendPage({ email }: { email: string }) {
  const mine = useValue(profile) as any;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    social(`/api/profile?email=${encodeURIComponent(email)}`)
      .then((reply) => setData(reply.profile))
      .catch((failure) => setError(failure.message));
  }, [email]);

  if (!data) {
    return (
      <Page>
        <TopBar backLabel="Profile" backTo="profile" large={false} title="Friend" />
        {error ? <Empty icon={Users} title="Couldn't load their profile">{error}</Empty> : <Card className="p-4 text-[15px] text-muted-foreground">Loading…</Card>}
      </Page>
    );
  }

  const first = data.name.split(/\s+/)[0];
  const rows = compareLifts(mine, data);
  const earned = new Map(data.badges.map((badge: any) => [badge.id, badge]));
  const theirBadges = BADGES.filter((badge: any) => earned.has(badge.id)).map((badge: any) => earned.get(badge.id));
  const remove = async () => {
    if (!(await ask({ title: `Remove ${data.name}?`, message: "You stop seeing each other's profiles. Either of you can send a new request.", confirm: "Remove", danger: true }))) return;
    try {
      await social("/api/friends/remove", { email });
      notify(`Removed ${data.name}`);
      back("profile");
    } catch (failure: any) {
      notify(failure.message, { status: "error" });
    }
  };

  return (
    <Page>
      <TopBar backLabel="Profile" backTo="profile" large={false} title={data.name} />
      <ProfileHeader detail={email} name={data.name} summary={data} />

      <Section action={`${theirBadges.length} of ${data.badgeCount}`} title="Badges">
        <BadgeGrid badges={theirBadges as any[]} empty={`${first} hasn't earned a badge yet.`} />
      </Section>

      <Section footer="Best estimated 1RM on the lifts you both do, in your unit. Ratios are the lift as a multiple of bodyweight." title="Compare">
        <Card className="divide-y divide-border">
          {data.lifts === null ? (
            <Row subtitle={`${first} doesn't share their lifts.`} title="Not shared" />
          ) : rows.length ? (
            rows.map((row) => <CompareRow key={row.key} row={row} them={first} unit={mine.unit} />)
          ) : (
            <Row subtitle="When you both log the same lift, it shows up here." title="No lifts in common yet" />
          )}
        </Card>
      </Section>

      <Section title="Recent workouts">
        <Card className="divide-y divide-border">
          {data.recent === null ? (
            <Row subtitle={`${first} doesn't share their workouts.`} title="Not shared" />
          ) : data.recent.length ? (
            data.recent.map((workout: any) => (
              <div className="flex flex-col gap-1 px-4 py-3" key={workout.date}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[15.5px] font-medium">{workout.name}</span>
                  <span className="shrink-0 text-[13px] text-muted-foreground">{format.relativeDay(workout.date)}</span>
                </div>
                {workout.exercises.map((entry: any, i: number) => (
                  <span className="truncate text-[13.5px] text-muted-foreground" key={i}>
                    {entry.name} · {entry.seconds ? format.clock(entry.seconds) : entry.weight ? `${format.weight(entry.weight)} ${data.unit} × ${entry.reps}` : `${entry.reps} reps`}
                    {entry.sets > 1 ? `, ${entry.sets} sets` : ""}
                  </span>
                ))}
              </div>
            ))
          ) : (
            <Row title="No workouts yet" />
          )}
        </Card>
      </Section>

      <Section>
        <Card>
          <Row onClick={remove} title="Remove friend" tone="danger" />
        </Card>
      </Section>
    </Page>
  );
}
