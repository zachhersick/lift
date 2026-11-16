# AGENTS.md

Repository instructions for coding agents working on Lift. Keep this file as the
single source of project guidance; `CLAUDE.md` imports it.

## User preferences and privacy

- Begin the first response to each user prompt with "Okay, Zach". Do not repeat it
  in subsequent updates for that same prompt.
- When usage information is available, check it on the first response and warn
  Zach if session usage is nearing its limit before a switch to Codex credits.
  Do not invent usage figures or claim monitoring when usage is unavailable.
- Never read `.env` files, including environment-specific variants or copies in
  Git history. Exclude them from content searches. If configuration context is
  needed, ask Zach to create a sanitized `.env.example`.
- Never print credentials or commit secrets. Use variable names and placeholders
  when documenting configuration.

## Public repository

This repository is public, so anything committed is published for good, history
included.

- Never commit secrets, signing keys (`.p8`, `.p12`, `.pem`), real user records,
  backups (`lift-backup*.json`) or screenshots with personal data. `.gitignore`
  covers the usual files; don't force-add past it.
- Test fixtures use `example.com`, `lift.test` or `privaterelay.appleid.com`
  addresses and obviously fake secrets (with `test`, `fake` or `example` in them).
  Zach's address appears only as the public contact on the legal and support pages
  and in `docs/app-store.md`.
- Run `npm.cmd run check:secrets` before every PR (it's part of `npm.cmd run check`).
  If it flags a test value, rename the value; widen the allowlist in
  `scripts/check-secrets.mjs` only for test or deliberately public values.
- If a secret is ever committed, treat it as leaked: rotate it first, then remove it.
  Pushing a fix doesn't unpublish history.
- Report vulnerabilities privately (`SECURITY.md`); the code is all rights reserved
  (no license, `"license": "UNLICENSED"`).

## Project overview and map

Lift is an offline-capable workout tracker and installable PWA, with rotating
splits, strength/cardio/timed sets, progress charts, bodyweight, nutrition
(meals with macros and micronutrients, measured maintenance, targets), a Coach
that connects eating and training and analyzes the split, and JSON backups.
Claude and ChatGPT log meals and build splits through an MCP connector. It is a single npm package using
React 19, Vite 8, Tailwind CSS 4, Motion and Preact signals. The backend is plain
Node.js with accounts (Apple, Google or GitHub sign-in; invite-only unless
`OPEN_SIGNUP=1`) and optional Neon Postgres storage. It is being prepared for the
iOS App Store, which needs account deletion, Sign in with Apple, report/block
for social features, AI-sharing consent and the legal pages.

| Location | Responsibility |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | Startup, appearance, sync, service worker and app shell: `pageFor()` maps a route to a page, `TABS` is the phone tab bar and `SIDE` the desktop sidebar |
| `src/pages/` | Today, workout, history, progress, bodyweight, nutrition (Fuel), split and settings screens |
| `src/pages/profile.tsx`, `friend.tsx`, `src/components/badges.tsx`, `account-sheet.tsx`, `src/lib/social.js` | Profile tab (stats, pinned lift, badges, friends, leaderboard, sharing), a friend's profile and lift comparison, the username sheet, and the friends API client |
| `src/pages/coach.tsx`, `src/components/insights.tsx` | Coach tab (split analyzer, cards by area, sets per muscle, sources), Coach cards and weekly AI review |
| `src/components/meal-sheet.tsx` | Meal editor with macros and micronutrients |
| `src/components/exercise-picker.tsx` | Exercise picker and the create/edit editor (name, primary and secondary muscles, tracking type, equipment) |
| `src/components/keypad.tsx`, `plates.tsx`, `src/lib/keypad.js` | Workout number pad and plate calculator |
| `src/components/kit.tsx` | Shared page, card, row, sheet and motion primitives |
| `src/components/ui/`, `src/components/kokonutui/` | Existing UI components styled for Lift |
| `src/lib/model.js` | The public index of Lift's pure logic (shared with the server and tests): it re-exports by name from the modules below, so import from it, never from a module |
| `src/lib/model/core.js`, `plates.js`, `workout.js`, `volume.js` | Records, splits and rotation, tracking types, history, PRs, progression, dates and `newer()`; plate math and warm-ups; supersets, focus steps and `splitDiff`; muscles, weekly sets, streaks and rings |
| `src/lib/model/nutrition.js`, `coach.js`, `analyzer.js`, `social.js` | Meals, micronutrients, weight trend, maintenance and targets; `coachingContext()` and `insights()`; `analyzeSplit()`/`applySplitEdit()`; units, `PRO_FEATURES`, badges, `profileSummary()`, leaderboard and name checks |
| `src/lib/exercises.js` | Built-in exercise library, starter split templates, `MUSCLE_GROUPS`, `MUSCLES`, `EQUIPMENT` and `indexExercises()` (library plus stored overrides, used by the store, the Coach and the connector) |
| `src/lib/timer.js`, `set-timer.js`, `format.js` | Rest and set timers, number and date formatting |
| `src/lib/store.js`, `db.js`, `sync.js`, `account.js` | Signals, IndexedDB records/outbox (one database per account), server synchronization. Each kind's view keeps its array while its records are unchanged (`keepIfSame`), so a save only recomputes views of that kind |
| `src/lib/api.js` | Every API call: same-origin cookie fetch on the web, `VITE_API_URL` plus a bearer token in the iOS app, and native sign-in (PKCE, `lift://auth`) |
| `src/lib/native.js`, `capacitor.config.ts`, `ios/`, `scripts/build-ios.mjs` | The iOS app (Capacitor 8, SPM): browser sign-in and `lift://` links, Keychain token, haptics, rest-timer notifications; iPhone-only; `Info.plist` has the URL scheme and export compliance, and `PrivacyInfo.xcprivacy` must match the App Store privacy answers in `docs/app-store.md` |
| `src/lib/actions.js`, `router.js` | Shared actions and hash navigation |
| `src/styles.css`, `public/theme-init.js` | Theme tokens and appearance before first paint |
| `server/app.js`, `auth.js`, `http.js`, `store.js` | API routing, accounts, invites and deletion, Apple/Google/GitHub sign-in, request validation and memory/Neon stores. `forOwner(email)` gives `get`, `listKind`, `listKinds` (several kinds in one query), `upsert`, `changesSince` and `head`; `loadTrainingData()` in `coach.js` reads everything the Coach needs |
| `server/oauth.js`, `mcp.js`, `coach.js` | Claude and ChatGPT connector (OAuth 2.1 + MCP tools) and the weekly Claude review |
| `server/billing.js`, `src/components/pro-sheet.tsx` | Lift Pro: Stripe calls, webhook signatures and plan rules; the upgrade sheet |
| `server/social.js` | Friend lists, the leaderboard and the share-filtered profile summary friends receive (block and report routes are in `app.js`) |
| `public/privacy.html`, `terms.html`, `support.html` | Privacy policy, terms (zero tolerance for abuse) and support page, linked from Settings and needed by the App Store |
| `api/index.js` | Vercel entry point for every `/api/*` and `/.well-known/*` request |
| `tests/model.test.js`, `tests/app.test.js` | Domain logic and API/auth/sync tests |
| `vite.config.ts`, `vercel.json` | Local API integration, PWA build, the `vendor` chunk and deployment configuration |
| `scripts/typecheck.mjs`, `check-docs.mjs` | The type-error ratchet and the check that every path in this file exists |
| `assets/icon.svg`, `scripts/build-icons.mjs` | Source icon and PNG generation (web icons, plus the opaque iOS app icon and launch splash) |
| `README.md`, `docs/deployment.md`, `docs/app-store.md` | The public overview; how production is deployed and configured (providers, variables, connector, iOS build, billing); publishing the iPhone app. Keep operator detail out of the README |
| `SECURITY.md`, `scripts/check-secrets.mjs` | How to report vulnerabilities; the scan for secrets and personal data that runs in `npm run check` |
| `.claude/launch.json` | Preview configurations `lift` (dev) and `lift-preview`, both on port 4330 |

A bare file name in a row is in the same directory as the path before it (or the
repository root). `npm.cmd run check:docs` checks every path here.

## Setup and commands

Run commands from the repository root. Use npm and preserve `package-lock.json`.
`package.json` declares Node >=20; Node 22.18.0 was used to verify tests and build.
On Windows PowerShell use `npm.cmd`; elsewhere use `npm`.

| Task | PowerShell command |
| --- | --- |
| Install locked dependencies in a fresh checkout | `npm.cmd ci` |
| Start development with hot reload | `npm.cmd run dev` |
| Run everything before handing off: tests, docs paths, secrets, typecheck, build | `npm.cmd run check` |
| Scan tracked files for secrets and personal data (`--history` for every past version) | `npm.cmd run check:secrets` |
| Run all tests | `npm.cmd test` |
| Run only domain tests | `node --test tests/model.test.js` |
| Run only API tests | `node --test tests/app.test.js` |
| Type-check (fails only on new errors; `-- --update` locks in fixes) | `npm.cmd run typecheck` |
| Check that every path in `AGENTS.md` exists | `npm.cmd run check:docs` |
| Build production assets into `dist/` | `npm.cmd run build` |
| Serve the production build locally | `npm.cmd run preview` |
| Regenerate PNG icons after editing the SVG | `npm.cmd run build:icons` |
| Build the iOS app and sync it into `ios/` (`LIFT_API_URL` overrides the API) | `npm.cmd run build:ios` |

Development uses `http://localhost:4330` with a strict port. Stop the owned server
before starting another on that port. Preview also defaults to port 4330.
Both mount the API through Vite. By default, local sign-in bypasses Google and
GitHub (admin `dev@lift.test`; `/api/auth/login?provider=dev&as=<email>` for an
invited test account) and storage is in memory; a `DATABASE_URL` in the process environment selects Neon
and turns the dev sign-in off. Do not point local testing at a real user database. No database or secrets are
required for the default local workflow or tests.

The local server's memory store resets on restart; browser IndexedDB persists.
Service workers are disabled on localhost/127.0.0.1 unless the URL has `?sw`.
Use a production build and preview with `?sw` when checking offline behavior.
A new build takes over as soon as it installs (`skipWaiting`, `clientsClaim` in
`vite.config.ts`) and reloads the page, and the app looks for one each time it
returns to the foreground, so keep in-progress work surviving a reload.

## Change workflow and code style

- Read the affected implementation and search its callers before editing. Include
  affected tests, data formats, imports and configuration in the change.
- Make the smallest complete fix. Reuse existing helpers and components before
  adding dependencies, abstractions or configuration.
- Match nearby code: ES modules, two-space indentation, semicolons and usually
  double quotes. UI is TSX; domain and server logic are JavaScript.
- Use the existing `@/` alias for `src` imports in UI code and retain explicit
  `.js` extensions in Node-consumed modules. Keep pure logic in the matching
  `src/lib/model/` module and add each new public name to the list in
  `model.js` (a helper only siblings use stays out of it). Modules import
  each other in one direction (core ← volume ← nutrition ← coach ← analyzer,
  social); don't add a cycle.
- Read signals through the existing `useValue` hook in React. Write records
  through the store's save/update/remove APIs so persistence and sync stay intact.
- Reuse `kit.tsx`, UI components, theme tokens and existing motion patterns.
  Preserve keyboard access, accessible labels, mobile safe areas, light/dark
  themes and the workout keypad/timer behavior when changing UI.
- Keep patches focused; do not reformat unrelated files or edit generated `dist/`
  output. Regenerate public PNG icons only when their source changes.
- Line endings are mixed (some files CRLF, some LF, with `core.autocrlf=true`).
  Keep each file's existing endings when editing or appending.

## How to add a feature

Each recipe names the files to touch and the tests to add. Read the invariants
below for whatever area you touch.

- **A new record kind** (something that syncs, like `meal`): add it to `KINDS`
  in `server/app.js` (`cleanChanges` drops unknown kinds) and give it a stable
  id, `kind`, `updatedAt` and `deleted` tombstones. Add a view in
  `src/lib/store.js` with `ofKind("<kind>")` plus `live()`, and write through
  `save`/`update`/`remove`. Both stores and the backup take it unchanged.
  Add the server's reads to `loadTrainingData()` only if the Coach needs it,
  and decide whether `profileSummary()` may see it (usually not). Tests: a sync
  round trip in `tests/app.test.js` and the pure logic in
  `tests/model.test.js`.
- **A new MCP tool**: add the schema to `TOOLS` and the handler to `tools` in
  `createMcp()` (`server/mcp.js`), using `store` (already owner-scoped) and
  `toolError` for bad input. If it widens access, list it in the approval
  page in `server/oauth.js` and gate it like `SPLIT_TOOLS`, so connections
  that approved less don't get it. Never touch logged workouts. Records it
  writes need the app's format and `source` set to the assistant. Tests: call
  it through `/api/mcp` in `tests/app.test.js`, including a missing-approval
  case if gated.
- **A new Pro gate**: check `user.pro` on the server route (see
  `/api/coach/review` in `server/app.js`) and return 403 otherwise. Hide or
  explain the feature in the UI from the session's `user.pro`, and add it to
  `PRO_FEATURES` (`src/lib/model/social.js`) only once it's gated, which
  shows it in `src/components/pro-sheet.tsx`. Update the terms and privacy
  pages. Never gate logged data, export, deletion, block or report. Tests: the
  403 for a free account and success for a VIP/subscriber in
  `tests/app.test.js`.
- **A new page**: add the component under `src/pages/`, a branch in
  `pageFor()` in `src/App.tsx`, and, if it needs a tab, entries in `TABS`
  (phone) and `SIDE` (desktop) with `match` lists. Add the route to the list
  at the top of `src/lib/router.js`. Build it from `kit.tsx` and read signals
  with `useValue`. Check it in a browser at 375×812 and at desktop width in
  both themes.
- **A Coach rule**: add the check inside `insights()` in
  `src/lib/model/coach.js`, returning a card with `area`, `tone`, `source`
  and copy grounded in published evidence or labelled as your own data. Add
  the source to `SOURCES`, the reference list in `src/pages/coach.tsx`. Tests: in
  `tests/model.test.js`, a case where it fires, one where it stays quiet, and
  that it carries its area and source. The weekly review gets the cards from `insights()`
  (`server/coach.js`); assistants see only `coachingContext()`, so add the
  numbers there too if they should know.

## Data and security invariants

- IndexedDB holds records, pending changes in an outbox and sync metadata. Keep
  offline edits durable and preserve outbox acknowledgments for in-flight edits.
- Every server record belongs to an account (its email). The primary key is `(owner, id)`. All record access goes through
  `store.forOwner(email)`, so one account never reads or writes another's. The
  device keeps one IndexedDB per account (`account.js`).
- Records use stable IDs, a `kind`, `updatedAt` timestamps and deletion tombstones.
  Preserve newest-edit-wins merging and server sequence cursors. Do not replace
  tombstones with hard deletion or drop history references to deleted exercises.
- When changing record types or formats, check the model, store, backup import/
  export, server `KINDS`/`cleanChanges`, both storage implementations and tests.
- An account is a verified email from Apple, Google or GitHub. Only admins (`ADMIN_EMAILS`),
  invitees (`lift_users`) or anyone under `OPEN_SIGNUP=1` may sign in, checked on
  every request. Admin APIs are admin-only. Preserve OAuth state verification,
  signed sessions, request body limits and same-origin checks on protected
  writes. Keep the development login bypass disabled on Vercel. Apple's callback
  is a cross-site form post (`/api/auth/apple/callback`), so its state and next
  cookies are `SameSite=None`; it is the only sign-in step outside the
  same-origin check and still needs the signed state.
- The iOS app (Capacitor, origin `capacitor://localhost`) signs in through the
  system browser with `/api/auth/login?client=ios&challenge=<S256>`; the
  callback redirects to `lift://auth?code=…`, a two-minute single-use code that
  `/api/auth/token` trades for a session token only with the PKCE verifier. The
  app sends it as `Authorization: Bearer`, which skips the same-origin check
  (cookies never accompany it). CORS allows exactly `capacitor://localhost` on
  `/api/*`. Make every client API call through `api()`/`postJson()` in
  `api.js`, never a bare `fetch`. In the app, `native.js` loads before sync
  starts and keeps the token in the Keychain; failed sign-ins return to
  `lift://auth?error=…`. The app has no service worker (its files are
  bundled). Opening, running and archiving `ios/App` needs Xcode on a Mac;
  `cap sync` works on Windows.
- Signing in creates the `lift_users` row. Sessions (`iat`) and ChatGPT tokens
  (`t`) only count while a non-admin's row exists and was created before they
  were issued (`member()` in `app.js`), so deleting an account
  (`/api/account/delete`, `store.deleteOwner`) ends every old session and
  connection. Deletion removes records, friendships, blocks and reports both
  ways, and revokes Sign in with Apple with the refresh token kept encrypted
  (`encryptText`) in `lift_users.apple_token`. Never expose that column; admin
  lists strip it. Admins can't delete themselves.
- The Claude and ChatGPT connector authenticates with bearer tokens only, never
  cookies. Keep its redirect-host allowlist (Claude's hosted callback is
  `https://claude.ai/api/mcp/auth_callback`; Claude Code uses `localhost` or
  `127.0.0.1` on any port, and only those ignore the port), required PKCE S256,
  single-use codes and refresh tokens (`lift_once`), token binding to an allowed
  account and `MCP_TOKEN_VERSION`, owner-scoped MCP storage, the approval page
  naming the redirect host, and the CSP `form-action` entries for those hosts.
  Tokens carry the approved assistant (`a`). One without it predates the split
  tools and keeps only the meal and summary tools until reconnected. When adding
  a tool that widens access, keep the approval page in step and don't give it to
  connections that approved less. Tools must not read or write logged workouts.
- Splits are `split` records plus `splitDay` records with a `splitId`. A day
  without one belongs to `MAIN_SPLIT`, which has no record until renamed, so
  older accounts and backups work unchanged. `settings.currentSplit` picks the
  current split, and only the app sets it: the connector can add and edit splits
  but never make one current. Read splits through `listSplits()`, and use the
  store's `splitDays` or the server's `loadTrainingData()` for the current
  split's days, never every `splitDay`. Rotation position comes from workouts
  logged against a split's own day ids, so keep day ids stable when editing.
- People find each other by username (`lift_users.username`: unique, lowercase,
  `USERNAME`/`usernameProblem()` in `model.js`, set through `/api/account`).
  Friendships (`lift_friends`, keyed by the two emails) start as a request and
  count only once the other person accepts; both must still be allowed accounts.
  Social API replies never include emails. Blocks (`lift_blocks`) end the
  friendship and make each person look like no one to the other; reports
  (`lift_reports`) go to admins. `nameProblem()` in `model.js` filters
  usernames and display names. Friends never read each other's
  records: `/api/profile` and the leaderboard use `profileSummary()` from
  `model.js`, computed on the server and passed through `shareFilter()` with the
  owner's `settings.share` (the pinned lift is always shown). Never add emails,
  bodyweight values, meals or notes to that summary. Badges (`BADGES`,
  `badges()`) are computed from the owner's own logs, not stored; the VIP badge
  reflects current membership.
- Lift Pro is sold through Stripe on the web, and is off unless every `STRIPE_*`
  variable is set. `user.pro` is admin, VIP or an active plan (`planActive()` in
  `server/billing.js`); check it on the server for anything paid. The plan lives on
  the user row (`stripe_customer`, `plan_status`, `plan_until`, `plan_source`) and only
  `store.setPlan` writes it, never `putUser`. Webhooks must verify Stripe's signature
  and re-read the plan from Stripe rather than trust the event. `/api/billing/*`
  refuses iOS bearer sessions, and purchase UI stays hidden there, until the app sells
  Pro through Apple (guideline 3.1.3(b), see `docs/app-store.md`). Deleting or removing
  an account cancels in Stripe first, and a failure there stops the deletion. Stripe
  ids never leave the server. List a feature in `PRO_FEATURES` only once it's gated,
  never lock logged data, deletion, export, block or report, and keep the terms and
  privacy policy in step.
- The weekly AI review is for Pro and VIPs only, after `REVIEW_MIN_LIFTS` lifting sessions
  in the last 7 days (`liftsThisWeek` in `model.js`, checked on server and app),
  and only after the person agrees to their data going to Anthropic
  (`settings.aiConsent`; the request carries `consent: true` or is refused).
  Keep the privacy policy in step with any new data flow.
- Meals written by the server keep the record format the app syncs (`kind:
  "meal"`, `date` in the user's `settings.timeZone`), so the phone pulls them.
  Fiber sits on the meal with the macros; other micronutrients go in
  `meal.micros` (keys from `MICROS` in `model.js`). A missing micronutrient means
  unknown, never zero.
- An exercise's `muscle` is its primary muscle and may be a specific one (lats,
  mid back, side delts, abductors…) that counts toward a group through
  `MUSCLE_GROUP` in `model.js`. Weekly volume, Coach cards, the split analyzer and
  push/pull balance work in groups via `muscleGroup()` and `secondaryGroups()`.
  Secondary muscles count half a set, once per group and never toward the
  primary's own group. A missing `secondary` list means inferred from the name
  (`inferredSecondary`); an empty array means none. Add muscles to `MUSCLES`/
  `MUSCLE_GROUPS` in `exercises.js` and `MUSCLE_GROUP` together. Built-in names
  are fixed; edits to a built-in are a resettable override.
- Plate math (`plateBreakdown`, `roundLoadable`, `warmupSets`) covers `barbell`
  and `plate loaded` equipment; `barFor()` gives plate-loaded exercises no bar.
  Check these helpers when adding to `EQUIPMENT`.
- Coach rules live in `insights()` in `src/lib/model/coach.js`; every card carries an `area`
  (training, nutrition, recovery) and a `source`. Keep new rules grounded in
  published evidence or label them as patterns in the user's own data, and keep
  the reference list on the Coach page in step.
- The split analyzer is `analyzeSplit()` in `src/lib/model/analyzer.js`: pure and deterministic, no
  API. Its suggestions carry an `edit` applied with `applySplitEdit()` through the
  store's `update`, so split edits sync like any other change. Each rule names
  its source; keep them evidence-based and in the Coach page's reference list.
- Preserve server errors that avoid exposing internal details and deployment
  security headers. Keep `/api/*` outside the service worker navigation fallback.

## Validation

Tests use `node:test` and `node:assert/strict`; add cases to the relevant existing
`tests/*.test.js` file for nontrivial behavior changes. API tests use `MemoryStore`
and fake requests/configuration, so they do not require OAuth or Neon credentials.

Run the relevant test file while iterating. Before handing off application code,
run `npm.cmd run check` (tests, `check:docs`, `typecheck`, build).
Documentation-only edits need `npm.cmd run check:docs` plus link and command
checks. `typecheck` is a ratchet: the UI has known type errors counted per file
in `scripts/typecheck.mjs`, and it fails only when a file gets more. When you fix
some, run `npm.cmd run typecheck -- --update`. There is no lint, formatting or
coverage script.

For UI changes, also inspect the affected flow in a browser at mobile size.
Storage, sync and PWA changes need appropriate offline/reload/reconnect checks;
the Node tests alone do not verify those browser behaviors. Report exactly which
checks ran and any failures or limitations, without claiming live deployment or
device validation from a local build.

## Git and pull requests

- Work on a short feature branch from an up-to-date `main`; never push to `main`
  directly. Stage only the files the change touches.
- Open a pull request against `main` on `zachhersick/lift` with `gh pr create`.
- Merge only when Zach asks, with `gh pr merge <number> --repo zachhersick/lift --merge`.
  Vercel builds a preview for each pull request.

## Build and deployment

`vercel.json` builds with `npm run build`, serves `dist/` and rewrites `/api/*` and
`/.well-known/*` to `api/index.js`. The Vercel function has a 60-second limit (the
weekly review calls Claude). No GitHub Actions
workflow is currently checked into this repository.

Production requires `DATABASE_URL`, `APP_URL`, `ADMIN_EMAILS`, a `SESSION_SECRET` of
at least 32 characters, and Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
and/or GitHub (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`) OAuth. Optional:
`ANTHROPIC_API_KEY` (weekly review), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY` (Lift Pro), `OPEN_SIGNUP`, `MCP_TOKEN_VERSION` (bump to
disconnect ChatGPT) and `OAUTH_REDIRECT_HOSTS`. The Neon store initializes and
migrates its schema on first use; records from before accounts go to the first
admin. Follow the
deployment and OAuth setup in `docs/deployment.md`; keep values out of source control.
Without `DATABASE_URL`, the API falls back to non-durable memory storage.

Keep `AGENTS.md` current when commands or architecture change, and keep
`CLAUDE.md` as a reference to this file rather than duplicating instructions.
