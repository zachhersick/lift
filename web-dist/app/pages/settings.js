// Settings: sync, appearance, units, barbell and plates, rest timer, backups.
import { useRef } from "preact/hooks";
import { html } from "../html.js";
import { Icon } from "../icons.js";
import { ask, Cell, Group, NavBar, Segmented, Switch, toast } from "../ui.js";
import { exportData, importRecords, pending, saveSettings, sessions, settings } from "../store.js";
import { signOut, sync, syncNow } from "../sync.js";
import { BARS, PLATES } from "../model.js";
import { TINTS } from "../theme.js";
import * as format from "../format.js";

const STATUS = {
  starting: "Checking…",
  syncing: "Syncing…",
  synced: "Up to date",
  offline: "Offline. Changes sync when you reconnect.",
  signedOut: "Only on this device",
  error: "Couldn't sync. Retrying soon."
};

const STEPS = { lb: [2.5, 5, 10], kg: [1, 2.5, 5] };

export function Settings() {
  const s = settings.value;
  const state = sync.value;
  const file = useRef(null);

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

  const upload = async (event) => {
    const chosen = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!chosen) return;
    try {
      const data = JSON.parse(await chosen.text());
      if (data?.app !== "lift" || !Array.isArray(data.records)) throw new Error("That isn't a Lift backup.");
      if (!(await ask({ title: "Import Backup?", message: `${format.plural(data.records.length, "record")} from ${format.date(Date.parse(data.exportedAt) || Date.now())}. Newer copies replace older ones; nothing newer on this device is overwritten.`, confirm: "Import" }))) return;
      const count = await importRecords(data.records);
      toast(count ? `Imported ${format.plural(count, "record")}` : "Already up to date");
    } catch (error) {
      toast(error.message || "That file couldn't be read.", { icon: "x" });
    }
  };

  const setUnit = (unit) => unit !== s.unit && saveSettings({ unit, step: unit === "kg" ? 2.5 : 5, barWeight: null, plates: null });
  const togglePlate = (plate) => {
    const has = s.plates.includes(plate);
    if (has && s.plates.length === 1) return;
    saveSettings({ plates: has ? s.plates.filter((p) => p !== plate) : [...s.plates, plate].sort((a, b) => b - a) });
  };

  return html`
    <div class="page">
      <${NavBar} title="Settings" />

      <${Group} header="Sync" footer=${state.user ? "Workouts sync to lift.zachhersick.com a couple of seconds after each change." : "Sign in to back up your workouts and use them on your computer too."}>
        <${Cell} icon="cloud" iconBg=${state.status === "synced" ? "var(--green)" : state.status === "error" ? "var(--red)" : "var(--label-2)"}
          title=${state.user ? state.user.login : "Not signed in"}
          subtitle=${`${STATUS[state.status] || ""}${state.status === "synced" && state.lastSync ? ` · ${format.ago(state.lastSync)}` : ""}${pending.value ? ` · ${format.plural(pending.value, "change")} waiting` : ""}`} />
        ${state.user
          ? html`<${Cell} title="Sync Now" action onClick=${syncNow} disabled=${state.status === "syncing"} /><${Cell} title="Sign Out" destructive onClick=${signOut} />`
          : html`<${Cell} title="Sign In with GitHub" action href="/api/auth/login" />`}
      </${Group}>

      <${Group} header="Appearance">
        <${Cell} title="Theme"><${Segmented} label="Theme" value=${s.theme} onChange=${(theme) => saveSettings({ theme })} options=${[{ value: "system", label: "Auto" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} /></${Cell}>
        <div class="cell-block">
          <div class="cell-title" style="margin-bottom:10px">Accent Color</div>
          <div class="swatches" role="radiogroup" aria-label="Accent color">
            ${TINTS.map((tint) => html`<button class=${`swatch ${s.tint === tint.id ? "on" : ""}`} style=${`--c:${tint.light}`} role="radio" aria-checked=${s.tint === tint.id} aria-label=${tint.label} onClick=${() => saveSettings({ tint: tint.id })}></button>`)}
          </div>
        </div>
      </${Group}>

      <${Group} header="Weights" footer="How much the progression hint adds once you reach the top of your rep range. The ± keys on the number pad use it too.">
        <${Cell} title="Unit"><${Segmented} label="Unit" value=${s.unit} onChange=${setUnit} options=${[{ value: "lb", label: "lb" }, { value: "kg", label: "kg" }]} /></${Cell}>
        <${Cell} title="Weight Jump"><${Segmented} label="Weight jump" value=${s.step} onChange=${(step) => saveSettings({ step })} options=${STEPS[s.unit].map((v) => ({ value: v, label: format.weight(v) }))} /></${Cell}>
      </${Group}>

      <${Group} header="Barbell" footer="Used by the plate calculator and barbell warm-ups. Turn off plates your gym doesn't have.">
        <${Cell} title="Bar"><${Segmented} label="Bar weight" value=${s.barWeight} onChange=${(barWeight) => saveSettings({ barWeight })} options=${BARS[s.unit].map((v) => ({ value: v, label: format.weight(v) }))} /></${Cell}>
        <div class="cell-block">
          <div class="cell-title" style="margin-bottom:10px">Plates (${s.unit})</div>
          <div class="chip-grid">${PLATES[s.unit].map((plate) => html`<button class=${`chip ${s.plates.includes(plate) ? "on" : ""}`} aria-pressed=${s.plates.includes(plate)} onClick=${() => togglePlate(plate)}>${format.weight(plate)}</button>`)}</div>
        </div>
      </${Group}>

      <${Group} header="Rest Timer" footer="Each exercise can have its own rest time. The screen stays on during a workout.">
        <${Cell} title="Default"><${Segmented} label="Default rest" value=${s.defaultRest} onChange=${(defaultRest) => saveSettings({ defaultRest })} options=${[60, 90, 120, 180].map((v) => ({ value: v, label: format.rest(v) }))} /></${Cell}>
        <${Cell} title="Sound When Done"><${Switch} checked=${s.sound} label="Timer sound" onChange=${(sound) => saveSettings({ sound })} /></${Cell}>
      </${Group}>

      <${Group} header="Data" footer=${`${format.plural(sessions.value.length, "workout")} logged.`}>
        <${Cell} icon="download" iconBg="var(--tint)" title="Export Backup" onClick=${download} chevron />
        <${Cell} icon="upload" iconBg="var(--tint)" title="Import Backup" onClick=${() => file.current?.click()} chevron />
      </${Group}>
      <input ref=${file} type="file" accept="application/json,.json" hidden onChange=${upload} />

      <${Group} header="Install on iPhone" footer="Lift then opens full screen from your home screen and works offline.">
        <${Cell} title="1. Open this site in Safari" />
        <${Cell} title="2. Tap Share, then Add to Home Screen" />
      </${Group}>
    </div>`;
}
