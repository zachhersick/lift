# Lift

A workout tracker for your gym split. Log the sets, weight and reps for every exercise on each day of a rotating split, see last time's numbers next to every set, and watch your progress chart over time. It runs on Vercel for the people you invite, and installs on the iPhone home screen like an app. You don't need the Apple Developer Program, and nothing expires.

## What it does

The look is a quiet logbook: graphite surfaces with hairlines, one flat accent for the action and the selection, sets written in a monospaced face (`225 × 5`), and the color saved for what you lift, like the plates loaded on the bar for your next top set. It's built with React, Tailwind, [motion](https://motion.dev) and [Kokonut UI](https://kokonutui.com) components. Light mode and six accent colors are in Settings.

- **Today** shows the next day in your rotation (Push → Pull → Legs → Rest → repeat) with the first barbell lift loaded on a drawn bar, last time's top set for each exercise and **Start**. Below that: **this week** in four numbers (workouts against your weekly goal, sets, volume and cardio against last week), **sets per muscle** against a 10–20 set band, a 3D **consistency** terrain of the last four months with your streak, your **bodyweight**, and recent PRs. Doing a different day than suggested just moves the rotation along.
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
- **Fuel** tracks what you eat. Meals arrive from your Claude or ChatGPT chat (see below) or you add them by hand. Today shows a calorie ring and protein/carbs/fat bars against your targets.
  - Targets come from a goal you pick (cut, maintain, lean bulk) and your **measured maintenance**: Lift fits a line through your weigh-ins and compares it with what you ate, so after about 10 logged days it knows what you actually burn instead of guessing from a formula. Days you didn't log are gaps, not zeros.
  - The Fuel page has each day's meals (tap one to fix an assistant's estimate), two weeks of calories against the target line, protein hit rate, and whether your weekly weight change is inside the range for your goal.
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
- **Weekly review.** With `ANTHROPIC_API_KEY` set, Claude (Opus 5.5) writes a short review from the same summary once a week. It ends in two or three concrete actions for the week, syncs like any record, and stays readable offline. Nothing goes to Anthropic until you tap **Agree and turn on reviews** in the Coach (`settings.aiConsent`).
- **History** has a calendar and every workout. A workout's summary compares volume, sets and time with your last session of the same day, and lists its PRs.
- **Progress** has a training-volume card (upper body, lower body, core; 7/30/90 days) and lists each exercise with a sparkline and trend. The exercise page swipes between charts of estimated 1RM (Epley), heaviest set, volume and reps over 1M/3M/1Y/All, with PRs, best reps at each weight, every session and the exercise's note. Tap **Edit** on an exercise (or **Edit exercise** in a workout's ⋯ menu) to fix its name, muscles or equipment, e.g. a custom exercise saved as chest that should be triceps. Muscles can be specific (lats, mid back, traps, lower back, front/side/rear delts, abductors, adductors); each counts toward its group's weekly sets (back, shoulders, glutes; adductors are their own). The change applies everywhere, past workouts included. Built-ins can be reset, and the tracking type locks once sets are logged. **Bodyweight** has its own chart with a 7-day average.
- **Split**: keep as many splits as you like. **Your splits** lists them all with a **Current** badge on the one you're training; Today, the Coach and your weekly goal follow that one. Tap another to look through or edit it, then **Make current** to switch. Each split remembers its place in the rotation, and History is untouched either way. Accounts from before there were several splits see their days as **My split**, with nothing to migrate. **New split** starts one from a template or blank, kept apart from your current split until you switch. Drag days and exercises to reorder, add rest days, set each exercise's sets, rep range, rest and supersets, and pick from ~100 built-in exercises or your own. **Edit exercise** (in an exercise's split settings, its chart page or the workout menu) sets its primary muscle, its secondary muscles, its equipment, and the name of an exercise you created.
- **Profile** (the last tab): your display name and **@username** (everyone picks a username the first time they open the app signed in; change either with the pencil), streak and workouts, a **pinned lift** with its PRs (heaviest set and best estimated 1RM), and **badges**. There are 28: VIP, session milestones, week streaks, 1–5 plate clubs on bench, squat, deadlift and press, bodyweight-ratio lifts, lifetime volume, PR counts and early workouts. Earned ones show with the day you earned them; the rest sit under **Show locked badges** with how close you are. Finishing a workout that earns one pops a notice. **Friends**: add someone on your Lift by **username**; once they accept, you each see the other's profile, pinned lift, a side-by-side **compare** of best estimated 1RM on the lifts you both do (in your unit, with bodyweight ratios) and their recent workouts, plus a **leaderboard** of workouts this week and your pinned lift. **What friends see** turns off lifts, recent workouts or ratios. Badges, streaks and the pinned lift are always shared; your email, bodyweight, meals and notes never are. Friends only get a summary the server computes, never your records. **Report** or **Block** anyone from their profile (block also works on a friend request): blocking ends the friendship and hides you from each other, and reports go to admins. Usernames and display names can't contain slurs or explicit words.
- **Settings** (from Profile): your account and **Delete account** (and, for admins, **Reports** and **People**: the invite list and VIPs), theme and accent color, weekly goal, nutrition goal and targets, the ChatGPT connector, lb/kg and weight jump, bar weight and available plates, default rest and sound, JSON **Export/Import** backups, and the privacy policy, terms and support pages (`public/privacy.html`, `terms.html`, `support.html`).

## How data is stored

The phone is the source of truth while you train. Every tap is saved right away to IndexedDB on the device, so the app works with no signal at the gym. When you're signed in, changes sync to Postgres two seconds after you make them, plus on open, when you reconnect, and every minute. Each record (exercise, split day, workout, bodyweight, meal, settings) merges on its own, and the newest edit wins. A device that finds the server database empty sends everything it has again.

Without signing in, the app still works fully, but only on that device.

### Accounts

An account is a verified email address. People sign in with **Apple**, **Google** or **GitHub**, and they reach the same account when the email matches (Sign in with Apple may give a private relay address instead).

**Who can sign in:**
- Admins, listed in `ADMIN_EMAILS`. They manage **People** in Settings.
- Anyone an admin adds to the invite list. Lift doesn't send emails, so send them the link.
- Anyone at all, if `OPEN_SIGNUP=1` is set.

**What accounts control:**
- **VIP**, toggled per person, adds the weekly AI review. It's written once they've logged 3 lifting sessions in the last 7 days.
- **Lift Pro** is the paid version of the same access, sold on the web through Stripe once the `STRIPE_*` variables are set. Admins and VIPs have it free. See [Lift Pro subscriptions](#lift-pro-subscriptions).
- **Removing someone** signs them out at once. Their data is kept, so adding them back restores it.
- **Deleting an account** (anyone but an admin, in Settings) permanently removes its records, friendships, blocks and reports, revokes Sign in with Apple, and ends every session and ChatGPT connection from before, even if the same email signs up again.

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
4. Set up at least one sign-in provider (the App Store needs **Apple** whenever Google is offered):
   - **Apple:** in the Apple Developer portal, under **Certificates, Identifiers & Profiles**:
     - Add a **Services ID** (this is `APPLE_CLIENT_ID`) with **Sign in with Apple** on, domain `lift.example.com` and return URL `https://lift.example.com/api/auth/apple/callback`.
     - Add a **Key** with Sign in with Apple, and download the `.p8` once. Its Key ID is `APPLE_KEY_ID`; your Team ID is `APPLE_TEAM_ID`.
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
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | The Services ID, Team ID, Key ID and the `.p8` key's contents (newlines may be written as `\n`). |
| `SESSION_SECRET` | 32+ random characters (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). |

**Upgrading from the single-user version:**
1. Set `ADMIN_EMAILS` with your own email first. Use the primary verified email on your GitHub account, or your Google email.
2. Remove `ALLOWED_GITHUB_ID`.

On first use, existing records move to that first admin. Everyone signs in once, and a connected assistant needs reconnecting once.

Optional:

| Variable | Value |
| --- | --- |
| `MCP_TOKEN_VERSION` | Change it (e.g. `1` → `2`) to disconnect every assistant immediately. |
| `OAUTH_REDIRECT_HOSTS` | Comma-separated hosts the connector may redirect to. Defaults to `chatgpt.com,chat.openai.com,claude.ai,localhost,127.0.0.1`. The last two are for Claude Code. The `form-action` entries in `vercel.json` must include any host you add. |
| `ANTHROPIC_API_KEY` | Turns on the weekly AI review for VIPs: one Claude call a week each, a few cents. Without it, the rule-based Coach still works. |
| `STRIPE_SECRET_KEY` | Stripe API key. Lift Pro is off unless all four `STRIPE_*` variables and `ANTHROPIC_API_KEY` are set. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook endpoint below. |
| `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` | Stripe price ids for the two plans. Amounts are read from Stripe. |
| `OPEN_SIGNUP` | `1` lets anyone with an Apple, Google or GitHub account sign in, not just invitees. Needed for the App Store. |

Sessions last 30 days. Every write from the web app needs the session cookie, a JSON body and an `Origin` header that matches `APP_URL`. The iOS app instead signs in through the system browser (PKCE, back to `lift://auth`) and sends its session as a bearer token from `capacitor://localhost`, the one origin the API allows cross-site. The one exception is Apple's sign-in callback, which Apple posts from its own site; it's checked against the signed state cookie instead.

## Connect Claude or ChatGPT

Lift is a **connector** (an MCP server at `/api/mcp`) for Claude and ChatGPT. Once it's connected, the assistant can log the meals you confirm straight into Lift and build you a split. Ask "build me a split in preparation for the ski season", and it appears under **Your splits** as a new split, ready for you to look through and **Make current**. Your connector URL is `https://lift.example.com/api/mcp`, also shown in Lift's Settings with a Copy button.

### Claude

1. In [Claude](https://claude.ai/customize/connectors) open **Customize → Connectors → Add custom connector** and paste the URL. Leave the OAuth client fields empty: Claude registers itself.
2. Claude opens Lift's approval page. Sign in if asked, then tap **Allow**. Claude's web, desktop and mobile apps share the connection.

For Claude Code:

```sh
claude mcp add --transport http lift https://lift.example.com/api/mcp
```

Then run `/mcp` in a session to sign in. The approval page warns you that it returns to a program on your computer.

### ChatGPT

1. In ChatGPT open **Settings → Apps & Connectors → Advanced settings** and turn on **Developer mode**. It needs a plan that offers it, and the menu names may shift.
2. **Create** a connector:
   - Name: Lift.
   - URL: your connector URL.
   - Authentication: **OAuth**.
3. ChatGPT opens Lift's approval page. Sign in if asked, then tap **Allow**. Anyone with a Lift account can connect their own ChatGPT.
4. In your **Health** project, add an instruction along these lines:

   > When I confirm what I ate, log it to Lift with `log_meal` (best-estimate calories, protein, carbs, fat, fiber, the items, and in `micros` any micronutrients you can estimate reliably, such as sodium, potassium, calcium, iron, magnesium and vitamins; pass a unique `ref`). Never log planned meals. Before suggesting what to eat, check `get_day`. For training or diet advice, read `get_coaching_context` first.

### What it can do

The connector reads and writes only the account that approved it. The tools:

| Tool | What it does |
| --- | --- |
| `log_meal` | Logs a confirmed meal with calories, macros, fiber and optional micronutrients; a repeated `ref` updates instead of duplicating. |
| `update_meal` | Corrects a meal already logged. |
| `delete_meal` | Removes a meal logged by mistake. |
| `get_day` | A day's meals and totals against your targets, what's left, and micronutrients against Daily Values. |
| `get_coaching_context` | Weekly calories and protein, training volume, bodyweight trend against your goal, measured maintenance, your main lifts' e1RM progress and stalls, and your current split with its next day. |
| `get_splits` | Every split with its days and exercises, which one is current, and the next day in its rotation. |
| `get_exercises` | The exercise library and your own, with ids, muscles, equipment and tracking type. |
| `create_exercise` | Adds an exercise a split needs that isn't in the library. |
| `create_split` | Creates a named split. It waits in the Split tab and never becomes current by itself; a repeated `ref` doesn't create a second one. |
| `update_split` | Renames a split or replaces its days, including the current split's, keeping the rotation place of days it keeps. |

Meals are dated in your time zone (the app tells the server which one). Everything reaches the phone on its next sync, which also runs whenever you open Fuel or Split.

How the connection is secured:

- The assistant gets a one-hour access token and a 60-day refresh token.
- Both are signed with `SESSION_SECRET` and bound to your account, and every code and refresh token works only once. PKCE with S256 is required.
- Redirects go only to allowed hosts. Local addresses, for Claude Code, may use any port.
- Removing someone from the invite list cuts off their connector too.
- The connector can read and change meals, read summaries, and read and edit splits and exercises. It can't see or change your logged workouts, and it can't choose your current split.
- A ChatGPT connection approved before the split tools existed keeps only the meal and summary tools until you remove the connector and add it again, which shows the new permissions.

## The iOS app

`ios/` is a Capacitor app that bundles the built web app, so it works offline, and talks to the Lift API at `LIFT_API_URL` (default `https://lift.zachhersick.com`). It signs in through the system browser and keeps its session in the Keychain. It adds real haptics and a notification when rest is up, even with the phone locked.

```sh
npm run build:ios   # builds dist/ for the app and runs `cap sync ios`
```

Then, on a Mac with Xcode, open `ios/App/App.xcodeproj`, set your signing team, and run it or **Product → Archive** for TestFlight. `npm run build:icons` also renders the app icon and launch splash. [docs/app-store.md](docs/app-store.md) has the App Store steps.

## Install on the iPhone

Open your Lift address in Safari, sign in from Settings, then **Share → Add to Home Screen**. It opens full screen with its own icon and keeps working offline. New deploys update it automatically the next time you open it twice.

The one iOS limit: a home-screen web app can't play a sound while it's in the background. The rest timer beeps if Lift is on screen, and since the screen stays on during a workout, that's normally the case.

To publish the native iOS app on the App Store, follow [docs/app-store.md](docs/app-store.md).

## Layout

```
api/index.js                Vercel function; every /api/* and /.well-known/* request lands here
server/                     auth (Apple/Google/GitHub OAuth, signed cookie), accounts, invites and deletion, sync API, Neon/memory store,
                            oauth.js + mcp.js (the Claude and ChatGPT connector), coach.js (weekly AI review), social.js (friends, profiles),
                            blocks and reports
index.html, vite.config.ts  Vite entry; the config also mounts the API for dev/preview and builds the service worker
src/lib/                    model.js (pure, tested logic), store/db/sync (IndexedDB + signals + sync), keypad, timer, theme
src/components/kokonutui/   Kokonut UI components, restyled to the app's tokens
src/components/             kit (page frame, cards, rows, sheets), keypad, plates, islands, charts, picker,
                            meal sheet, insights (Coach cards and weekly review), badges (badge grid, profile header)
src/pages/                  Today, Workout, History, Progress, Bodyweight, Fuel (nutrition), Split, Coach, Profile, Friend, Settings
src/styles.css              Tailwind v4 theme: dark/light tokens and accent colors
public/                     icons, manifest, theme-init.js (applies the theme before first paint), privacy/terms/support pages
tests/                      node --test
```

## Lift Pro subscriptions

Billing is off until you set it up, and everything works as before until then.

1. In Stripe, use test mode first. Create a **Lift Pro** product with a monthly and a yearly recurring price.
2. Turn on the **Customer Portal** in Stripe's billing settings, with cancelling allowed.
3. Add a webhook endpoint at `https://<your-app>/api/billing/webhook` for `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`.
4. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`, and redeploy.

Pro currently unlocks the weekly AI review. Don't release the iOS app with billing on until it also sells Pro through Apple in-app purchase: see `docs/app-store.md`.
