# Lift

A workout tracker for your gym split. Log the sets, weight and reps for every exercise on each day of a rotating split, see last time's numbers next to every set, and watch your progress chart over time. It runs at **lift.zachhersick.com** and installs on the iPhone home screen like an app. You don't need the Apple Developer Program, and nothing expires.

## What it does

- **Today** shows the next day in your rotation (Push → Pull → Legs → Rest → repeat), with **Start**, a way to pick a different day, this week's workouts/sets/volume and recent PRs. Rest days get a **Done resting** button. Doing a different day than suggested just moves the cycle along.
- **Workout**: one card per exercise with `SET · PREVIOUS · LB · REPS · ✓`. Empty boxes show last time's numbers greyed out, and tapping ✓ on an empty row logs exactly that. Each exercise gets a progression hint (double progression: once every set reaches the top of the rep range, it suggests adding your weight jump). Checking a set starts that exercise's rest timer (sound when it ends), and a set that beats your previous best gets a trophy. Tap a set number to mark it as a warm-up, drop set or failure set, or to delete it. The **⋯** menu reorders, swaps, sets rest time, adds a note or removes the exercise. The screen stays on during a workout, and if the app is closed partway, the workout picks up where you left off.
- **History** has a month calendar and every workout. Open one to see its summary and PRs, then edit or delete it.
- **Progress** lists each exercise with a trend (up/holding/down) and a sparkline. The exercise page charts estimated 1RM (Epley), heaviest set, volume or reps over 1M/3M/1Y/All, and shows your PRs, best reps at each weight and every session.
- **Split**: start from the Push/Pull/Legs, Upper/Lower or Full-body template, or build your own. You can rename and reorder days, add rest days, and pick exercises from ~100 built-ins or create custom ones, each with target sets, rep range and rest.
- **Settings**: sync status, lb/kg label, weight jump (2.5/5/10), default rest, timer sound, and JSON **Export/Import** backups.

## How data is stored

The phone is the source of truth while you train. Every tap is saved right away to IndexedDB on the device, so the app works with no signal at the gym. When you're signed in, changes sync to Postgres two seconds after you make them, plus on open, when you reconnect, and every minute. Each record (exercise, split day, workout, settings) merges on its own, and the newest edit wins. A device that finds the server database empty sends everything it has again.

Without signing in, the app still works fully, but only on that device.

## Run it locally

```sh
npm install
npm start          # builds web-dist/ and serves http://localhost:4330
npm test
```

Locally it uses an in-memory database, and **Sign in** skips GitHub.

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
api/index.js          Vercel function; every /api/* request lands here
server/               auth (GitHub OAuth, signed cookie), sync API, Neon/memory store
public/               the app: index.html, service worker, manifest, icons
public/app/           Preact + htm modules (no build step)
  model.js            rotation, previous sets, e1RM, PRs, progression hints (pure, tested)
  db.js, store.js     IndexedDB, in-memory signals, save/sync queue
  sync.js             push/pull loop
  pages/              Today, Workout, History, Progress, Split, Settings
scripts/              build-web (copies Preact into web-dist, stamps the service worker), dev server, icons
tests/                node --test
```
