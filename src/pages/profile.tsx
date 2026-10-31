// Profile: your stats, pinned lift and badges, friends (added by username,
// accepted on the other side) with a leaderboard, and what friends can see.
// Settings is one row down.
import { Check, LogIn, Pencil, Pin, Settings2, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AccountSheet } from "@/components/account-sheet";
import { BadgeGrid, PinnedLift, ProfileHeader } from "@/components/badges";
import { ExercisePicker } from "@/components/exercise-picker";
import { Card, Page, Row, Section, Toggle, TopBar } from "@/components/kit";
import { cleanUsername, liftKey, usernameProblem } from "@/lib/model.js";
import { notify } from "@/lib/notify";
import { social } from "@/lib/social.js";
import { badgeList, exerciseIndex, profile, saveSettings, settings } from "@/lib/store.js";
import { sync } from "@/lib/sync.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { cn } from "@/lib/utils";

type Person = { username: string | null; name: string; since: number };
type Lists = { friends: Person[]; incoming: Person[]; outgoing: Person[] };

const handle = (person: Person) => (person.username ? `@${person.username}` : "Hasn't picked a username yet");

// You and your friends ranked: workouts this week, and your pinned lift.
function Leaderboard({ pinnedKey }: { pinnedKey: string }) {
  const [board, setBoard] = useState<any>(null);
  useEffect(() => {
    social(`/api/friends/leaderboard?key=${encodeURIComponent(pinnedKey)}`)
      .then(setBoard)
      .catch(() => setBoard(null));
  }, [pinnedKey]);
  if (!board) return null;
  const rows = (list: any[], text: (row: any) => string) =>
    list.map((row, i) => (
      <div className={cn("grid grid-cols-[28px_1fr_auto] items-center gap-2 px-4 py-2.5 text-[15px]", row.me && "bg-primary/8")} key={`${row.username}-${i}`}>
        <span className="text-[13px] font-semibold text-muted-foreground tabular">{i + 1}</span>
        <span className={cn("truncate", row.me && "font-semibold text-primary")}>{row.me ? "You" : row.name}</span>
        <span className="tabular text-muted-foreground">{text(row)}</span>
      </div>
    ));
  return (
    <Section footer={board.lift ? "Lift ranks use best estimated 1RM in your unit, from friends who share their lifts or pinned the same one." : "Pin a lift to rank it here too."} title="Leaderboard">
      <Card className="divide-y divide-border">
        <div className="px-4 pt-3 pb-1 text-[13px] font-semibold text-muted-foreground">Workouts this week</div>
        {rows(board.week, (row) => String(row.value))}
      </Card>
      {board.lift ? (
        <Card className="divide-y divide-border">
          <div className="px-4 pt-3 pb-1 text-[13px] font-semibold text-muted-foreground">{board.lift.name || "Pinned lift"}</div>
          {board.lift.rows.length ? rows(board.lift.rows, (row) => `${format.weight(Math.round(row.value))} ${board.lift.unit}`) : <Row subtitle="No one has logged it yet." title="Nothing to rank" />}
        </Card>
      ) : null}
    </Section>
  );
}

function Friends({ pinnedKey }: { pinnedKey: string }) {
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (path: string, body?: object, done?: string) => {
    setBusy(true);
    try {
      const data = await social(path, body);
      setLists(data);
      setError("");
      if (done) notify(done);
      return true;
    } catch (failure: any) {
      if (body) notify(failure.message, { status: "error" });
      else setError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    run("/api/friends");
  }, []);

  const wanted = cleanUsername(name);
  const add = async () => {
    if (await run("/api/friends/request", { username: wanted }, `Request sent to @${wanted}`)) setName("");
  };

  return (
    <>
      <Section footer="Add people on this Lift by their username. They see your request here and accept it." title="Friends">
        {lists?.incoming.length ? (
          <Card className="divide-y divide-border">
            {lists.incoming.map((person) => (
              <Row key={person.username || person.name} subtitle={`${handle(person)} · wants to be friends`} title={person.name}>
                <button aria-label={`Decline ${person.name}`} className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground active:bg-accent" disabled={busy || !person.username} onClick={() => run("/api/friends/remove", { username: person.username })} type="button">
                  <X className="size-[18px]" strokeWidth={2.4} />
                </button>
                <button aria-label={`Accept ${person.name}`} className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground active:opacity-80" disabled={busy || !person.username} onClick={() => run("/api/friends/accept", { username: person.username }, `You and ${person.name} are friends`)} type="button">
                  <Check className="size-[18px]" strokeWidth={2.6} />
                </button>
              </Row>
            ))}
          </Card>
        ) : null}
        <Card className="divide-y divide-border">
          {error ? <Row subtitle={error} title="Couldn't load friends" /> : null}
          {!lists && !error ? <Row subtitle="Loading…" title="Friends" /> : null}
          {lists && !lists.friends.length && !lists.outgoing.length ? <Row subtitle="Add someone below to compare lifts." title="No friends yet" /> : null}
          {lists?.friends.map((person) =>
            person.username ? (
              <Row chevron href={`#/friend/${encodeURIComponent(person.username)}`} key={person.username} subtitle={`@${person.username}`} title={person.name} />
            ) : (
              <Row key={person.name} subtitle={handle(person)} title={person.name} />
            )
          )}
          {lists?.outgoing.map((person) => (
            <Row key={person.username || person.name} subtitle={`${handle(person)} · request sent`} title={person.name}>
              <button className="h-8 rounded-full bg-muted px-3 text-[13.5px] font-medium text-muted-foreground active:bg-accent" disabled={busy || !person.username} onClick={() => run("/api/friends/remove", { username: person.username }, "Request cancelled")} type="button">
                Cancel
              </button>
            </Row>
          ))}
          <Row title="Username">
            <input
              aria-label="Friend's username"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className="w-48 bg-transparent text-right text-[15.5px] text-muted-foreground outline-none"
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && !usernameProblem(wanted) && add()}
              placeholder="@username"
              spellCheck={false}
              value={name}
            />
          </Row>
          <Row disabled={busy || Boolean(usernameProblem(wanted))} icon={UserPlus} onClick={add} title="Send friend request" tone="action" />
        </Card>
      </Section>
      {lists?.friends.length ? <Leaderboard pinnedKey={pinnedKey} /> : null}
    </>
  );
}

export function ProfilePage() {
  const state = useValue(sync) as any;
  const s = useValue(settings) as any;
  const mine = useValue(profile) as any;
  const list = useValue(badgeList) as any[];
  const index = useValue(exerciseIndex) as Map<string, any>;
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const user = state.user;
  const name = user?.name || (user?.username ? `@${user.username}` : "You");
  const share = s.share || {};
  const setShare = (key: string, value: boolean) => saveSettings({ share: { ...share, [key]: value } });
  const pinnedExercise = s.pinnedLift ? index.get(s.pinnedLift) : null;
  // Held (VIP) and newest first; locked ones by how close you are.
  const earned = list.filter((badge) => badge.earnedAt).sort((a, b) => Number(Boolean(b.status)) - Number(Boolean(a.status)) || b.earnedAt - a.earnedAt);
  const locked = list.filter((badge) => !badge.earnedAt && !badge.status).sort((a, b) => (b.progress || 0) - (a.progress || 0));

  return (
    <Page>
      <TopBar
        title="Profile"
        trailing={
          <a aria-label="Settings" className="grid size-10 place-items-center rounded-full text-primary active:opacity-60" href="#/settings">
            <Settings2 className="size-[22px]" strokeWidth={2.2} />
          </a>
        }
      />
      <ProfileHeader
        action={
          user ? (
            <button aria-label="Edit profile" className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-primary active:bg-accent" onClick={() => setEditing(true)} type="button">
              <Pencil className="size-[18px]" strokeWidth={2.2} />
            </button>
          ) : null
        }
        detail={user ? (user.username ? `@${user.username}` : "") : "Not signed in"}
        name={name}
        summary={mine}
      />

      <Section footer="Friends always see your pinned lift." title="Pinned lift">
        {mine.pinned ? (
          <PinnedLift pinned={mine.pinned} unit={mine.unit}>
            <button className="h-8 rounded-full bg-muted px-3 text-[13.5px] font-medium text-primary active:bg-accent" onClick={() => setPicking(true)} type="button">
              Change
            </button>
            <button aria-label="Unpin lift" className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground active:bg-accent" onClick={() => saveSettings({ pinnedLift: null })} type="button">
              <X className="size-4" strokeWidth={2.4} />
            </button>
          </PinnedLift>
        ) : (
          <Card>
            <Row icon={Pin} onClick={() => setPicking(true)} subtitle="Show off a lift's PR on your profile" title="Pin a lift" tone="action" />
          </Card>
        )}
      </Section>

      <Section action={`${earned.length} of ${list.length}`} title="Badges">
        <BadgeGrid badges={earned} empty="No badges yet. Finish a workout to earn your first." locked={locked} />
      </Section>

      {user ? (
        <Friends pinnedKey={pinnedExercise ? liftKey(pinnedExercise) : ""} />
      ) : (
        <Section footer="Sign in to add friends and compare lifts." title="Friends">
          <Card>
            <Row href="#/settings" icon={LogIn} title="Sign in in Settings" tone="action" />
          </Card>
        </Section>
      )}

      <Section footer="Friends always see your badges, streak, workout counts and pinned lift. They never see your email, bodyweight, meals or notes; ratios show lifts as a multiple of bodyweight without the weight itself." title="What friends see">
        <Card className="divide-y divide-border">
          <Row subtitle="Estimated 1RM and heaviest set" title="Best lifts">
            <Toggle checked={share.lifts !== false} label="Share best lifts" onChange={(value) => setShare("lifts", value)} />
          </Row>
          <Row subtitle="Your last 5 workouts with top sets" title="Recent workouts">
            <Toggle checked={share.workouts !== false} label="Share recent workouts" onChange={(value) => setShare("workouts", value)} />
          </Row>
          <Row subtitle="Lifts as a multiple of bodyweight" title="Bodyweight ratios">
            <Toggle checked={share.ratios !== false} label="Share bodyweight ratios" onChange={(value) => setShare("ratios", value)} />
          </Row>
        </Card>
      </Section>

      <Section>
        <Card>
          <Row chevron href="#/settings" icon={Settings2} title="Settings" />
        </Card>
      </Section>

      <ExercisePicker
        onClose={() => setPicking(false)}
        onPick={(exercise: any) => {
          saveSettings({ pinnedLift: exercise.id });
          notify(`Pinned ${exercise.name}`);
        }}
        open={picking}
        title="Pin a Lift"
      />
      {user ? <AccountSheet onClose={() => setEditing(false)} open={editing} /> : null}
    </Page>
  );
}
