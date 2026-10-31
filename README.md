# Lift

A workout tracker for your gym split. Log the sets, weight and reps for every exercise on each day of a rotating split, see last time's numbers next to every set, and watch your progress chart over time. It runs on Vercel for the people you invite, and installs on the iPhone home screen like an app. You don't need the Apple Developer Program, and nothing expires.

## What it does

The look is dark-first and layered: glass surfaces, your accent color as soft gradients, a live shader behind the Up Next card and the Workout Complete screen, springy motion, animated numbers and activity rings. It's built with React, Tailwind, [motion](https://motion.dev), [Kokonut UI](https://kokonutui.com) components and [Paper Shaders](https://shaders.paper.design). Light mode and six accent colors are in Settings.

- **Today** shows the next day in your rotation (Push → Pull → Legs → Rest → repeat) on a live gradient, with last time's top set for each exercise and **Start**. Below that: **activity rings** for the week (workouts against your weekly goal, sets and volume against last week), **sets per muscle** against a 10–20 set band, a 3D **consistency** terrain of the last four months with your streak, your **bodyweight**, and recent PRs. Doing a different day than suggested just moves the rotation along.
- **Workout**: a live workout shows **one exercise at a time** (a superset's exercises share a screen) with `SET · PREVIOUS · LB · REPS · ✓`.
  - **Focus screen.**
    - A strip at the top shows every exercise and how far along it is; tap one to jump to it.
    - **Up next** shows the following exercise with last time's top set.
    - **Next exercise** lights up once every set is checked; **Back** returns to the previous one. On the last exercise it becomes **Finish workout**.
    - Lift remembers which exercise you're on, even if iOS reloads the app.
    - The list button shows **All exercises** (add, reorder, notes, hold to finish); tap an exercise's title there to focus on it. Editing a finished workout uses the list.
  - **Number pad.** Weight and reps use a docked keypad instead of the iPhone keyboard. **±** buttons step by your weight jump, **Next** goes weight → reps → next set → next exercise, and the barbell key opens the **plate calculator** (plates per side for your bar and the plates your gym has).
  - **Smart fill.** Empty boxes show last time's numbers (or the suggested weight when it's time to go up), and ✓ on an empty row logs exactly that. Tap **Previous** to copy last time into a row; **Add Set** copies the set above.
  - **Progression hint** (double progression): once every set reaches the top of the rep range, it suggests adding your weight jump.
  - **⋯ menu:** **Add Warm-up Sets** (empty bar, then 40/60/80%, rounded to loadable weights), **Superset with Next** (A1/A2 labels; the rest timer only starts after the last exercise in the group), rest time, a **note that sticks to the exercise** (seat height, grip) and shows every time, **History** (a quick look at the last sessions without leaving the workout), swap, reorder, remove.
  - Checking a set starts the **rest timer**, a Dynamic Island-style pill at the top (tap it for −15 / +15 / Skip) that keeps counting if iOS reloads the app. A set that beats your best turns gold with a particle burst. Tap the workout title to change its name, date, time or duration (for logging a workout you forgot). The screen stays on during a workout.
  - **Hold to finish** (or tap Finish). If you added, swapped, removed or reordered exercises, changed set counts or supersets, Lift offers to update that split day to match. Skipping an exercise for the day doesn't count.
- **Fuel** tracks what you eat. Meals arrive from your ChatGPT chat (see below) or you add them by hand. Today shows a calorie ring and protein/carbs/fat bars against your targets.
  - Targets come from a goal you pick (cut, maintain, lean bulk) and your **measured maintenance**: Lift fits a line through your weigh-ins and compares it with what you ate, so after about 10 logged days it knows what you actually burn instead of guessing from a formula. Days you didn't log are gaps, not zeros.
  - The Fuel page has each day's meals (tap one to fix ChatGPT's estimate), two weeks of calories against the target line, protein hit rate, and whether your weekly weight change is inside the range for your goal.
  - **Micros**: fiber, sugar, saturated fat, cholesterol, sodium, potassium, calcium, iron, magnesium, zinc, and vitamins A, C, D, B12 and folate.
    - Shown for the day or as a 7-day average, as a percent of the FDA Daily Value. Sodium, saturated fat and cholesterol are limits to stay under.
    - A nutrient a meal didn't estimate counts as unknown, not zero, and partial totals say so (e.g. "2 of 3 meals").
    - You can add or fix them in any meal under **Micronutrients**.
- **Coach**: science-based advice across the whole app, from your training, eating and bodyweight together.
  - The rule cards are computed on the phone. Each one waits until there's enough data, then names the study or guideline it rests on.
  - Today shows them in a swipeable row; the **Coach** tab groups them into Training, Nutrition, and Recovery & cardio, with a sets-per-muscle chart and the reference list.
  - **Analyze my split** (top of the Coach tab) checks your rotation against the research and lists exact edits to its exercises, each with the reason and the study behind it: "Legs · Standing Calf Raise: 4 → 5 sets", "Add Hip Thrust: 2 × 10–15", "Lying Leg Curl: swap for Seated Leg Curl". Apply one, or **Apply all**, and Undo puts the split back. It's a deterministic optimizer that runs on the phone, with no API: it edits a copy of the split one set at a time and re-measures after each change. It covers:
    - weekly sets per muscle, aiming for 10–20;
    - about 10 direct sets per session at most;
    - training each muscle twice a week;
    - pulling as much as pushing;
    - lengthened-position exercise choices (Maeo et al., 2021 and 2023; Kinoshita et al., 2023);
    - rest on compound lifts;
    - rep ranges of 5–30;
    - a new rep range for lifts that have stalled in your logs.

    It also reports a 0–100 split score, now and after the changes.
  - Fuel shows the nutrition cards, and **Split** shows how many weekly sets your rotation gives each muscle.

  Training. An exercise's secondary muscles count half a set each, per Pelland et al., 2024. You can set them when editing an exercise; otherwise presses, rows, squats and hinges get sensible defaults:
  - muscles under about 10 hard sets a week (Schoenfeld et al., 2017; Baz-Valle et al., 2022), with how many sets to add, an exercise and the split day. For example: "Triceps: add 4 sets a week, e.g. Rope Pushdown on Push." Very high volume is flagged too.
  - a muscle trained only one day a week (Schoenfeld et al., 2016; 2019);
  - under 90 seconds' rest on compound lifts (Schoenfeld et al., 2016; Singer et al., 2024);
  - much more pushing than pulling;
  - several lifts dropping at once, which calls for a deload (Bell et al., 2023);
  - cardio under 150 minutes a week once you log it (WHO, 2020).

  Nutrition:
  - stalled lifts, with the likeliest cause in order: under-eating, low protein, then fatigue (deload);
  - whether your lifts climb faster in weeks you eat at maintenance or above;
  - whether you PR more after a carb-heavy meal in the 4 hours before training;
  - a weight trend outside your goal's range, with how many kcal to change;
  - protein misses;
  - eating less on lifting days than on rest days;
  - micronutrients well under (or, for sodium and the other limits, over) their Daily Value for the week;
  - unlogged days.
- **Weekly review.** With `ANTHROPIC_API_KEY` set, Claude (Opus 5.5) writes a short review from the same summary once a week. It ends in two or three concrete actions for the week, syncs like any record, and stays readable offline.
- **History** has a calendar and every workout. A workout's summary compares volume, sets and time with your last session of the same day, and lists its PRs.
- **Progress** has a training-volume card (upper body, lower body, core; 7/30/90 days) and lists each exercise with a sparkline and trend. The exercise page swipes between charts of estimated 1RM (Epley), heaviest set, volume and reps over 1M/3M/1Y/All, with PRs, best reps at each weight, every session and the exercise's note. Tap **Edit** on an exercise (or **Edit exercise** in a workout's ⋯ menu) to fix its name, muscles or equipment, e.g. a custom exercise saved as chest that should be triceps. Muscles can be specific (lats, mid back, traps, lower back, front/side/rear delts, abductors, adductors); each counts toward its group's weekly sets (back, shoulders, glutes; adductors are their own). The change applies everywhere, past workouts included. Built-ins can be reset, and the tracking type locks once sets are logged. **Bodyweight** has its own chart with a 7-day average.
- **Split**: start from a template or build your own. Drag days and exercises to reorder, add rest days, set each exercise's sets, rep range, rest and supersets, and pick from ~100 built-in exercises or your own. **Edit exercise** (in an exercise's split settings, its chart page or the workout menu) sets its primary muscle, its secondary muscles, its equipment, and the name of an exercise you created.
- **Profile** (the last tab): your streak, workouts and **badges**. There are 27 badges: session milestones, week streaks, 1–5 plate clubs on bench, squat, deadlift and press, bodyweight-ratio lifts, lifetime volume, PR counts and early workouts. Each records the day you earned it, and finishing a workout that earns one pops a notice. **Friends**: send a request by email to someone on your Lift; once they accept, you each see the other's profile, a side-by-side **compare** of best estimated 1RM on the lifts you both do (converted to your unit, with bodyweight ratios), and their recent workouts. **What friends see** lets you turn off lifts, recent workouts or ratios. Badges and streaks are always shared; bodyweight, meals and notes never are. Friends only get a summary the server computes, never your records.
- **Settings** (from Profile): your account (and, for admins, **People**: the invite list and VIPs), theme and accent color, weekly goal, nutrition goal and targets, the ChatGPT connector, lb/kg and weight jump, bar weight and available plates, default rest and sound, and JSON **Export/Import** backups.

## How data is stored

The phone is the source of truth while you train. Every tap is saved right away to IndexedDB on the device, so the app works with no signal at the gym. When you're signed in, changes sync to Postgres two seconds after you make them, plus on open, when you reconnect, and every minute. Each record (exercise, split day, workout, bodyweight, meal, settings) merges on its own, and the newest edit wins. A device that finds the server database empty sends everything it has again.

Without signing in, the app still works fully, but only on that device.

### Accounts

An account is a verified email address. People sign in with **Google** or **GitHub**, and both reach the same account when the email matches.

**Who can sign in:**
- Admins, listed in `ADMIN_EMAILS`. They manage **People** in Settings.
- Anyone an admin adds to the invite list. Lift doesn't send emails, so send them the link.
- Anyone at all, if `OPEN_SIGNUP=1` is set.

**What accounts control:**
- **VIP**, toggled per person, adds the weekly AI review. It's written once they've logged 3 lifting sessions in the last 7 days.
- **Removing someone** signs them out at once. Their data is kept, so adding them back restores it.

**How data is kept apart:**
- On the server, each account's records are separate.
- On a shared device, each account keeps its own on-device database, so people never see each other's data.
- Signing out shows an empty guest view and keeps your data on the device for when you sign back in.

## Run it locally

```sh
npm install
npm run dev        # http://localhost:4330, with the API built in
npm test
npm run build      # production build in dist/; npm run preview serves it
```

Locally it uses an in-memory database, and **Sign in** skips Google and GitHub: you're the admin `dev@lift.test`. Use `/api/auth/login?provider=dev&as=friend@example.com` to try an invited account. The service worker is off so every reload gets the latest code (add `?sw` to the URL to test offline mode).

## Deploy (one-time)

A Vercel project with Neon Postgres, with sign-in through Google and/or GitHub. The examples use `https://lift.example.com`; use your own domain.

1. Push this folder to a private GitHub repo.
2. In Vercel, **Add New → Project** and import the repo. Choose the framework preset **Other**; the build settings come from `vercel.json`. Under **Settings → Domains** add your domain.
3. **Storage → Marketplace → Neon** on that project. This sets `DATABASE_URL`. The tables are created on first use.
4. Set up at least one sign-in provider:
   - **Google:** in Google Cloud Console, go to **APIs & Services → Credentials → Create credentials → OAuth client ID** and choose **Web application**.
     - Authorized redirect URI: `https://lift.example.com/api/auth/google/callback`.
     - First set up the OAuth consent screen. While it's in **Testing**, add each person as a test user, or publish it. The `email` and `profile` scopes need no Google review.
   - **GitHub:** in GitHub, go to **Settings → Developer settings → OAuth Apps → New**.
     - Homepage URL: `https://lift.example.com`.
     - Callback URL: `https://lift.example.com/api/auth/callback`.
5. In Vercel **Settings → Environment Variables**, add these, then **Redeploy**:

| Variable | Value |
| --- | --- |
| `APP_URL` | `https://lift.example.com` |
| `ADMIN_EMAILS` | Comma-separated admin emails. The first one owns any data from before accounts existed. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From the Google OAuth client. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | From the GitHub OAuth app. |
| `SESSION_SECRET` | 32+ random characters (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). |

**Upgrading from the single-user version:**
1. Set `ADMIN_EMAILS` with your own email first. Use the primary verified email on your GitHub account, or your Google email.
2. Remove `ALLOWED_GITHUB_ID`.

On first use, existing records move to that first admin. Everyone signs in once, and ChatGPT needs reconnecting once.

Optional:

| Variable | Value |
| --- | --- |
| `MCP_TOKEN_VERSION` | Change it (e.g. `1` → `2`) to disconnect ChatGPT immediately. |
| `OAUTH_REDIRECT_HOSTS` | Comma-separated hosts the connector may redirect to. Defaults to `chatgpt.com,chat.openai.com`. |
| `ANTHROPIC_API_KEY` | Turns on the weekly AI review for VIPs: one Claude call a week each, a few cents. Without it, the rule-based Coach still works. |
| `OPEN_SIGNUP` | `1` lets anyone with a Google or GitHub account sign in, not just invitees. |

Sessions last 30 days. Every write from the app needs the session cookie, a JSON body and an `Origin` header that matches `APP_URL`.

## Log meals from ChatGPT

Lift is a ChatGPT **connector** (an MCP server at `/api/mcp`). Once it's connected, ChatGPT can log the meals you confirm straight into Lift, so you keep tracking food by chatting.

1. In ChatGPT open **Settings → Apps & Connectors → Advanced settings** and turn on **Developer mode**. It needs a plan that offers it, and the menu names may shift.
2. **Create** a connector:
   - Name: Lift.
   - URL: `https://lift.example.com/api/mcp` (also shown in Lift's Settings, with a Copy button).
   - Authentication: **OAuth**.
3. ChatGPT opens Lift's approval page. Sign in if asked, then tap **Allow**. The connector reads and writes only the account that approved it. Anyone with a Lift account can connect their own ChatGPT.
4. In your **Health** project, add an instruction along these lines:

   > When I confirm what I ate, log it to Lift with `log_meal` (best-estimate calories, protein, carbs, fat, fiber, the items, and in `micros` any micronutrients you can estimate reliably, such as sodium, potassium, calcium, iron, magnesium and vitamins; pass a unique `ref`). Never log planned meals. Before suggesting what to eat, check `get_day`. For training or diet advice, read `get_coaching_context` first.

The tools ChatGPT gets:

| Tool | What it does |
| --- | --- |
| `log_meal` | Logs a confirmed meal with calories, macros, fiber and optional micronutrients; a repeated `ref` updates instead of duplicating. |
| `update_meal` | Corrects a meal already logged. |
| `delete_meal` | Removes a meal logged by mistake. |
| `get_day` | A day's meals and totals against your targets, what's left, and micronutrients against Daily Values. |
| `get_coaching_context` | Weekly calories and protein, training volume, bodyweight trend against your goal, measured maintenance, and your main lifts' e1RM progress and stalls. |

Meals are dated in your time zone (the app tells the server which one) and reach the phone on its next sync, which also runs whenever you open Fuel.

How the connection is secured:

- ChatGPT gets a one-hour access token and a 60-day refresh token.
- Both are signed with `SESSION_SECRET` and bound to your account, and every code and refresh token works only once.
- Removing someone from the invite list cuts off their connector too.
- The connector can read and change meals and read summaries, but it can't touch your workouts.

## Install on the iPhone

Open your Lift address in Safari, sign in from Settings, then **Share → Add to Home Screen**. It opens full screen with its own icon and keeps working offline. New deploys update it automatically the next time you open it twice.

The one iOS limit: a home-screen web app can't play a sound while it's in the background. The rest timer beeps if Lift is on screen, and since the screen stays on during a workout, that's normally the case.

## Layout

```
api/index.js                Vercel function; every /api/* and /.well-known/* request lands here
server/                     auth (Google/GitHub OAuth, signed cookie), accounts and invites, sync API, Neon/memory store,
                            oauth.js + mcp.js (the ChatGPT connector), coach.js (weekly AI review), social.js (friends, profiles)
index.html, vite.config.ts  Vite entry; the config also mounts the API for dev/preview and builds the service worker
src/lib/                    model.js (pure, tested logic), store/db/sync (IndexedDB + signals + sync), keypad, timer, theme
src/components/kokonutui/   Kokonut UI components, restyled to the app's tokens
src/components/             kit (page frame, cards, rows, sheets), keypad, plates, islands, charts, shader hero, picker,
                            meal sheet, insights (Coach cards and weekly review), badges (badge grid, profile header)
src/pages/                  Today, Workout, History, Progress, Bodyweight, Fuel (nutrition), Split, Coach, Profile, Friend, Settings
src/styles.css              Tailwind v4 theme: dark/light tokens and accent colors
public/                     icons, manifest, theme-init.js (applies the theme before first paint)
tests/                      node --test
```
