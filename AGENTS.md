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
(meals with macros and micronutrients, measured maintenance, targets), a Coach that connects eating and
training, and JSON backups. ChatGPT logs meals through an MCP connector.
It is a single npm package using React 19, Vite 8, Tailwind CSS 4, Motion and
Preact signals. The backend is plain Node.js with GitHub OAuth and optional Neon
Postgres storage.

| Location | Responsibility |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | Startup, appearance, sync, service worker and app shell |
| `src/pages/` | Today, workout, history, progress, bodyweight, nutrition (Fuel), split and settings screens |
| `src/pages/coach.tsx`, `src/components/insights.tsx` | Coach page (cards by area, sets per muscle, sources), Coach cards and weekly AI review |
| `src/components/meal-sheet.tsx` | Meal editor with macros and micronutrients |
| `src/components/kit.tsx` | Shared page, card, row, sheet and motion primitives |
| `src/components/ui/`, `src/components/kokonutui/` | Existing UI components styled for Lift |
| `src/lib/model.js` | Pure training, progression, history, plate, statistics, nutrition and Coach logic (shared with the server) |
| `src/lib/store.js`, `db.js`, `sync.js` | Signals, IndexedDB records/outbox and server synchronization |
| `src/lib/actions.js`, `router.js` | Shared actions and hash navigation |
| `src/styles.css`, `public/theme-init.js` | Theme tokens and appearance before first paint |
| `server/app.js`, `auth.js`, `http.js`, `store.js` | API routing, auth, request validation and memory/Neon stores |
| `server/oauth.js`, `mcp.js`, `coach.js` | ChatGPT connector (OAuth 2.1 + MCP tools) and the weekly Claude review |
| `api/index.js` | Vercel entry point for every `/api/*` and `/.well-known/*` request |
| `tests/model.test.js`, `tests/app.test.js` | Domain logic and API/auth/sync tests |
| `vite.config.ts`, `vercel.json` | Local API integration, PWA build and deployment configuration |
| `assets/icon.svg`, `scripts/build-icons.mjs` | Source icon and PNG generation |

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
Both mount the API through Vite. By default, local sign-in bypasses GitHub and
storage is in memory; a `DATABASE_URL` in the process environment selects Neon.
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

## Data and security invariants

- IndexedDB holds records, pending changes in an outbox and sync metadata. Keep
  offline edits durable and preserve outbox acknowledgments for in-flight edits.
- Records use stable IDs, a `kind`, `updatedAt` timestamps and deletion tombstones.
  Preserve newest-edit-wins merging and server sequence cursors. Do not replace
  tombstones with hard deletion or drop history references to deleted exercises.
- When changing record types or formats, check the model, store, backup import/
  export, server `KINDS`/`cleanChanges`, both storage implementations and tests.
- Preserve GitHub account restriction, OAuth state verification, signed sessions,
  request body limits and same-origin checks on protected writes. Keep the
  development login bypass disabled on Vercel.
- The ChatGPT connector authenticates with bearer tokens only, never cookies.
  Keep its redirect-host allowlist, required PKCE S256, single-use codes and
  refresh tokens (`lift_once`), token binding to `ALLOWED_GITHUB_ID` and
  `MCP_TOKEN_VERSION`, and the CSP `form-action` entries for ChatGPT's hosts.
- Meals written by the server keep the record format the app syncs (`kind:
  "meal"`, `date` in the user's `settings.timeZone`), so the phone pulls them.
  Fiber sits on the meal with the macros; other micronutrients go in
  `meal.micros` (keys from `MICROS` in `model.js`). A missing micronutrient means
  unknown, never zero.
- Coach rules live in `insights()` in `model.js`; every card carries an `area`
  (training, nutrition, recovery) and a `source`. Keep new rules grounded in
  published evidence or label them as patterns in the user's own data, and keep
  the reference list on the Coach page in step.
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

## Build and deployment

`vercel.json` builds with `npm run build`, serves `dist/` and rewrites `/api/*` and
`/.well-known/*` to `api/index.js`. The Vercel function has a 60-second limit (the
weekly review calls Claude). No GitHub Actions
workflow is currently checked into this repository.

Production requires `DATABASE_URL`, `APP_URL`, `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, `ALLOWED_GITHUB_ID` and a `SESSION_SECRET` of at least 32
characters. Optional: `ANTHROPIC_API_KEY` (weekly review), `MCP_TOKEN_VERSION` (bump
to disconnect ChatGPT) and `OAUTH_REDIRECT_HOSTS`. The Neon store initializes its
schema on first use. Follow the
deployment and OAuth setup in `README.md`; keep values out of source control.
Without `DATABASE_URL`, the API falls back to non-durable memory storage.

Keep `AGENTS.md` current when commands or architecture change, and keep
`CLAUDE.md` as a reference to this file rather than duplicating instructions.
