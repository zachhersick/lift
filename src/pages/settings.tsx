// Settings: your account (and deleting it), appearance, weekly goal,
// nutrition, the ChatGPT connector, units, barbell and plates, rest timer,
// backups, installing on the phone, and the privacy policy and terms.
import { Check, Cloud, Copy, Download, FileText, Flag, LifeBuoy, LogIn, RefreshCw, Share, Shield, Sparkles, SquarePlus, Trash2, Upload, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Card, Chip, Page, Row, Section, Segmented, spring, Stepper, Toggle, TopBar } from "@/components/kit";
import { api, apiOrigin, native, postJson, signIn } from "@/lib/api.js";
import { ask } from "@/lib/dialogs";
import { BARS, defaultWeeklyGoal, PLATES } from "@/lib/model.js";
import { notify } from "@/lib/notify";
import { exportData, importRecords, meals, pending, saveSettings, sessions, settings, splitDays, targets } from "@/lib/store.js";
import { deleteAccount, signOut, sync, syncNow } from "@/lib/sync.js";
import { TINTS } from "@/lib/theme.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { GOAL_LABEL } from "@/pages/nutrition";

const STATUS: Record<string, string> = {
  starting: "Checking…",
  syncing: "Syncing…",
  synced: "Up to date",
  offline: "Offline. Changes sync when you're back.",
  signedOut: "Only on this device",
  error: "Couldn't sync. Retrying soon."
};
const STEPS: Record<string, number[]> = { lb: [2.5, 5, 10], kg: [1, 2.5, 5] };

const PROVIDERS: Record<string, string> = { apple: "Apple", google: "Google", github: "GitHub", dev: "a dev account" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REASONS: Record<string, string> = { name: "Offensive name", harassment: "Harassment", spam: "Spam", other: "Something else" };

async function adminCall(path: string, body?: object) {
  const response = await (body ? postJson(path, body) : api(path, { cache: "no-store" }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "That didn't work. Try again.");
  return data;
}

// Admins only: people reported by other members. Remove someone from People
// below to sign them out for good.
function Reports() {
  const [reports, setReports] = useState<any[] | null>(null);
  const load = (path: string, body?: object) =>
    adminCall(path, body)
      .then((data) => setReports(data.reports))
      .catch((error) => notify(error.message, { status: "error" }));
  useEffect(() => {
    load("/api/admin/reports");
  }, []);
  if (!reports?.length) return null;
  return (
    <Section footer="Dismiss a report once you've dealt with it. Removing someone from People signs them out." title="Reports">
      <Card className="divide-y divide-border">
        {reports.map((report) => (
          <Row
            icon={Flag}
            iconClass="bg-destructive/15 text-destructive"
            key={report.id}
            subtitle={[report.reported, `by @${report.reporterUsername || report.reporter}`, report.note, format.ago(report.createdAt)].filter(Boolean).join(" · ")}
            title={`@${report.reportedUsername || "?"} · ${REASONS[report.reason] || report.reason}`}
          >
            <button className="h-8 rounded-full bg-muted px-3 text-[13.5px] font-medium text-muted-foreground active:bg-accent" onClick={() => load("/api/admin/reports/dismiss", { id: report.id })} type="button">
              Dismiss
            </button>
          </Row>
        ))}
      </Card>
    </Section>
  );
}

// Admins only: the invite list. Invited people sign in with Google or GitHub
// using that email; VIPs also get the weekly AI review.
function People() {
  const me = (useValue(sync) as any).user;
  const [users, setUsers] = useState<any[] | null>(null);
  const [email, setEmail] = useState("");
  const [vip, setVip] = useState(false);
  const [busy, setBusy] = useState(false);

  const call = async (path: string, body?: object) => setUsers((await adminCall(path, body)).users);
  const run = async (work: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await work();
      if (done) notify(done);
    } catch (error: any) {
      notify(error.message || "That didn't work. Try again.", { status: "error" });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    run(() => call("/api/admin/users"));
  }, []);

  const invite = () =>
    run(async () => {
      await call("/api/admin/users", { email, vip });
      setEmail("");
      setVip(false);
    }, `Added ${email.trim().toLowerCase()}`);
  const remove = async (user: any) => {
    if (!(await ask({ title: `Remove ${user.email}?`, message: "They're signed out and can't sign in again. Their data is kept, so adding them back restores it.", confirm: "Remove", danger: true }))) return;
    run(() => call("/api/admin/users/remove", { email: user.email }), `Removed ${user.email}`);
  };

  return (
    <Section footer={`Invited people sign in at ${location.host} with Google or GitHub using that email. Lift doesn't email them, so send them the link. VIPs also get the weekly AI review once they've logged 3 lifts that week.`} title="People">
      <Card className="divide-y divide-border">
        <Row title="Email">
          <input
            aria-label="Email to invite"
            autoCapitalize="none"
            autoComplete="off"
            className="w-52 bg-transparent text-right text-[15.5px] text-muted-foreground outline-none"
            inputMode="email"
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder="friend@example.com"
            type="email"
            value={email}
          />
        </Row>
        <Row subtitle="Weekly AI review" title="VIP">
          <Toggle checked={vip} label="Invite as VIP" onChange={setVip} />
        </Row>
        <Row disabled={busy || !EMAIL.test(email.trim())} icon={UserPlus} onClick={invite} title="Add to invite list" tone="action" />
      </Card>
      {users ? (
        <Card className="divide-y divide-border">
          {users.map((user) => (
            <Row
              key={user.email}
              subtitle={[user.name ? user.email : "", user.admin ? "Admin" : user.lastSeenAt ? `Last seen ${format.ago(user.lastSeenAt)}` : "Hasn't signed in yet"].filter(Boolean).join(" · ")}
              title={`${user.name || user.email}${user.email === me?.email ? " (you)" : ""}`}
            >
              {user.admin ? (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[12px] font-semibold text-primary">VIP</span>
              ) : (
                <>
                  <Toggle checked={user.vip} label={`VIP for ${user.email}`} onChange={(value) => run(() => call("/api/admin/users", { email: user.email, vip: value }))} />
                  <button aria-label={`Remove ${user.email}`} className="grid size-9 place-items-center rounded-full text-destructive active:bg-accent" onClick={() => remove(user)} type="button">
                    <Trash2 className="size-[18px]" />
                  </button>
                </>
              )}
            </Row>
          ))}
        </Card>
      ) : null}
    </Section>
  );
}

export function Settings() {
  const s = useValue(settings) as any;
  const state = useValue(sync) as any;
  const waiting = useValue(pending) as number;
  const list = useValue(sessions) as any[];
  const days = useValue(splitDays) as any[];
  const file = useRef<HTMLInputElement>(null);
  const autoGoal = defaultWeeklyGoal(days);
  const t = useValue(targets) as any;
  const mealList = useValue(meals) as any[];
  const lastChat = mealList.filter((m) => m.source === "chatgpt").sort((a, b) => (b.loggedAt || b.updatedAt) - (a.loggedAt || a.updatedAt))[0];
  const connectorUrl = `${apiOrigin}/api/mcp`;

  const remove = async () => {
    const confirmed = await ask({
      title: "Delete your account?",
      message: "This permanently deletes your workouts, meals, bodyweight, friends and everything else in your Lift account, on the server and on this device. Export a backup first if you want a copy.",
      confirm: "Delete account",
      danger: true
    });
    if (!confirmed) return;
    try {
      await deleteAccount();
    } catch (error: any) {
      notify(error.message, { status: "error" });
    }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lift-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!chosen) return;
    try {
      const data = JSON.parse(await chosen.text());
      if (data?.app !== "lift" || !Array.isArray(data.records)) throw new Error("That isn't a Lift backup");
      if (!(await ask({ title: "Import backup?", message: `${format.plural(data.records.length, "record")} from ${format.date(Date.parse(data.exportedAt) || Date.now())}. Newer copies replace older ones; nothing newer on this device is overwritten.`, confirm: "Import" }))) return;
      const count = await importRecords(data.records);
      notify(count ? `Imported ${format.plural(count, "record")}` : "Already up to date");
    } catch (error: any) {
      notify(error.message || "That file couldn't be read", { status: "error" });
    }
  };

  const togglePlate = (plate: number) => {
    const has = s.plates.includes(plate);
    if (has && s.plates.length === 1) return;
    saveSettings({ plates: has ? s.plates.filter((p: number) => p !== plate) : [...s.plates, plate].sort((a: number, b: number) => b - a) });
  };

  return (
    <Page>
      <TopBar backLabel="Profile" backTo="profile" title="Settings" />

      <Section
        footer={state.user ? "Workouts sync a couple of seconds after each change. Signing out keeps your data on this device for when you sign back in." : "Sign in to back up your workouts and use them on other devices."}
        title="Account"
      >
        <Card className="divide-y divide-border">
          <Row
            icon={Cloud}
            iconClass={state.status === "synced" ? "bg-success/15 text-success" : state.status === "error" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}
            subtitle={`${STATUS[state.status] || ""}${state.status === "synced" && state.lastSync ? ` · ${format.ago(state.lastSync)}` : ""}${waiting ? ` · ${format.plural(waiting, "change")} waiting` : ""}`}
            title={state.user ? state.user.email : "Not signed in"}
          />
          {state.user ? (
            <>
              <Row title="Membership" value={state.user.admin ? "Admin" : state.user.vip ? "VIP" : "Member"} />
              <Row disabled={state.status === "syncing"} icon={RefreshCw} onClick={syncNow} title="Sync now" tone="action" />
              <Row onClick={signOut} title="Sign out" tone="danger" />
              {state.user.admin ? null : <Row icon={Trash2} iconClass="bg-destructive/15 text-destructive" onClick={remove} title="Delete account" tone="danger" />}
            </>
          ) : state.providers?.length ? (
            state.providers.map((provider: string) => <Row icon={LogIn} key={provider} onClick={() => signIn(provider)} title={`Continue with ${PROVIDERS[provider] || provider}`} tone="action" />)
          ) : (
            <Row icon={LogIn} onClick={() => signIn()} title="Sign in" tone="action" />
          )}
        </Card>
      </Section>

      {state.user?.admin ? (
        <>
          <Reports />
          <People />
        </>
      ) : null}

      <Section title="Appearance">
        <Card className="flex flex-col gap-5 p-4">
          <Segmented
            label="Theme"
            onChange={(theme) => saveSettings({ theme })}
            options={[
              { value: "system", label: "Auto" },
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" }
            ]}
            value={s.theme}
          />
          <div className="flex flex-col gap-3">
            <span className="text-[13px] font-medium text-muted-foreground">Accent</span>
            <div className="flex justify-between" role="radiogroup">
              {TINTS.map((tint: any) => {
                const on = s.tint === tint.id;
                return (
                  <button
                    aria-checked={on}
                    aria-label={tint.label}
                    className="relative grid size-11 place-items-center"
                    key={tint.id}
                    onClick={() => saveSettings({ tint: tint.id })}
                    role="radio"
                    type="button"
                  >
                    {on ? <motion.span className="absolute inset-0 rounded-full ring-2 ring-foreground/70" layoutId="tint-ring" transition={spring} /> : null}
                    <span className="grid size-8 place-items-center rounded-full text-white shadow-md" style={{ background: `linear-gradient(135deg, ${tint.colors[0]}, ${tint.colors[1]})` }}>
                      {on ? <Check className="size-4" strokeWidth={3} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      </Section>

      <Section footer={s.weeklyGoal ? "Your weekly workouts ring fills at this many." : `Automatic: your rotation fits ${autoGoal} training days a week.`} title="Weekly goal">
        <Card className="divide-y divide-border">
          <Row title="Workouts per week">
            <Stepper label="workouts per week" max={14} min={1} onChange={(weeklyGoal) => saveSettings({ weeklyGoal })} value={s.weeklyGoal || autoGoal} />
          </Row>
          {s.weeklyGoal ? <Row onClick={() => saveSettings({ weeklyGoal: null })} title="Use my rotation" tone="action" /> : null}
        </Card>
      </Section>

      <Section
        footer={`${s.calorieTarget ? "Calories are set by you." : `Calories follow your goal: ${s.goal === "cut" ? "20% under" : s.goal === "leanBulk" ? "250 over" : "at"} the maintenance Lift measures from your log and weigh-ins.`} ${s.proteinTarget ? "" : `Protein is ${s.unit === "kg" ? "2.2 g per kg" : "1 g per lb"} of bodyweight.`}`}
        title="Nutrition"
      >
        <Card className="divide-y divide-border">
          <Row title="Goal">
            <Segmented label="Nutrition goal" onChange={(goal) => saveSettings({ goal })} options={Object.entries(GOAL_LABEL).map(([value, label]) => ({ value, label }))} size="sm" value={t.goal} />
          </Row>
          <Row subtitle={s.calorieTarget ? "Set by you" : "Automatic"} title="Calories">
            <Stepper format={(v) => v.toLocaleString()} label="calories" max={6000} min={1200} onChange={(calorieTarget) => saveSettings({ calorieTarget })} step={50} value={t.calories || 2500} />
          </Row>
          <Row subtitle={s.proteinTarget ? "Set by you" : "Automatic"} title="Protein (g)">
            <Stepper label="grams of protein" max={400} min={40} onChange={(proteinTarget) => saveSettings({ proteinTarget })} step={5} value={t.protein || 150} />
          </Row>
          {s.calorieTarget || s.proteinTarget ? <Row onClick={() => saveSettings({ calorieTarget: null, proteinTarget: null })} title="Use automatic targets" tone="action" /> : null}
        </Card>
      </Section>

      <Section
        footer="In ChatGPT open Settings → Apps & Connectors → Advanced, turn on Developer mode, then Create a connector: paste this URL, choose OAuth and approve with your GitHub account. Then ask your Health chat to log meals to Lift."
        title="ChatGPT"
      >
        <Card className="divide-y divide-border">
          <Row
            icon={Sparkles}
            label="Copy connector URL"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(connectorUrl);
                notify("Connector URL copied");
              } catch {
                notify("Couldn't copy. Select the URL instead", { status: "error" });
              }
            }}
            subtitle={<span className="select-all">{connectorUrl}</span>}
            title="Connector URL"
            value={<Copy className="size-4" strokeWidth={2.2} />}
          />
          <Row subtitle={lastChat ? `${lastChat.name} · ${format.ago(lastChat.loggedAt || lastChat.updatedAt)}` : "Nothing yet"} title="Last meal from ChatGPT" />
        </Card>
      </Section>

      <Section footer="The progression hint adds this once you reach the top of your rep range. The ± keys use it too." title="Weights">
        <Card className="divide-y divide-border">
          <Row title="Unit">
            <Segmented label="Unit" onChange={(unit) => unit !== s.unit && saveSettings({ unit, step: unit === "kg" ? 2.5 : 5, barWeight: null, plates: null })} options={[{ value: "lb", label: "lb" }, { value: "kg", label: "kg" }]} size="sm" value={s.unit} />
          </Row>
          <Row title="Weight jump">
            <Segmented label="Weight jump" onChange={(step) => saveSettings({ step })} options={STEPS[s.unit].map((v) => ({ value: v, label: format.weight(v) }))} size="sm" value={s.step} />
          </Row>
        </Card>
      </Section>

      <Section footer="Used by the plate calculator and barbell warm-ups. Plate-loaded machines use the same plates with no bar. Turn off plates your gym doesn't have." title="Barbell">
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15.5px] font-medium">Bar</span>
            <Segmented label="Bar weight" onChange={(barWeight) => saveSettings({ barWeight })} options={BARS[s.unit].map((v: number) => ({ value: v, label: format.weight(v) }))} size="sm" value={s.barWeight} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[15.5px] font-medium">Plates ({s.unit})</span>
            <div className="flex flex-wrap gap-2">
              {PLATES[s.unit].map((plate: number) => (
                <Chip key={plate} on={s.plates.includes(plate)} onClick={() => togglePlate(plate)}>
                  {format.weight(plate)}
                </Chip>
              ))}
            </div>
          </div>
        </Card>
      </Section>

      <Section footer="Each exercise can have its own rest time. The screen stays on during a workout." title="Rest timer">
        <Card className="divide-y divide-border">
          <Row title="Default">
            <Segmented label="Default rest" onChange={(defaultRest) => saveSettings({ defaultRest })} options={[60, 90, 120, 180].map((v) => ({ value: v, label: format.rest(v) }))} size="sm" value={s.defaultRest} />
          </Row>
          <Row title="Sound when done">
            <Toggle checked={s.sound} label="Timer sound" onChange={(sound) => saveSettings({ sound })} />
          </Row>
        </Card>
      </Section>

      <Section footer={`${format.plural(list.length, "workout")} logged.`} title="Your data">
        <Card className="divide-y divide-border">
          <Row chevron icon={Download} onClick={download} title="Export backup" />
          <Row chevron icon={Upload} onClick={() => file.current?.click()} title="Import backup" />
        </Card>
        <input accept="application/json,.json" hidden onChange={upload} ref={file} type="file" />
      </Section>

      {native ? null : (
        <Section footer="Lift then opens full screen from your home screen and works offline." title="Install on iPhone">
          <Card className="divide-y divide-border">
            <Row icon={Share} subtitle="In Safari, tap the Share button" title="1. Share" />
            <Row icon={SquarePlus} subtitle="Then open Lift from your home screen" title="2. Add to Home Screen" />
          </Card>
        </Section>
      )}

      <Section footer="Lift's coaching is general fitness information, not medical advice." title="About">
        <Card className="divide-y divide-border">
          <Row chevron href="/privacy.html" icon={Shield} title="Privacy policy" />
          <Row chevron href="/terms.html" icon={FileText} title="Terms of use" />
          <Row chevron href="/support.html" icon={LifeBuoy} title="Support" />
        </Card>
      </Section>
    </Page>
  );
}
