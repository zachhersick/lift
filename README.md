# Lift

**A workout tracker that knows your split.** Lift follows a rotating program (Push → Pull → Legs → Rest), shows last time's numbers next to every set, tracks what you eat against what you actually burn, and coaches you from your own data, with the research behind every suggestion.

It works offline at the gym, syncs across your devices, and installs on your phone like an app. Use it at **[lift.zachhersick.com](https://lift.zachhersick.com)**. A native iPhone app is on its way to the App Store.

## What it does

### Train
- **Today** shows the next day in your rotation, last time's top set for each lift, and your week: workouts against your goal, sets per muscle, volume and streak.
- **One exercise at a time.** The workout screen focuses on the lift in front of you. Up next is always visible, and supersets share a screen.
- **A gym-sized number pad** for weight and reps, with a **plate calculator** for your bar and the plates your gym actually has.
- **Smart fill.** Empty sets show last time's numbers, or the suggested weight when it's time to go up, so one tap logs a set.
- **Rest timer** that keeps counting through reloads, with a notification in the iPhone app even when the phone is locked.
- **Warm-up sets, supersets, notes that stick to an exercise**, and a gold flash when you beat a personal record.

### Fuel
- Log meals by hand, or let **Claude or ChatGPT** log them from your chat.
- **Measured maintenance.** Lift fits your weigh-ins against what you ate, so after about 10 logged days your calorie target comes from what you really burn, not a formula.
- Calories, protein, carbs and fat against your goal (cut, maintain or lean bulk), plus **micronutrients** against Daily Values. A nutrient nobody estimated counts as unknown, never zero.

### Coach
- **Advice from your own training, eating and bodyweight together**, computed on your device. Each card names the study or guideline it rests on.
- **Analyze my split** checks your program against the research (weekly sets per muscle, frequency, push/pull balance, exercise choice, rest, rep ranges) and proposes exact edits you can apply or undo, with a split score before and after.
- **Weekly review** (Lift Pro): a short review written by Claude, only after you agree to share a summary of your week.

### Progress
- Estimated 1RM, heaviest set, volume and reps over time for every exercise, with PRs and best reps at each weight.
- A calendar of every workout, comparisons with your last session of the same day, and a bodyweight chart with a 7-day average.
- **Several splits.** Keep as many programs as you like and switch the current one when you're ready.

### Friends
- Add friends by **username**, compare lifts side by side, see a weekly leaderboard, and earn **badges**.
- You choose what friends see. They get a summary computed on the server, never your records, and never your email, bodyweight, meals or notes. **Report** and **Block** are always available.

### Assistants
Lift is a **connector** (an MCP server) for Claude and ChatGPT. Connect it once from Fuel or Settings, and your assistant can log the meals you confirm, check your day before suggesting what to eat, and build you a new split. Ask "build me a split for ski season" and it appears in Lift, ready for you to review. An assistant reads and writes only the account that approved it, can't see your logged workouts, and can't change which split is current.

## Your data

- **Your device comes first.** Every tap is saved on your device right away, so Lift works with no signal. Signed in, changes sync to the server within seconds, and the newest edit wins.
- **Use it without an account** on one device, or sign in to sync across your devices.
- **Export** a JSON backup any time, and **delete your account** from Settings. Deletion permanently removes your data and ends every session and assistant connection.
- **Nothing goes to an AI provider** unless you connect an assistant yourself or turn on the weekly review.

Read the full [privacy policy](https://lift.zachhersick.com/privacy.html) and [terms](https://lift.zachhersick.com/terms.html).

## How it's built

| Layer | What it uses |
| --- | --- |
| App | React 19, Vite, Tailwind CSS 4, Motion and Preact signals: an installable, offline-first PWA. |
| On the device | IndexedDB with an outbox, so offline edits sync once you reconnect. |
| Server | Plain Node.js on Vercel, with Postgres on Neon. Apple, Google and GitHub sign-in. |
| Assistants | An OAuth 2.1 (PKCE) and MCP server for Claude and ChatGPT. |
| iPhone | Capacitor, bundling the same app with native haptics, notifications and Keychain storage. |
| Billing | Stripe on the web for Lift Pro. |

Training, nutrition and Coach logic is pure, tested JavaScript in `src/lib/model/`, shared by the app and the server.

```
src/pages/        Today, Workout, History, Progress, Fuel, Coach, Split, Profile, Settings
src/components/   Shared UI: page kit, keypad, plates, charts, sheets, Coach cards
src/lib/          Domain logic (model/), storage and sync, API client, timers
server/           API, accounts, sign-in, sync, connector (OAuth + MCP), billing, friends
api/index.js      Vercel entry point
ios/              The Capacitor iPhone app
tests/            node --test suites
docs/             Deployment, App Store and operations guides
```

## Run it locally

```sh
npm ci
npm run dev     # http://localhost:4330, with the API built in
npm run check   # tests, docs paths, secret scan, typecheck and build
```

Locally, Lift uses an in-memory database, and **Sign in** skips the real providers: you're the admin `dev@lift.test`. No accounts, keys or database are needed. Add `?sw` to the URL to test offline mode.

## Documentation

- [docs/deployment.md](docs/deployment.md): hosting, sign-in providers, environment variables, accounts, connecting Claude and ChatGPT, the iOS build and Lift Pro billing.
- [docs/app-store.md](docs/app-store.md): publishing the iPhone app.
- [AGENTS.md](AGENTS.md): architecture, conventions and invariants for anyone, human or AI, changing the code.
- [SECURITY.md](SECURITY.md): how to report a vulnerability.

## License

The source is public so you can read it, but **all rights are reserved**: Lift isn't open source, and you may not reuse it without permission. Please report security problems privately, as described in [SECURITY.md](SECURITY.md).
