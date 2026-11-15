// Units, Lift Pro features, badges, the profile summary friends see, lift
// comparison, the leaderboard, and username/name checks. Never add emails,
// bodyweight values, meals or notes to profileSummary().

import { REVIEW_MIN_LIFTS } from "./coach.js";
import { byNewest, byOldest, dateKey, e1rm, exerciseHistory, finished, live, personalRecords, setSeconds, startOfWeek, topSetOf, trackOf, workingSets, workoutVolume } from "./core.js";
import { DAY_MS } from "./nutrition.js";
import { weekStreak } from "./volume.js";

// ---------- profile, badges and friends ----------

const LB_PER_KG = 2.20462;
// A weight from one unit in another.
export const convertWeight = (weight, from, to) => (from === to ? weight : from === "kg" ? weight * LB_PER_KG : weight / LB_PER_KG);
const unitOf = (settings) => (settings?.unit === "kg" ? "kg" : "lb");
const round2 = (n) => Math.round(n * 100) / 100;

function hourIn(time, timeZone) {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date(time)));
  } catch {
    return new Date(time).getHours();
  }
}

// Built-in lifts the strength badges look at.
const LIFT = { bench: "b_bench-press", squat: "b_back-squat", deadlift: "b_deadlift", ohp: "b_overhead-press" };
const plateLoad = (n) => 45 + 90 * n;

// What Lift Pro includes today. A feature goes here once it's actually gated.
export const PRO_FEATURES = [
  { title: "Weekly AI review", detail: `Claude reads your training and eating and writes a short review, in weeks you log ${REVIEW_MIN_LIFTS} lifts.` }
];

// Badges earned from your own logs. `metric` names what's measured and `goal`
// the line to cross; lift weights are in lb (kg logs are converted).
export const BADGES = [
  { id: "vip", title: "VIP", detail: "A VIP member of Lift, with the weekly AI review.", icon: "crown", metric: "vip", goal: 1, status: "VIP member" },
  { id: "first", title: "First rep", detail: "Finish your first workout.", icon: "sparkles", metric: "sessions", goal: 1 },
  { id: "sessions-10", title: "Regular", detail: "Finish 10 workouts.", icon: "dumbbell", metric: "sessions", goal: 10 },
  { id: "sessions-50", title: "Dedicated", detail: "Finish 50 workouts.", icon: "dumbbell", metric: "sessions", goal: 50 },
  { id: "sessions-100", title: "Centurion", detail: "Finish 100 workouts.", icon: "dumbbell", metric: "sessions", goal: 100 },
  { id: "sessions-250", title: "Iron veteran", detail: "Finish 250 workouts.", icon: "dumbbell", metric: "sessions", goal: 250 },
  { id: "streak-4", title: "Month strong", detail: "Train every week for 4 weeks in a row.", icon: "flame", metric: "streak", goal: 4 },
  { id: "streak-12", title: "Habit formed", detail: "Train every week for 12 weeks in a row.", icon: "flame", metric: "streak", goal: 12 },
  { id: "streak-26", title: "Half a year", detail: "Train every week for 26 weeks in a row.", icon: "flame", metric: "streak", goal: 26 },
  { id: "streak-52", title: "Year of iron", detail: "Train every week for 52 weeks in a row.", icon: "flame", metric: "streak", goal: 52 },
  { id: "bench-1", title: "1-plate bench", detail: "Bench press 135 lb (61 kg) for a rep.", icon: "trophy", metric: `lift:${LIFT.bench}`, goal: plateLoad(1) },
  { id: "bench-2", title: "2-plate bench", detail: "Bench press 225 lb (102 kg) for a rep.", icon: "trophy", metric: `lift:${LIFT.bench}`, goal: plateLoad(2) },
  { id: "bench-3", title: "3-plate bench", detail: "Bench press 315 lb (143 kg) for a rep.", icon: "trophy", metric: `lift:${LIFT.bench}`, goal: plateLoad(3) },
  { id: "squat-2", title: "2-plate squat", detail: "Back squat 225 lb (102 kg) for a rep.", icon: "trophy", metric: `lift:${LIFT.squat}`, goal: plateLoad(2) },
  { id: "squat-3", title: "3-plate squat", detail: "Back squat 315 lb (143 kg) for a rep.", icon: "trophy", metric: `lift:${LIFT.squat}`, goal: plateLoad(3) },
  { id: "squat-4", title: "4-plate squat", detail: "Back squat 405 lb (184 kg) for a rep.", icon: "trophy", metric: `lift:${LIFT.squat}`, goal: plateLoad(4) },
  { id: "deadlift-3", title: "3-plate deadlift", detail: "Deadlift 315 lb (143 kg) for a rep.", icon: "trophy", metric: `lift:${LIFT.deadlift}`, goal: plateLoad(3) },
  { id: "deadlift-4", title: "4-plate deadlift", detail: "Deadlift 405 lb (184 kg) for a rep.", icon: "trophy", metric: `lift:${LIFT.deadlift}`, goal: plateLoad(4) },
  { id: "deadlift-5", title: "5-plate deadlift", detail: "Deadlift 495 lb (225 kg) for a rep.", icon: "trophy", metric: `lift:${LIFT.deadlift}`, goal: plateLoad(5) },
  { id: "ohp-1", title: "1-plate press", detail: "Overhead press 135 lb (61 kg) for a rep.", icon: "trophy", metric: `lift:${LIFT.ohp}`, goal: plateLoad(1) },
  { id: "bench-bw", title: "Bodyweight bench", detail: "Bench press your bodyweight for a rep.", icon: "scale", metric: `ratio:${LIFT.bench}`, goal: 1 },
  { id: "squat-bw", title: "1.5× squat", detail: "Back squat 1.5 times your bodyweight for a rep.", icon: "scale", metric: `ratio:${LIFT.squat}`, goal: 1.5 },
  { id: "deadlift-bw", title: "Double-bodyweight deadlift", detail: "Deadlift twice your bodyweight for a rep.", icon: "scale", metric: `ratio:${LIFT.deadlift}`, goal: 2 },
  { id: "volume-100k", title: "Heavy hauler", detail: "Lift 100,000 lb (45,000 kg) in total.", icon: "weight", metric: "volume", goal: 100_000 },
  { id: "volume-1m", title: "Million-pound club", detail: "Lift 1,000,000 lb (454,000 kg) in total.", icon: "weight", metric: "volume", goal: 1_000_000 },
  { id: "prs-10", title: "PR hunter", detail: "Set 10 personal records.", icon: "medal", metric: "prs", goal: 10 },
  { id: "prs-50", title: "Record breaker", detail: "Set 50 personal records.", icon: "medal", metric: "prs", goal: 50 },
  { id: "early-10", title: "Early bird", detail: "Start 10 workouts before 7am.", icon: "sunrise", metric: "early", goal: 10 }
];

// Every badge with when you earned it (null if not yet) and how close you
// are (0–1). Replays your finished workouts oldest first, so `earnedAt` is the
// start of the workout that crossed the line. Weights use `unit`; bodyweight
// ratios use your latest weigh-in on or before that day. Status badges (VIP)
// are held rather than earned: `status` says what they mean, and `earnedAt`
// is just `now` while you hold them.
export function badges(workouts, { bodyweights = [], unit = "lb", timeZone, vip = false, now = Date.now() } = {}) {
  const weighIns = live(bodyweights).filter((entry) => Number(entry.weight) > 0).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const values = new Map();
  const bump = (metric, value) => values.set(metric, Math.max(values.get(metric) || 0, value));
  const add = (metric, value) => values.set(metric, (values.get(metric) || 0) + value);
  const best = new Map(); // exercise id -> { weight, e1rm }, for PRs
  const earned = new Map();
  let lastWeek = null;
  let run = 0;
  for (const workout of finished(workouts).filter((w) => !w.rest).sort(byOldest)) {
    const lb = (weight) => convertWeight(Number(weight) || 0, unit, "lb");
    add("sessions", 1);
    const week = startOfWeek(workout.startedAt);
    if (week !== lastWeek) run = lastWeek !== null && startOfWeek(week - 3.5 * DAY_MS) === lastWeek ? run + 1 : 1;
    lastWeek = week;
    bump("streak", run);
    if (hourIn(workout.startedAt, timeZone) < 7) add("early", 1);
    add("volume", lb(workoutVolume(workout)));
    const day = dateKey(workout.startedAt);
    const bodyweight = [...weighIns].reverse().find((entry) => entry.date <= day)?.weight;
    const seen = new Map();
    for (const entry of workout.entries || []) {
      const prior = best.get(entry.exerciseId);
      for (const set of workingSets(entry)) {
        const weight = Number(set.weight) || 0;
        const reps = Number(set.reps) || 0;
        if (reps <= 0 || set.seconds != null) continue;
        if (weight > 0) {
          bump(`lift:${entry.exerciseId}`, lb(weight));
          if (bodyweight) bump(`ratio:${entry.exerciseId}`, weight / bodyweight);
        }
        if (prior && (weight > prior.weight || e1rm(weight, reps) > prior.e1rm + 0.01)) add("prs", 1);
        const next = seen.get(entry.exerciseId) || { weight: 0, e1rm: 0 };
        seen.set(entry.exerciseId, { weight: Math.max(next.weight, weight), e1rm: Math.max(next.e1rm, e1rm(weight, reps)) });
      }
    }
    for (const [id, top] of seen) {
      const was = best.get(id) || { weight: 0, e1rm: 0 };
      best.set(id, { weight: Math.max(was.weight, top.weight), e1rm: Math.max(was.e1rm, top.e1rm) });
    }
    for (const badge of BADGES) if (!badge.status && !earned.has(badge.id) && (values.get(badge.metric) || 0) >= badge.goal - 1e-9) earned.set(badge.id, workout.startedAt);
  }
  if (vip) {
    values.set("vip", 1);
    earned.set("vip", now);
  }
  return BADGES.map(({ metric, goal, ...badge }) => ({ ...badge, earnedAt: earned.get(badge.id) ?? null, progress: Math.min(1, (values.get(metric) || 0) / goal) }));
}

// How friends tell the same lift apart: built-ins by id, your own by name.
export const liftKey = (exercise) => (String(exercise?.id || "").startsWith("b_") ? exercise.id : `name:${String(exercise?.name || "").trim().toLowerCase()}`);

// What a friend can see about you: streak, sessions and earned badges, your
// most-trained lifts (best estimated 1RM and heaviest set), lifts as a
// multiple of bodyweight (never the bodyweight itself) and your last few
// workouts. `pinned` is the lift you chose to show off, with its PRs. Weights
// are in `unit`. The server filters it with shareFilter.
export function profileSummary({ workouts = [], exerciseIndex = new Map(), bodyweights = [], settings = {}, vip = false, now = Date.now() } = {}) {
  const unit = unitOf(settings);
  const sessions = finished(workouts).filter((w) => !w.rest && w.startedAt <= now);
  const all = badges(sessions, { bodyweights, unit, timeZone: settings.timeZone, vip, now });
  const lifts = new Map();
  for (const workout of sessions) {
    for (const entry of workout.entries || []) {
      const exercise = exerciseIndex.get(entry.exerciseId);
      if (!exercise || trackOf(exercise) !== "strength") continue;
      const sets = workingSets(entry).filter((set) => (Number(set.weight) || 0) > 0 && (Number(set.reps) || 0) > 0);
      if (!sets.length) continue;
      const key = liftKey(exercise);
      const row = lifts.get(key) || { key, name: exercise.name, e1rm: 0, heaviest: null, lastDone: 0, sessions: 0 };
      row.sessions += 1;
      row.lastDone = Math.max(row.lastDone, workout.startedAt);
      for (const set of sets) {
        row.e1rm = Math.max(row.e1rm, e1rm(set.weight, set.reps));
        const top = topSetOf([row.heaviest, set].filter(Boolean));
        row.heaviest = { weight: Number(top.weight), reps: Number(top.reps) };
      }
      lifts.set(key, row);
    }
  }
  const top = [...lifts.values()].sort((a, b) => b.sessions - a.sessions || b.lastDone - a.lastDone).slice(0, 12).map(({ sessions: _, ...row }) => ({ ...row, e1rm: round2(row.e1rm) }));
  const latest = live(bodyweights).filter((entry) => Number(entry.weight) > 0).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const ratios = latest ? Object.fromEntries(top.map((row) => [row.key, round2(row.e1rm / Number(latest.weight))])) : {};
  const recent = [...sessions].sort(byNewest).slice(0, 5).map((workout) => ({
    date: workout.startedAt,
    name: workout.name || "Workout",
    exercises: (workout.entries || [])
      .map((entry) => {
        const sets = workingSets(entry);
        if (!sets.length) return null;
        const best = topSetOf(sets);
        return { name: exerciseIndex.get(entry.exerciseId)?.name || "Exercise", sets: sets.length, weight: Number(best.weight) || 0, reps: Number(best.reps) || 0, seconds: setSeconds(best) || null };
      })
      .filter(Boolean)
  }));
  const chosen = settings.pinnedLift ? exerciseIndex.get(settings.pinnedLift) : null;
  const records = chosen ? personalRecords(exerciseHistory(sessions, chosen.id)) : null;
  const pinned = chosen
    ? {
        key: liftKey(chosen),
        name: chosen.name,
        heaviest: records.weight ? { weight: records.weight.weight, reps: records.weight.reps, date: records.weight.date } : null,
        e1rm: records.e1rm ? { value: round2(records.e1rm.value), weight: records.e1rm.weight, reps: records.e1rm.reps, date: records.e1rm.date } : null
      }
    : null;
  return {
    unit,
    pinned,
    streak: weekStreak(sessions, now),
    sessionsThisWeek: sessions.filter((w) => w.startedAt >= startOfWeek(now)).length,
    totalSessions: sessions.length,
    badges: all.filter((badge) => badge.earnedAt).map(({ progress, ...badge }) => badge),
    badgeCount: BADGES.length,
    lifts: top,
    ratios,
    recent
  };
}

// The summary with what you've chosen not to share taken out. Badges, streak,
// session counts and your pinned lift are always shared with friends.
export function shareFilter(summary, share = {}) {
  return { ...summary, lifts: share.lifts === false ? null : summary.lifts, recent: share.workouts === false ? null : summary.recent, ratios: share.ratios === false ? null : summary.ratios };
}

// Your lifts next to a friend's, for the lifts you both do, with their
// numbers in your unit. `ratio` is null where either of you doesn't share it.
export function compareLifts(mine, theirs) {
  if (!mine?.lifts || !theirs?.lifts) return [];
  const other = new Map(theirs.lifts.map((row) => [row.key, row]));
  return mine.lifts
    .filter((row) => other.has(row.key))
    .map((row) => {
      const them = other.get(row.key);
      return {
        key: row.key,
        name: row.name,
        mine: row.e1rm,
        theirs: round2(convertWeight(them.e1rm, theirs.unit, mine.unit)),
        myRatio: mine.ratios?.[row.key] ?? null,
        theirRatio: theirs.ratios?.[row.key] ?? null
      };
    });
}

// You and your friends ranked by workouts this week and, for one lift, by
// best estimated 1RM in `unit` (from shared lifts or a pinned lift).
// `people` is [{ username, name, me, summary }].
export function leaderboard(people, key = "", unit = "lb") {
  const rank = (rows) => rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const person = ({ username, name, me }) => ({ username, name, me: Boolean(me) });
  const week = rank(people.map((p) => ({ ...person(p), value: p.summary.sessionsThisWeek || 0 })));
  if (!key) return { week, lift: null };
  let liftName = null;
  const rows = [];
  for (const p of people) {
    const shared = p.summary.lifts?.find((row) => row.key === key);
    const best = shared?.e1rm || (p.summary.pinned?.key === key ? p.summary.pinned.e1rm?.value : 0) || 0;
    if (!best) continue;
    liftName ||= shared?.name || p.summary.pinned?.name;
    rows.push({ ...person(p), value: round2(convertWeight(best, p.summary.unit, unit)) });
  }
  return { week, lift: { key, name: liftName, unit, rows: rank(rows) } };
}

// Usernames: how friends find each other. Lowercase letters, numbers, _ and .
export const USERNAME = /^[a-z0-9_.]{3,20}$/;
const RESERVED_USERNAMES = new Set(["admin", "lift", "support", "me"]);
export const cleanUsername = (text) => String(text || "").trim().toLowerCase().replace(/^@/, "");
// What's wrong with a username, or "" when it's fine.
export function usernameProblem(username) {
  if (!USERNAME.test(username)) return "Use 3–20 lowercase letters, numbers, _ or .";
  if (RESERVED_USERNAMES.has(username)) return "That username is reserved.";
  return nameProblem(username);
}

// Names other people see (usernames and display names) can't contain slurs
// or explicit words. The App Store requires filtering what people post; this
// catches the obvious ones, look-alike digits included, and reports cover
// the rest. Words that hide inside ordinary names (Hancock, grape,
// Scunthorpe) only count on their own.
const BLOCKED_ANYWHERE = ["nigger", "nigga", "faggot", "retard", "tranny", "wetback", "fuck", "whore", "porn", "jizz", "dildo", "hitler"];
const BLOCKED_WORDS = new Set(["cunt", "cunts", "spic", "chink", "kike", "coon", "fag", "shit", "bitch", "slut", "pussy", "cock", "penis", "vagina", "rape", "nazi", "anal", "cum", "boob", "boobs", "tits"]);
const LOOKALIKE = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s", "!": "i" };
export function nameProblem(text) {
  const words = String(text || "").toLowerCase().replace(/[013457@$!8]/g, (c) => LOOKALIKE[c]).split(/[^a-z]+/).filter(Boolean);
  const joined = words.join("");
  return BLOCKED_ANYWHERE.some((word) => joined.includes(word)) || words.some((word) => BLOCKED_WORDS.has(word)) ? "Pick a different name." : "";
}
