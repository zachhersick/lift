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

## Project overview and map

Lift is an offline-capable workout tracker and installable PWA, with rotating
splits, strength/cardio/timed sets, progress charts, bodyweight, nutrition
(meals with macros and micronutrients, measured maintenance, targets), a Coach
that connects eating and training and analyzes the split, and JSON backups.
ChatGPT logs meals through an MCP connector. It is a single npm package using
React 19, Vite 8, Tailwind CSS 4, Motion and Preact signals. The backend is plain
Node.js with accounts (Apple, Google or GitHub sign-in; invite-only unless
`OPEN_SIGNUP=1`) and optional Neon Postgres storage. It is being prepared for the
iOS App Store, which needs account deletion, Sign in with Apple, report/block
for social features, AI-sharing consent and the legal pages.

| Location | Responsibility |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | Startup, appearance, sync, service worker and app shell |
| `src/pages/` | Today, workout, history, progress, bodyweight, nutrition (Fuel), split and settings screens |
| `src/pages/profile.tsx`, `friend.tsx`, `src/components/badges.tsx`, `account-sheet.tsx`, `src/lib/social.js` | Profile tab (stats, pinned lift, badges, friends, leaderboard, sharing), a friend's profile and lift comparison, the username sheet, and the friends API client |
| `src/pages/coach.tsx`, `src/components/insights.tsx` | Coach tab (split analyzer, cards by area, sets per muscle, sources), Coach cards and weekly AI review |
| `src/components/meal-sheet.tsx` | Meal editor with macros and micronutrients |
| `src/components/exercise-picker.tsx` | Exercise picker and the create/edit editor (name, primary and secondary muscles, tracking type, equipment) |
| `src/components/keypad.tsx`, `plates.tsx`, `src/lib/keypad.js` | Workout number pad and plate calculator |
| `src/components/kit.tsx` | Shared page, card, row, sheet and motion primitives |
| `src/components/ui/`, `src/components/kokonutui/` | Existing UI components styled for Lift |
| `src/lib/model.js` | Pure training, progression, history, plate, statistics, nutrition and Coach logic (shared with the server) |
| `src/lib/exercises.js` | Built-in exercise library, starter split templates, `MUSCLE_GROUPS`, `MUSCLES` and `EQUIPMENT` |
| `src/lib/timer.js`, `set-timer.js`, `format.js` | Rest and set timers, number and date formatting |
| `src/lib/store.js`, `db.js`, `sync.js`, `account.js` | Signals, IndexedDB records/outbox (one database per account), server synchronization |
| `src/lib/actions.js`, `router.js` | Shared actions and hash navigation |
| `src/styles.css`, `public/theme-init.js` | Theme tokens and appearance before first paint |
| `server/app.js`, `auth.js`, `http.js`, `store.js` | API routing, accounts, invites and deletion, Apple/Google/GitHub sign-in, request validation and memory/Neon stores |
| `server/oauth.js`, `mcp.js`, `coach.js` | ChatGPT connector (OAuth 2.1 + MCP tools) and the weekly Claude review |
| `server/social.js` | Friend lists, the leaderboard and the share-filtered profile summary friends receive (block and report routes are in `app.js`) |
| `public/privacy.html`, `terms.html`, `support.html` | Privacy policy, terms (zero tolerance for abuse) and support page, linked from Settings and needed by the App Store |
| `api/index.js` | Vercel entry point for every `/api/*` and `/.well-known/*` request |
| `tests/model.test.js`, `tests/app.test.js` | Domain logic and API/auth/sync tests |
| `vite.config.ts`, `vercel.json` | Local API integration, PWA build and deployment configuration |
| `assets/icon.svg`, `scripts/build-icons.mjs` | Source icon and PNG generation |
| `.claude/launch.json` | Preview configurations `lift` (dev) and `lift-preview`, both on port 4330 |

Paths abbreviated within a row are relative to the same directory as its first path.

## Setup and commands

Run commands from the repository root. Use npm and preserve `package-lock.json`.
`package.json` declares Node >=20; Node 22.18.0 was used to verify tests and build.
On Windows PowerShell use `npm.cmd`; elsewhere use `npm`.

| Task | PowerShell command |
| --- | --- |
| Install locked dependencies in a fresh checkout | `npm.cmd ci` |
| Start development with hot reload | `npm.cmd run dev` |
| Run all tests | `npm.cmd test` |
| Run only domain tests | `node --test tests/model.test.js` |
| Run only API tests | `node --test tests/app.test.js` |
| Build production assets into `dist/` | `npm.cmd run build` |
| Serve the production build locally | `npm.cmd run preview` |
| Regenerate PNG icons after editing the SVG | `npm.cmd run build:icons` |

Development uses `http://localhost:4330` with a strict port. Stop the owned server
before starting another on that port. Preview also defaults to port 4330.
Both mount the API through Vite. By default, local sign-in bypasses Google and
GitHub (admin `dev@lift.test`; `/api/auth/login?provider=dev&as=<email>` for an
invited test account) and storage is in memory; a `DATABASE_URL` in the process environment selects Neon.
Do not point local testing at a real user database. No database or secrets are
required for the default local workflow or tests.

The local server's memory store resets on restart; browser IndexedDB persists.
Service workers are disabled on localhost/127.0.0.1 unless the URL has `?sw`.
Use a production build and preview with `?sw` when checking offline behavior.

## Change workflow and code style

- Read the affected implementation and search its callers before editing. Include
  affected tests, data formats, imports and configuration in the change.
- Make the smallest complete fix. Reuse existing helpers and components before
  adding dependencies, abstractions or configuration.
- Match nearby code: ES modules, two-space indentation, semicolons and usually
  double quotes. UI is TSX; domain and server logic are JavaScript.
- Use the existing `@/` alias for `src` imports in UI code and retain explicit
  `.js` extensions in Node-consumed modules. Keep pure logic in `model.js`.
- Read signals through the existing `useValue` hook in React. Write records
  through the store's save/update/remove APIs so persistence and sync stay intact.
- Reuse `kit.tsx`, UI components, theme tokens and existing motion patterns.
  Preserve keyboard access, accessible labels, mobile safe areas, light/dark
  themes and the workout keypad/timer behavior when changing UI.
- Keep patches focused; do not reformat unrelated files or edit generated `dist/`
  output. Regenerate public PNG icons only when their source changes.
- Line endings are mixed (some files CRLF, some LF, with `core.autocrlf=true`).
  Keep each file's existing endings when editing or appending.

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
- Signing in creates the `lift_users` row. Sessions (`iat`) and ChatGPT tokens
  (`t`) only count while a non-admin's row exists and was created before they
  were issued (`member()` in `app.js`), so deleting an account
  (`/api/account/delete`, `store.deleteOwner`) ends every old session and
  connection. Deletion removes records, friendships, blocks and reports both
  ways, and revokes Sign in with Apple with the refresh token kept encrypted
  (`encryptText`) in `lift_users.apple_token`. Never expose that column; admin
  lists strip it. Admins can't delete themselves.
- The ChatGPT connector authenticates with bearer tokens only, never cookies.
  Keep its redirect-host allowlist, required PKCE S256, single-use codes and
  refresh tokens (`lift_once`), token binding to an allowed account and
  `MCP_TOKEN_VERSION`, owner-scoped MCP storage, and the CSP `form-action`
  entries for ChatGPT's hosts.
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
- The weekly AI review is for VIPs only, after `REVIEW_MIN_LIFTS` lifting sessions
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
- Coach rules live in `insights()` in `model.js`; every card carries an `area`
  (training, nutrition, recovery) and a `source`. Keep new rules grounded in
  published evidence or label them as patterns in the user's own data, and keep
  the reference list on the Coach page in step.
- The split analyzer is `analyzeSplit()` in `model.js`: pure and deterministic, no
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
run `npm.cmd test` and `npm.cmd run build`. Documentation-only edits need link,
path and command checks. There is no configured lint, formatting, coverage or
typecheck script; Vite's build is not a TypeScript typecheck.

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
`ANTHROPIC_API_KEY` (weekly review), `OPEN_SIGNUP`, `MCP_TOKEN_VERSION` (bump to
disconnect ChatGPT) and `OAUTH_REDIRECT_HOSTS`. The Neon store initializes and
migrates its schema on first use; records from before accounts go to the first
admin. Follow the
deployment and OAuth setup in `README.md`; keep values out of source control.
Without `DATABASE_URL`, the API falls back to non-durable memory storage.

Keep `AGENTS.md` current when commands or architecture change, and keep
`CLAUDE.md` as a reference to this file rather than duplicating instructions.
