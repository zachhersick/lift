// Settings: sync, appearance, weekly goal, units, barbell and plates, rest
// timer, backups and installing on the phone.
import { Check, Cloud, Download, LogIn, RefreshCw, Share, SquarePlus, Upload } from "lucide-react";
import { motion } from "motion/react";
import { useRef } from "react";
import { Card, Chip, Page, Row, Section, Segmented, spring, Stepper, Toggle, TopBar } from "@/components/kit";
import { ask } from "@/lib/dialogs";
import { BARS, defaultWeeklyGoal, PLATES } from "@/lib/model.js";
import { notify } from "@/lib/notify";
import { exportData, importRecords, pending, saveSettings, sessions, settings, splitDays } from "@/lib/store.js";
import { signOut, sync, syncNow } from "@/lib/sync.js";
import { TINTS } from "@/lib/theme.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";

const STATUS: Record<string, string> = {
  starting: "Checking…",
  syncing: "Syncing…",
  synced: "Up to date",
  offline: "Offline. Changes sync when you're back.",
  signedOut: "Only on this device",
  error: "Couldn't sync. Retrying soon."
};
const STEPS: Record<string, number[]> = { lb: [2.5, 5, 10], kg: [1, 2.5, 5] };

export function Settings() {
  const s = useValue(settings) as any;
  const state = useValue(sync) as any;
  const waiting = useValue(pending) as number;
  const list = useValue(sessions) as any[];
  const days = useValue(splitDays) as any[];
  const file = useRef<HTMLInputElement>(null);
  const autoGoal = defaultWeeklyGoal(days);

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
      <TopBar title="Settings" />

      <Section footer={state.user ? "Workouts sync a couple of seconds after each change." : "Sign in to back up your workouts and use them on your computer too."} title="Sync">
        <Card className="divide-y divide-border">
          <Row
            icon={Cloud}
            iconClass={state.status === "synced" ? "bg-success/15 text-success" : state.status === "error" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}
            subtitle={`${STATUS[state.status] || ""}${state.status === "synced" && state.lastSync ? ` · ${format.ago(state.lastSync)}` : ""}${waiting ? ` · ${format.plural(waiting, "change")} waiting` : ""}`}
            title={state.user ? state.user.login : "Not signed in"}
          />
          {state.user ? (
            <>
              <Row disabled={state.status === "syncing"} icon={RefreshCw} onClick={syncNow} title="Sync now" tone="action" />
              <Row onClick={signOut} title="Sign out" tone="danger" />
            </>
          ) : (
            <Row href="/api/auth/login" icon={LogIn} title="Sign in with GitHub" tone="action" />
          )}
        </Card>
      </Section>

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

      <Section footer="Used by the plate calculator and barbell warm-ups. Turn off plates your gym doesn't have." title="Barbell">
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

      <Section footer="Lift then opens full screen from your home screen and works offline." title="Install on iPhone">
        <Card className="divide-y divide-border">
          <Row icon={Share} subtitle="In Safari, tap the Share button" title="1. Share" />
          <Row icon={SquarePlus} subtitle="Then open Lift from your home screen" title="2. Add to Home Screen" />
        </Card>
      </Section>
    </Page>
  );
}
