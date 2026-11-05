# Publishing Lift on the App Store

This is the kit for putting Lift on the iOS App Store: the listing copy, the
privacy answers, the notes for App Review, a screenshot plan, and a checklist to
work through on the Mac. Lift ships for iOS only, as a Capacitor app that bundles
the web build, with open sign-up.

The guide describes the App Store release as planned. These pieces land in their
own pull requests, so check that each one is merged before you submit:

- account deletion in Settings;
- Sign in with Apple;
- report and block on a friend's page, plus a username filter;
- a consent step before the weekly AI review;
- `public/privacy.html`, `public/terms.html` and `public/support.html`;
- bearer-token sign-in for the native app;
- the Capacitor `ios/` project with haptics and rest-timer notifications, and
  `npm run build:ios`.

`<APP_URL>` below is your production address, the same value as the `APP_URL`
environment variable, e.g. `https://lift.example.com`.

## 1. Listing copy

App Store Connect counts characters, not bytes. Every limit below was checked
against the text as written.

### Name, subtitle and promotional text

| Field | Limit | Text | Length |
| --- | --- | --- | --- |
| App name | 30 | Lift: Workout Tracker | 21 |
| Subtitle | 30 | Gym log, splits and nutrition | 29 |
| Promotional text | 170 | Log every set offline, see last time's numbers as you lift, and get a Coach that reads your training, eating and bodyweight together and tells you what to change. | 162 |

If "Lift: Workout Tracker" is taken, try these in order: "Lift: Gym Log & Coach" (21),
"Lift – Split Workout Log" (24), "Lift Training Log" (17). The name on the home
screen stays "Lift" either way; that comes from the Xcode display name.

Promotional text can change at any time without a new build, so use it for news
("New: friends and badges").

### Keywords (100 characters at most)

```
gym,log,split,strength,weightlifting,bodybuilding,reps,sets,macros,calorie,protein,1rm,plates,pr
```

96 characters. Commas without spaces; words already in the name and subtitle
(lift, workout, tracker, gym log, splits, nutrition) count anyway, so they are
left out apart from "gym" and "log", which also help as separate terms.

### Description (4000 characters at most)

About 3,000 characters. Paste it as is; App Store Connect keeps line breaks.

```text
Lift is a workout tracker built for the way you actually train: a rotating split, one exercise at a time, with last time's numbers next to every set. It works with no signal at the gym and syncs when you're back online.

TRAIN
• Today shows the next day in your rotation (Push, Pull, Legs, Rest…) with last time's top set for each exercise.
• A focus screen shows one exercise at a time, with an up-next card and a strip of every exercise in the workout.
• A docked number pad for weight and reps, with a plate calculator for your bar and the plates your gym has.
• Smart fill: empty rows show last time's numbers or the suggested weight, and one tap logs them.
• Double progression tells you when to add weight. Warm-up sets, supersets and notes that stick to each exercise.
• Strength, cardio and timed sets.
• A rest timer that keeps counting, with a notification and haptics when rest is over.
• New personal records light up as you log them.

PLAN YOUR SPLIT
• Start from a template or build your own. Reorder days and exercises, add rest days, and set sets, rep ranges, rest and supersets.
• About 100 built-in exercises, plus your own, each with primary and secondary muscles and equipment.

COACH
• Science-based advice from your training, eating and bodyweight together. Each card names the study or guideline behind it and waits until there's enough data.
• Analyze my split checks your rotation against the research (weekly sets per muscle, training each muscle twice a week, pushing versus pulling, rest, rep ranges, stalled lifts) and lists exact edits you can apply with one tap, or undo.
• Sets per muscle each week against a 10–20 set band.

FUEL
• Log meals with calories, protein, carbs, fat and micronutrients.
• Targets from your goal (cut, maintain, lean bulk) and your measured maintenance: Lift compares your weigh-ins with what you ate, so after about 10 logged days it knows what you actually burn.
• Fiber, sodium, potassium, calcium, iron, vitamins and more against the FDA Daily Values. Missing data counts as unknown, never zero.
• Optional: connect Claude or ChatGPT to log meals and build splits by chatting.

PROGRESS
• Charts of estimated 1RM, heaviest set, volume and reps for every exercise, with PRs and best reps at each weight.
• Training volume for upper body, lower body and core.
• A bodyweight chart with a 7-day average.
• A history calendar, and a summary of every workout against your last one.

FRIENDS
• Pick a username, add friends by @username, and compare lifts side by side.
• A weekly leaderboard, a pinned lift, and 28 badges from plate clubs to streaks.
• You choose what friends see. They never see your email, bodyweight, meals or notes.

YOUR DATA
• Every tap is saved on your phone first, so the app works offline.
• Sign in with Apple, Google or GitHub to sync between devices.
• Export a full JSON backup at any time, and delete your account from Settings.

VIP members also get a short weekly review written by AI from their week's training and eating, only after they agree to it.
```

### Category

- Primary: **Health & Fitness**.
- Secondary: **Lifestyle**. (Sports is the other reasonable choice, but App
  Store browsing puts gym trackers under Health & Fitness and Lifestyle.)

### Age rating questionnaire

Answer **None** or **No** to everything except where this table says otherwise.
App Store Connect computes the rating from the answers; expect **13+** because
users can make content other users see (usernames, display names, profiles).
Accept what it computes.

| Question area | Answer | Why |
| --- | --- | --- |
| Violence, horror, profanity, sexual content, nudity | None | |
| Alcohol, tobacco, drugs | None | Nutrition tracking doesn't reference them |
| Simulated gambling, gambling, contests, loot boxes | None / No | |
| Medical or treatment information | None | Coach cards are training and nutrition guidance, not diagnosis or treatment |
| Health or wellness topics | **Yes** | Fitness, nutrition and bodyweight tracking |
| Mature or suggestive themes | None | |
| Unrestricted web access | No | The app only loads its own pages |
| User-generated content | **Yes** | Usernames, display names and profiles visible to friends and on the leaderboard |
| Messaging and chat | No | Friends see profiles; there is no messaging |
| Advertising | No | |
| Parental controls, age assurance | No | |

Also confirm that the app has a way to **report and block** users and to filter
objectionable usernames if the form asks, since user content is enabled.

## 2. App Privacy (nutrition label)

In **App Store Connect → App Privacy**:

- **Do you or your third-party partners collect data from this app?** Yes.
- **Tracking:** No. Lift doesn't link its data with other companies' data for
  advertising and doesn't share it with data brokers. There is no third-party
  advertising or analytics SDK, so **App Tracking Transparency** isn't needed.
- For every data type below: **Linked to the user's identity: Yes. Used for
  tracking: No. Purpose: App Functionality only.**

| Category | Data type | What Lift stores |
| --- | --- | --- |
| Contact Info | Email Address | The account email from Apple, Google or GitHub (an Apple private relay address if the user hides theirs) |
| Contact Info | Name | The name the sign-in provider returns |
| Health & Fitness | Health | Bodyweight and nutrition (meals, macros, micronutrients, targets) |
| Health & Fitness | Fitness | Workouts, sets, splits, exercises, rest and cardio |
| User Content | Other User Content | Username, display name, exercise notes, profile sharing choices |
| Identifiers | User ID | The account identifier the server stores records under |

Leave everything else unchecked: no location, contacts, photos, browsing or
search history, purchases, financial info, sensitive info, usage data,
diagnostics or device identifiers. Lift doesn't use HealthKit. Rest-timer
notifications are scheduled on the device and send nothing to the server.

`ios/App/App/PrivacyInfo.xcprivacy` declares the same data types and no tracking.
Change it together with these answers.

### Optional processing the user starts

Both of these only run when the user turns them on, and the label above already
covers the data involved (Health & Fitness, App Functionality):

- **Weekly AI review (Anthropic).** Lift Pro and VIP members only, and only after they accept
  the consent step in the app. Once a week the server sends Anthropic's API a
  summary of that week's training, eating and bodyweight, and stores the review
  it writes. Anthropic acts as a service provider. The consent screen is what
  App Review Guideline 5.1.2(i) asks for before personal data goes to a
  third-party AI.
- **Claude and ChatGPT connector (Anthropic, OpenAI).** The user connects their
  own assistant account, using the URL shown in Settings, and approves access.
  The assistant can then log and read that user's meals, read training
  summaries, and read, add and edit splits and exercises; it can't touch logged
  workouts or choose the current split. The user can disconnect at any time.

Mention both in `privacy.html` with what is sent, when, and how to turn it off.

## 3. App Review notes

Paste this into **App Review Information → Notes**. Under **Sign-in required**,
check it, and leave the username and password empty: Lift has no passwords, so
there is no demo account to hand over.

```text
Thank you for reviewing Lift.

SIGN IN
Sign-up is open. Tap Sign in (Profile → Settings → Account) and use Sign in with Apple with any Apple ID; an account is created on first sign-in. Lift also works without signing in, with data kept on the device only.

TRY IT
Today → Start opens a workout. Tap a weight or reps box to use the number pad, and ✓ to log a set. Logging a set starts the rest timer.

NATIVE FEATURES
• Rest-timer notifications: when you check off a set, Lift schedules a local notification for the end of the rest period, so you're told even if the app is in the background or the phone is locked. Allow notifications when asked.
• Haptics on logging a set and on new records.

FRIENDS
The first time you open the app signed in, you pick a username and agree to the terms of use. To add a friend: Profile → Friends, enter a username and tap Send friend request. You can add @[REVIEW_FRIEND_USERNAME]; we will accept the request during review. Once accepted, tap the friend to see their profile, compare lifts and the leaderboard.

REPORT AND BLOCK
At the bottom of a friend's page are Report and Block; a friend request also has Report and Block buttons. Reports reach us and are reviewed within 24 hours; blocking removes the friendship and hides that user. Usernames are filtered for objectionable words.

ACCOUNT DELETION
Profile → Settings → Account → Delete account. This deletes the account and all its data from our servers.

AI WEEKLY REVIEW
The weekly AI review is only for VIP members who have logged 3 lifting sessions in the last 7 days. Before the first review, the app asks for consent to send a summary of the week's training and eating to Anthropic; nothing is sent without it. A new account isn't VIP, so you won't see it unless we enable VIP for your account; contact us and we will.

CLAUDE AND CHATGPT CONNECTOR
Optional and set up from Claude or ChatGPT, not from the app. It isn't needed to use Lift.

Contact: zachhersick31@gmail.com
```

Before submitting, replace `[REVIEW_FRIEND_USERNAME]` with a real account's
username (yours, or a second account you sign in to during review).

## 4. Screenshots

App Store Connect needs at least one set of iPhone screenshots; upload up to 10.
Lift is iPhone-only (`TARGETED_DEVICE_FAMILY = 1`), so no iPad screenshots are
needed.

| Display | Portrait pixels | CSS viewport at 3× |
| --- | --- | --- |
| 6.9" (required) | 1320 × 2868 | 440 × 956 |
| 6.5" | 1284 × 2778 | 428 × 926 |

Apple scales the 6.9" set down for smaller iPhones, so the 6.5" set is optional,
but uploading it keeps text crisp on those phones.

### What to capture

In this order, since the first three show in search results:

1. **Workout focus screen** mid-workout: a set checked, the number pad open and
   the rest-timer pill running.
2. **Today**: the Up Next card, activity rings and sets per muscle.
3. **Coach → Analyze my split** with suggested edits and the split score.
4. **Progress → exercise chart** (estimated 1RM over 3M) with PRs.
5. **Fuel**: the calorie ring and macro bars, plus micronutrients if they fit.
6. **Profile**: badges, streak and the pinned lift.
7. **Friend compare** or the **leaderboard**.
8. **Split editor** with a day open.
9. **History** calendar or a workout summary.

Use the dark theme and the default accent for every shot so the set looks
consistent. Captions on top of the screenshots are optional; if you add them,
keep them to a few words ("Last time's numbers on every set").

### How to capture them

1. Start the dev server: `npm run dev` (it opens `http://localhost:4330`).
2. Seed realistic data. There is no seed script; the quickest way is a real
   history:
   - In the production app, **Settings → Export backup** to get a JSON file.
   - In the dev app, **Sign in** (you're the local admin `dev@lift.test`), then
     **Settings → Import backup** and choose the file.
   - The local server keeps data in memory, but the browser's IndexedDB keeps it
     across restarts. Don't point local testing at the production database.
   - For a friend to compare against and a leaderboard, open a second browser
     profile at `/api/auth/login?provider=dev&as=friend@example.com` (invite
     `friend@example.com` in **People** first, or start the server with
     `OPEN_SIGNUP=1`), give it a username, and send and accept a friend request.
3. In Chrome DevTools, open the device toolbar (Ctrl/Cmd+Shift+M), **Edit →
   Add custom device**: 440 × 956, device pixel ratio 3, type Mobile. Add a
   second one at 428 × 926, ratio 3.
4. For each screen, open the ⋮ menu in the device toolbar and choose **Capture
   screenshot**. It saves at full resolution (1320 × 2868 or 1284 × 2778). Check
   the size before uploading; App Store Connect rejects anything else.
5. Check each shot for anything personal before uploading: no real email,
   and a display name you are happy to show.

Alternatively, run the native build in the iOS Simulator on an iPhone 16 Pro
Max (6.9") or iPhone 11 Pro Max (6.5") and press Cmd+S. Those screenshots
include the real status bar and safe areas, which match the shipped app most
closely.

## 5. Checklist on the Mac

Work through these in order. Values in angle brackets are placeholders; keep
real keys and secrets out of the repository and out of this file.

### Apple Developer account

- [ ] Enroll in the **Apple Developer Program** at developer.apple.com ($99 a
      year). As an individual, the seller name on the App Store is your legal
      name. Enrollment can take a day or two.
- [ ] In App Store Connect, accept the latest agreements under **Business**.
      The free app needs no paid-apps agreement.

### Identifiers and Sign in with Apple

In **Certificates, Identifiers & Profiles**:

- [ ] **Identifiers → + → App IDs → App.** Description "Lift", explicit Bundle
      ID `com.zachhersick.lift`. Under Capabilities, check **Sign in with
      Apple** (enable as a primary App ID). Push Notifications isn't needed:
      rest-timer notifications are local.
- [ ] **Identifiers → + → Services IDs.** Description "Lift web sign-in",
      identifier e.g. `com.zachhersick.lift.web`. Then edit it, check **Sign in
      with Apple → Configure**:
  - Primary App ID: `com.zachhersick.lift`.
  - Domains and Subdomains: your `<APP_URL>` host without `https://`, e.g.
    `lift.example.com`.
  - Return URLs: `<APP_URL>/api/auth/apple/callback`.
- [ ] **Keys → +.** Name "Lift Sign in with Apple", check **Sign in with Apple**,
      configure it with the primary App ID `com.zachhersick.lift`, and register.
      Download the `.p8` file. Apple lets you download it **once**; store it in
      your password manager, not in the repository. Note the **Key ID**.
- [ ] Note your **Team ID** (top right of the developer portal, or
      **Membership details**).

### Vercel environment

In Vercel **Settings → Environment Variables** for Production, add, then
**Redeploy**:

| Variable | Value |
| --- | --- |
| `APPLE_CLIENT_ID` | `<SERVICES_ID>`, e.g. `com.zachhersick.lift.web` |
| `APPLE_TEAM_ID` | `<TEAM_ID>` |
| `APPLE_KEY_ID` | `<KEY_ID>` |
| `APPLE_PRIVATE_KEY` | `<CONTENTS_OF_THE_P8_FILE>`, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |
| `OPEN_SIGNUP` | `1` |

Check the merged Sign in with Apple pull request in case it names the variables
differently or also reads the bundle ID. After the redeploy:

- [ ] Open `<APP_URL>`, sign in with Apple in Safari, and check the account
      appears.
- [ ] Open `<APP_URL>/privacy.html`, `<APP_URL>/terms.html` and
      `<APP_URL>/support.html` and check each loads and is current.

### Build and upload

- [ ] Install Xcode from the Mac App Store, open it once to install components,
      and sign in under **Xcode → Settings → Accounts** with your Apple ID.
- [ ] Clone or pull the repository on `main`, then `npm ci`.
- [ ] `npm run build:ios`. This builds the web app and copies it into the
      Capacitor project.
- [ ] Open the project in Xcode: `npx cap open ios`, or open `ios/App` in Xcode.
- [ ] Select the **App** target → **Signing & Capabilities**:
  - Team: your developer team. Keep **Automatically manage signing** on.
  - Bundle Identifier: `com.zachhersick.lift`.
  - **Sign in with Apple** appears in the capability list; add it with
    **+ Capability** if not.
- [ ] **General**: set **Version** (e.g. `1.0.0`) and **Build** (`1`; raise it on
      every upload). Deployment target as the Capacitor project sets it.
- [ ] Export compliance: in **Info** (Info.plist), check that
      `ITSAppUsesNonExemptEncryption` is present with the value **NO** (Boolean
      false). Lift only uses HTTPS through the system, which is exempt. With
      that key set, App Store Connect doesn't ask about encryption per build.
- [ ] Run once on your iPhone (plug it in, choose it as the run destination,
      Cmd+R). Check sign-in, a full workout, the rest-timer notification with the
      app in the background, haptics, and offline logging in airplane mode.
- [ ] Choose **Any iOS Device (arm64)** as the destination, then **Product →
      Archive**.
- [ ] In the Organizer, **Distribute App → App Store Connect → Upload**. Keep
      the defaults (symbols included, automatic signing).

### App Store Connect

- [ ] **Apps → + → New App**: platform iOS, name from section 1, primary
      language English (U.S.), Bundle ID `com.zachhersick.lift`, SKU e.g.
      `lift-ios`, full access.
- [ ] **App Information**: subtitle, category and secondary category, content
      rights (no third-party content), age rating questionnaire (section 1).
- [ ] **App Privacy**: privacy policy URL `<APP_URL>/privacy.html`, then the
      data answers from section 2, and **Publish**.
- [ ] **Pricing and Availability**: Free, and the countries you want.

### TestFlight

- [ ] Wait for the build to finish processing (an email arrives, usually within
      30 minutes).
- [ ] **TestFlight → Internal Testing**: add yourself, install through the
      TestFlight app, and run through:
  - Sign in with Apple on a fresh install.
  - Pick a username, add a friend, report and block from the friend's page.
  - A full workout with rest-timer notifications and haptics.
  - Fuel, Coach and Progress with real data.
  - The AI consent step on a VIP account.
  - Delete a test account from Settings and check that signing in again with
    the same Apple ID starts an empty account.
- [ ] Optional: **External Testing** for friends. The first external build goes
      through a short beta review.

### Lift Pro and in-app purchase

Lift Pro is sold on the web through Stripe, and the app hides every purchase
screen and refuses the billing API. That isn't enough on its own: guideline
3.1.3(b) lets a multiplatform app honor subscriptions bought on the website
only when they are also available as in-app purchases within the app. So don't
release a build while Stripe billing is on in production unless the app also
sells Pro through Apple, with Restore Purchases and App Store Server
Notifications writing `planSource: "apple"`. That work also changes
`PrivacyInfo.xcprivacy` and the privacy answers above (purchase history).
Comped VIP accounts aren't purchases.

### Submit

- [ ] On the **1.0 Prepare for Submission** page:
  - Screenshots from section 4.
  - Promotional text, description and keywords from section 1.
  - Support URL `<APP_URL>/support.html`; marketing URL `<APP_URL>` (optional).
  - Copyright, e.g. `2026 Zachary Hersick`.
  - **Build**: pick the TestFlight build.
  - **App Review Information**: contact details, sign-in required with empty
    credentials, and the notes from section 3.
  - **Version Release**: manual release is safer for the first version.
- [ ] Link the terms in the description or use Apple's standard EULA (**App
      Information → License Agreement**); if you use your own, point it at
      `<APP_URL>/terms.html`.
- [ ] **Add for Review → Submit**. Review usually takes a day or two. If it's
      rejected, answer in **Resolution Center**; most fixes are metadata and
      don't need a new build.

### After release

- [ ] Watch `support.html`'s contact address and act on reports within 24
      hours, as the review notes promise.
- [ ] For each update: raise **Build** (and **Version** for user-visible
      changes), `npm run build:ios`, archive, upload, and submit. Web-only
      changes still need a new build to reach the native app, because Capacitor
      bundles the web assets.
