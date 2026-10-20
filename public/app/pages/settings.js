// Settings: sync and sign-in, units and timer defaults, backup and restore,
// and how to install the app on the phone.
import { useRef } from "preact/hooks";
import { html } from "../html.js";
import { Icon } from "../icons.js";
import { ask, Header, Segmented, Toggle, toast } from "../ui.js";
import { exportData, importRecords, pending, saveSettings, sessions, settings } from "../store.js";
import { signOut, sync, syncNow } from "../sync.js";
import * as format from "../format.js";

const STATUS = {
  starting: "Checking…",
  syncing: "Syncing…",
  synced: "Up to date",
  offline: "Offline. Changes are saved on this device and sync when you're back online.",
  signedOut: "Not signed in. Workouts are only on this device.",
  error: "Couldn't sync. Will retry."
};

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
      if (data?.app !== "lift" || !Array.isArray(data.records)) throw new Error("Not a Lift backup.");
      if (!(await ask({ title: "Import this backup?", message: `${format.plural(data.records.length, "record")} from ${format.date(Date.parse(data.exportedAt) || Date.now())}. Newer copies replace older ones; nothing newer on this device is overwritten.`, confirm: "Import" }))) return;
      const count = await importRecords(data.records);
      toast(count ? `Imported ${format.plural(count, "record")}` : "Everything was already up to date");
    } catch (error) {
      toast(error.message || "That file couldn't be read.");
    }
  };

  return html`
    <div class="page">
      <${Header} title="Settings" />

      <section class="section">
        <h2 class="section-title">Sync</h2>
        <div class="card form">
          <div class="sync-status">
            <span class=${`sync-dot ${state.status}`}></span>
            <div class="grow">
              <strong>${state.user ? `Signed in as ${state.user.login}` : "This device only"}</strong>
              <span>${STATUS[state.status] || ""}${state.status === "synced" && state.lastSync ? ` · ${format.ago(state.lastSync)}` : ""}${pending.value ? ` · ${format.plural(pending.value, "change")} waiting` : ""}</span>
            </div>
          </div>
          ${state.user ? html`
            <div class="row gap">
              <button class="btn secondary grow" onClick=${syncNow} disabled=${state.status === "syncing"}><${Icon} name="sync" size=${18} /> Sync now</button>
              <button class="btn ghost grow" onClick=${signOut}>Sign out</button>
            </div>` : html`<a class="btn primary block" href="/api/auth/login"><${Icon} name="github" size=${18} /> Sign in with GitHub</a>`}
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Weights</h2>
        <div class="card form">
          <div class="field-row"><span>Unit</span><${Segmented} small value=${s.unit} onChange=${(unit) => saveSettings({ unit })} options=${[{ value: "lb", label: "lb" }, { value: "kg", label: "kg" }]} /></div>
          <div class="field-row"><span>Weight jump</span><${Segmented} small value=${s.step} onChange=${(step) => saveSettings({ step })} options=${[2.5, 5, 10].map((v) => ({ value: v, label: format.weight(v) }))} /></div>
          <p class="muted small">How much the progression hint adds once you hit the top of your rep range.</p>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Rest timer</h2>
        <div class="card form">
          <div class="field-row"><span>Default rest</span><${Segmented} small value=${s.defaultRest} onChange=${(defaultRest) => saveSettings({ defaultRest })} options=${[60, 90, 120, 180].map((v) => ({ value: v, label: format.rest(v) }))} /></div>
          <div class="field-row"><span>Sound when rest ends</span><${Toggle} checked=${s.sound} label="Timer sound" onChange=${(sound) => saveSettings({ sound })} /></div>
          <p class="muted small">Each exercise can have its own rest time. The screen stays on during a workout.</p>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Your data</h2>
        <div class="card form">
          <p class="muted small">${format.plural(sessions.value.length, "workout")} logged. Export a backup file any time.</p>
          <div class="row gap">
            <button class="btn secondary grow" onClick=${download}><${Icon} name="download" size=${18} /> Export</button>
            <button class="btn secondary grow" onClick=${() => file.current?.click()}><${Icon} name="upload" size=${18} /> Import</button>
          </div>
          <input ref=${file} type="file" accept="application/json,.json" hidden onChange=${upload} />
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Install on iPhone</h2>
        <div class="card">
          <ol class="steps">
            <li>Open this site in <strong>Safari</strong>.</li>
            <li>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</li>
            <li>Open Lift from the home screen. It runs full screen and works offline.</li>
          </ol>
        </div>
      </section>
      <p class="muted center small pad">Lift · built for progressive overload</p>
    </div>`;
}
