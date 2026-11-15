// A friend's profile, found by username: their stats, pinned lift and
// badges, your lifts next to theirs, and their recent workouts. Everything
// comes from their server-side summary, minus what they chose not to share.
// You can report or block them from here.
import { Ban, Flag, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { BadgeGrid, PinnedLift, ProfileHeader } from "@/components/badges";
import { Card, Empty, Page, Row, Section, Sheet, TopBar } from "@/components/kit";
import { ask } from "@/lib/dialogs";
import { BADGES, compareLifts } from "@/lib/model.js";
import { notify } from "@/lib/notify";
import { back } from "@/lib/router.js";
import { social } from "@/lib/social.js";
import { profile } from "@/lib/store.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";

const REASONS = [
  { value: "name", title: "Offensive name or username" },
  { value: "harassment", title: "Harassment or bullying" },
  { value: "spam", title: "Spam or a fake account" },
  { value: "other", title: "Something else" }
];

// Reports go to Lift's admins, who can remove the account.
export function ReportSheet({ username, name, open, onClose }: { username: string; name: string; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setReason("");
      setNote("");
    }
  }, [open]);
  const send = async () => {
    setBusy(true);
    try {
      await social("/api/friends/report", { username, reason, note });
      notify(`Reported ${name}. Thanks for telling us.`);
      onClose();
    } catch (failure: any) {
      notify(failure.message, { status: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet onClose={onClose} open={open} title={`Report ${name}`}>
      <Section footer="Lift's admins review every report and remove accounts that break the terms. The person you report isn't told who reported them." title="What's wrong?">
        <Card className="divide-y divide-border">
          {REASONS.map((option) => (
            <Row key={option.value} onClick={() => setReason(option.value)} title={option.title} value={reason === option.value ? <span className="text-primary">✓</span> : null} />
          ))}
        </Card>
      </Section>
      <Section title="Details (optional)">
        <Card>
          <textarea aria-label="Report details" className="min-h-24 w-full resize-none bg-transparent px-4 py-3 text-[16px] outline-none placeholder:text-muted-foreground" maxLength={500} onChange={(e) => setNote(e.currentTarget.value)} placeholder="Anything that helps" value={note} />
        </Card>
      </Section>
      <Card>
        <Row disabled={busy || !reason} onClick={send} title={busy ? "Sending…" : "Send report"} tone="danger" />
      </Card>
    </Sheet>
  );
}

function CompareRow({ row, them, unit }: { row: any; them: string; unit: string }) {
  const top = Math.max(row.mine, row.theirs, 1);
  const bar = (label: string, value: number, ratio: number | null, mine: boolean) => (
    <div className="grid grid-cols-[64px_1fr_auto] items-center gap-3 text-[13px]">
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

export function FriendPage({ username }: { username: string }) {
  const mine = useValue(profile) as any;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    social(`/api/profile?username=${encodeURIComponent(username)}`)
      .then((reply) => setData(reply.profile))
      .catch((failure) => setError(failure.message));
  }, [username]);

  if (!data) {
    return (
      <Page>
        <TopBar backLabel="Profile" backTo="profile" large={false} title={`@${username}`} />
        {error ? <Empty icon={Users} title="Couldn't load their profile">{error}</Empty> : <Card className="p-4 text-[15px] text-muted-foreground">Loading…</Card>}
      </Page>
    );
  }

  const first = data.name.replace(/^@/, "").split(/\s+/)[0];
  const rows = compareLifts(mine, data);
  const earned = new Map(data.badges.map((badge: any) => [badge.id, badge]));
  const theirBadges = BADGES.filter((badge: any) => earned.has(badge.id)).map((badge: any) => earned.get(badge.id));
  const remove = async () => {
    if (!(await ask({ title: `Remove ${data.name}?`, message: "You stop seeing each other's profiles. Either of you can send a new request.", confirm: "Remove", danger: true }))) return;
    try {
      await social("/api/friends/remove", { username });
      notify(`Removed ${data.name}`);
      back("profile");
    } catch (failure: any) {
      notify(failure.message, { status: "error" });
    }
  };
  const block = async () => {
    if (!(await ask({ title: `Block ${data.name}?`, message: "You stop being friends, and neither of you can find or add the other. You can unblock them from your profile.", confirm: "Block", danger: true }))) return;
    try {
      await social("/api/friends/block", { username });
      notify(`Blocked ${data.name}`);
      back("profile");
    } catch (failure: any) {
      notify(failure.message, { status: "error" });
    }
  };

  return (
    <Page>
      <TopBar backLabel="Profile" backTo="profile" large={false} title={data.name} />
      <ProfileHeader detail={`@${data.username}`} name={data.name} summary={data} />

      {data.pinned ? (
        <Section title="Pinned lift">
          <PinnedLift pinned={data.pinned} unit={data.unit} />
        </Section>
      ) : null}

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
                  <span className="truncate text-[15px] font-medium">{workout.name}</span>
                  <span className="shrink-0 text-[13px] text-muted-foreground">{format.relativeDay(workout.date)}</span>
                </div>
                {workout.exercises.map((entry: any, i: number) => (
                  <span className="truncate text-[13px] text-muted-foreground" key={i}>
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
        <Card className="divide-y divide-border">
          <Row onClick={remove} title="Remove friend" tone="danger" />
          <Row icon={Flag} iconClass="text-destructive" onClick={() => setReporting(true)} title={`Report ${first}`} tone="danger" />
          <Row icon={Ban} iconClass="text-destructive" onClick={block} title={`Block ${first}`} tone="danger" />
        </Card>
      </Section>
      <ReportSheet name={data.name} onClose={() => setReporting(false)} open={reporting} username={username} />
    </Page>
  );
}
