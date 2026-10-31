// Profile: your stats and badges, friends (requests by email, accepted on
// the other side) and what friends can see. Settings is one row down.
import { Check, LogIn, Settings2, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BadgeGrid, ProfileHeader } from "@/components/badges";
import { Card, Page, Row, Section, Toggle, TopBar } from "@/components/kit";
import { notify } from "@/lib/notify";
import { social } from "@/lib/social.js";
import { badgeList, profile, saveSettings, settings } from "@/lib/store.js";
import { sync } from "@/lib/sync.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Person = { email: string; name: string; since: number };
type Lists = { friends: Person[]; incoming: Person[]; outgoing: Person[] };

function Friends() {
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
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

  const add = async () => {
    const to = email.trim().toLowerCase();
    if (await run("/api/friends/request", { email: to }, `Request sent to ${to}`)) setEmail("");
  };

  return (
    <Section footer="Add people who are on this Lift by the email they sign in with. They see your request here and accept it." title="Friends">
      {lists?.incoming.length ? (
        <Card className="divide-y divide-border">
          {lists.incoming.map((person) => (
            <Row key={person.email} subtitle={`${person.email} · wants to be friends`} title={person.name}>
              <button aria-label={`Decline ${person.name}`} className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground active:bg-accent" disabled={busy} onClick={() => run("/api/friends/remove", { email: person.email })} type="button">
                <X className="size-[18px]" strokeWidth={2.4} />
              </button>
              <button aria-label={`Accept ${person.name}`} className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground active:opacity-80" disabled={busy} onClick={() => run("/api/friends/accept", { email: person.email }, `You and ${person.name} are friends`)} type="button">
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
        {lists?.friends.map((person) => <Row chevron href={`#/friend/${encodeURIComponent(person.email)}`} key={person.email} subtitle={`Friends since ${format.date(person.since, { month: "short", day: "numeric", year: "numeric" })}`} title={person.name} />)}
        {lists?.outgoing.map((person) => (
          <Row key={person.email} subtitle={`${person.email} · request sent`} title={person.name}>
            <button className="h-8 rounded-full bg-muted px-3 text-[13.5px] font-medium text-muted-foreground active:bg-accent" disabled={busy} onClick={() => run("/api/friends/remove", { email: person.email }, "Request cancelled")} type="button">
              Cancel
            </button>
          </Row>
        ))}
        <Row title="Email">
          <input
            aria-label="Friend's email"
            autoCapitalize="none"
            autoComplete="off"
            className="w-52 bg-transparent text-right text-[15.5px] text-muted-foreground outline-none"
            inputMode="email"
            onChange={(e) => setEmail(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && EMAIL.test(email.trim()) && add()}
            placeholder="friend@example.com"
            type="email"
            value={email}
          />
        </Row>
        <Row disabled={busy || !EMAIL.test(email.trim())} icon={UserPlus} onClick={add} title="Send friend request" tone="action" />
      </Card>
    </Section>
  );
}

export function ProfilePage() {
  const state = useValue(sync) as any;
  const s = useValue(settings) as any;
  const mine = useValue(profile) as any;
  const list = useValue(badgeList) as any[];
  const user = state.user;
  const name = user?.name || user?.email?.split("@")[0] || "You";
  const share = s.share || {};
  const setShare = (key: string, value: boolean) => saveSettings({ share: { ...share, [key]: value } });
  const earned = list.filter((badge) => badge.earnedAt).length;
  // Earned first (newest first), then the closest to earning.
  const ordered = [...list].sort((a, b) => (b.earnedAt || 0) - (a.earnedAt || 0) || (b.progress || 0) - (a.progress || 0));

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
      <ProfileHeader detail={user ? user.email : "Not signed in"} name={name} summary={mine} />

      <Section action={`${earned} of ${list.length}`} title="Badges">
        <BadgeGrid badges={ordered} />
      </Section>

      {user ? (
        <Friends />
      ) : (
        <Section footer="Sign in to add friends and compare lifts." title="Friends">
          <Card>
            <Row href="#/settings" icon={LogIn} title="Sign in in Settings" tone="action" />
          </Card>
        </Section>
      )}

      <Section footer="Friends always see your badges, streak and workout counts. They never see your bodyweight, meals or notes; ratios show lifts as a multiple of bodyweight without the weight itself." title="What friends see">
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
    </Page>
  );
}
