# Deploying and running Lift

How Lift's production instance is set up and run: hosting, sign-in providers, accounts, the Claude and ChatGPT connector, the iOS build and Lift Pro billing. Lift's source is shared for reference and all rights are reserved (see the [README](../README.md#license)); this guide is for its maintainers. Values below are placeholders: real ones live only in the deployment's environment variables.

## Deploy

A Vercel project with Neon Postgres, with sign-in through Google and/or GitHub. The examples use `https://lift.example.com`; use your own domain.

1. In Vercel, **Add New → Project** and import this repository. Choose the framework preset **Other**; the build settings come from `vercel.json`. Under **Settings → Domains** add your domain.
2. **Storage → Marketplace → Neon** on that project. This sets `DATABASE_URL`. The tables are created on first use.
3. Set up at least one sign-in provider (the App Store needs **Apple** whenever Google is offered):
   - **Apple:** in the Apple Developer portal, under **Certificates, Identifiers & Profiles**:
     - Add a **Services ID** (this is `APPLE_CLIENT_ID`) with **Sign in with Apple** on, domain `lift.example.com` and return URL `https://lift.example.com/api/auth/apple/callback`.
     - Add a **Key** with Sign in with Apple, and download the `.p8` once. Its Key ID is `APPLE_KEY_ID`; your Team ID is `APPLE_TEAM_ID`.
   - **Google:** in Google Cloud Console, go to **APIs & Services → Credentials → Create credentials → OAuth client ID** and choose **Web application**.
     - Authorized redirect URI: `https://lift.example.com/api/auth/google/callback`.
     - First set up the OAuth consent screen. While it's in **Testing**, add each person as a test user, or publish it. The `email` and `profile` scopes need no Google review.
   - **GitHub:** in GitHub, go to **Settings → Developer settings → OAuth Apps → New**.
     - Homepage URL: `https://lift.example.com`.
     - Callback URL: `https://lift.example.com/api/auth/callback`.
4. In Vercel **Settings → Environment Variables**, add these, then **Redeploy**:

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

## Accounts and access

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

Then, on a Mac with Xcode, open `ios/App/App.xcodeproj`, set your signing team, and run it or **Product → Archive** for TestFlight. `npm run build:icons` also renders the app icon and launch splash. [app-store.md](app-store.md) has the App Store steps.

## Lift Pro subscriptions

Billing is off until you set it up, and everything works as before until then.

1. In Stripe, use test mode first. Create a **Lift Pro** product with a monthly and a yearly recurring price.
2. Turn on the **Customer Portal** in Stripe's billing settings, with cancelling allowed.
3. Add a webhook endpoint at `https://<your-app>/api/billing/webhook` for `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`.
4. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`, and redeploy.

Pro currently unlocks the weekly AI review. Don't release the iOS app with billing on until it also sells Pro through Apple in-app purchase: see `docs/app-store.md`.
