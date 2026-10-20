# Lift

A workout tracker for your gym split. Log the sets, weight and reps for every exercise on each day of a rotating split, see last time's numbers next to every set, and watch your progress chart over time. It runs at **lift.zachhersick.com** and installs on the iPhone home screen like an app. You don't need the Apple Developer Program, and nothing expires.

## What it does

The look is dark-first and layered: glass surfaces, your accent color as soft gradients, a live shader behind the Up Next card and the Workout Complete screen, springy motion, animated numbers and activity rings. It's built with React, Tailwind, [motion](https://motion.dev), [Kokonut UI](https://kokonutui.com) components and [Paper Shaders](https://shaders.paper.design). Light mode and six accent colors are in Settings.

- **Today** shows the next day in your rotation (Push → Pull → Legs → Rest → repeat) on a live gradient, with last time's top set for each exercise and **Start**. Below that: **activity rings** for the week (workouts against your weekly goal, sets and volume against last week), **sets per muscle** against a 10–20 set band, a 3D **consistency** terrain of the last four months with your streak, your **bodyweight**, and recent PRs. Doing a different day than suggested just moves the rotation along.
- **Workout**: one card per exercise with `SET · PREVIOUS · LB · REPS · ✓`.
  - **Number pad.** Weight and reps use a docked keypad instead of the iPhone keyboard. **±** buttons step by your weight jump, **Next** goes weight → reps → next set → next exercise, and the barbell key opens the **plate calculator** (plates per side for your bar and the plates your gym has).
  - **Smart fill.** Empty boxes show last time's numbers (or the suggested weight when it's time to go up), and ✓ on an empty row logs exactly that. Tap **Previous** to copy last time into a row; **Add Set** copies the set above.
  - **Progression hint** (double progression): once every set reaches the top of the rep range, it suggests adding your weight jump.
  - **⋯ menu:** **Add Warm-up Sets** (empty bar, then 40/60/80%, rounded to loadable weights), **Superset with Next** (A1/A2 labels; the rest timer only starts after the last exercise in the group), rest time, a **note that sticks to the exercise** (seat height, grip) and shows every time, **History** (a quick look at the last sessions without leaving the workout), swap, reorder, remove.
  - Checking a set starts the **rest timer**, a Dynamic Island-style pill at the top (tap it for −15 / +15 / Skip) that keeps counting if iOS reloads the app. A set that beats your best turns gold with a particle burst. Tap the workout title to change its name, date, time or duration (for logging a workout you forgot). The screen stays on during a workout.
  - **Hold to finish** (or tap Finish). If you added, swapped, removed or reordered exercises, changed set counts or supersets, Lift offers to update that split day to match. Skipping an exercise for the day doesn't count.
- **History** has a calendar and every workout. A workout's summary compares volume, sets and time with your last session of the same day, and lists its PRs.
- **Progress** has a training-volume card (upper body, lower body, core; 7/30/90 days) and lists each exercise with a sparkline and trend. The exercise page swipes between charts of estimated 1RM (Epley), heaviest set, volume and reps over 1M/3M/1Y/All, with PRs, best reps at each weight, every session and the exercise's note. **Bodyweight** has its own chart with a 7-day average.
- **Split**: start from a template or build your own. Drag days and exercises to reorder, add rest days, set each exercise's sets, rep range, rest and supersets, and pick from ~100 built-in exercises or your own.
- **Settings**: sync, theme and accent color, weekly goal, lb/kg and weight jump, bar weight and available plates, default rest and sound, and JSON **Export/Import** backups.

## How data is stored

The phone is the source of truth while you train. Every tap is saved right away to IndexedDB on the device, so the app works with no signal at the gym. When you're signed in, changes sync to Postgres two seconds after you make them, plus on open, when you reconnect, and every minute. Each record (exercise, split day, workout, bodyweight, settings) merges on its own, and the newest edit wins. A device that finds the server database empty sends everything it has again.

Without signing in, the app still works fully, but only on that device.

## Run it locally

```sh
npm install
npm run dev        # http://localhost:4330, with the API built in
npm test
npm run build      # production build in dist/; npm run preview serves it
```

Locally it uses an in-memory database, **Sign in** skips GitHub, and the service worker is off so every reload gets the latest code (add `?sw` to the URL to test offline mode).

## Put it on lift.zachhersick.com (one-time)

Same setup as Jarvis: a Vercel project with Neon Postgres and GitHub sign-in for one account.

1. Push this folder to a private GitHub repo (for example `zachhersick/lift`).
2. In Vercel, **Add New → Project** and import the repo (framework preset **Other**; the build settings come from `vercel.json`). Under **Settings → Domains** add `lift.zachhersick.com`.
3. **Storage → Marketplace → Neon** on that project. This sets `DATABASE_URL`, and the table is created on first use.
4. Create a GitHub OAuth app (GitHub **Settings → Developer settings → OAuth Apps → New**):
   - Homepage URL: `https://lift.zachhersick.com`
   - Callback URL: `https://lift.zachhersick.com/api/auth/callback`
5. In Vercel **Settings → Environment Variables**, add these, then **Redeploy**:

| Variable | Value |
| --- | --- |
| `APP_URL` | `https://lift.zachhersick.com` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | from the OAuth app |
| `ALLOWED_GITHUB_ID` | your numeric GitHub id (`gh api user --jq .id`) |
| `SESSION_SECRET` | 32+ random characters (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) |

Sessions last 30 days. Every write needs the session cookie, a JSON body and an `Origin` header that matches `APP_URL`.

## Install on the iPhone

Open **lift.zachhersick.com** in Safari, sign in with GitHub, then **Share → Add to Home Screen**. It opens full screen with its own icon and keeps working offline. New deploys update it automatically the next time you open it twice.

The one iOS limit: a home-screen web app can't play a sound while it's in the background. The rest timer beeps if Lift is on screen, and since the screen stays on during a workout, that's normally the case.

## Layout

```
api/index.js                Vercel function; every /api/* request lands here
server/                     auth (GitHub OAuth, signed cookie), sync API, Neon/memory store
index.html, vite.config.ts  Vite entry; the config also mounts the API for dev/preview and builds the service worker
src/lib/                    model.js (pure, tested logic), store/db/sync (IndexedDB + signals + sync), keypad, timer, theme
src/components/kokonutui/   Kokonut UI components, restyled to the app's tokens
src/components/             kit (page frame, cards, rows, sheets), keypad, plates, islands, charts, shader hero, picker
src/pages/                  Today, Workout, History, Progress, Bodyweight, Split, Settings
src/styles.css              Tailwind v4 theme: dark/light tokens and accent colors
public/                     icons, manifest, theme-init.js (applies the theme before first paint)
tests/                      node --test
```
