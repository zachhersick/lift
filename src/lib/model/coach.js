// The Coach: strength momentum, the coaching context assistants and the
// weekly review read, and insights(), the rule cards. Each card has an
// `area` and a `source`; keep the Coach page reference list in step.

import { dateKey, e1rm, exerciseHistory, finished, live, mean, nextSplitDay, orderedDays, trackOf, trend, workingSets, workoutSetCount, workoutVolume } from "./core.js";
import { DAY_MS, RATE_BANDS, dailyIntake, dayTotals, energyPlan, microAverages, rateStatus, shiftDateKey, weightRate } from "./nutrition.js";
import { GO_TO, MAIN_MUSCLES, VOLUME_RANGE, cardioSeconds, groupOf, isCompound, isPull, isPush, lifting, muscleSets, secondaryGroups, splitWeeklySets } from "./volume.js";

// ---------- strength momentum ----------

const round1 = (n) => Math.round(n * 10) / 10;

// Your most-trained lifts over the last `weeks` weeks: best e1RM now, how
// much it moved (total and per week), and how many sessions since it last
// beat its best. Strength exercises with weight only.
export function liftProgress(workouts, exerciseIndex = null, { now = Date.now(), weeks = 8, limit = 6 } = {}) {
  const from = now - weeks * 7 * DAY_MS;
  const counts = new Map();
  for (const workout of finished(workouts)) {
    if (workout.rest || workout.startedAt < from || workout.startedAt > now) continue;
    for (const entry of workout.entries || []) {
      if (trackOf(exerciseIndex?.get(entry.exerciseId)) !== "strength") continue;
      if (workingSets(entry).some((set) => (Number(set.weight) || 0) > 0)) counts.set(entry.exerciseId, (counts.get(entry.exerciseId) || 0) + 1);
    }
  }
  const rows = [];
  for (const [exerciseId, sessions] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const history = exerciseHistory(workouts, exerciseId, { before: now + 1 }).filter((point) => point.bestE1rm > 0);
    const recent = history.filter((point) => point.date >= from);
    if (!recent.length) continue;
    let best = 0;
    let since = 0;
    for (const point of history) {
      if (point.bestE1rm > best + 0.01) {
        best = point.bestE1rm;
        since = 0;
      } else since += 1;
    }
    const first = recent[0];
    const last = recent[recent.length - 1];
    const change = ((last.bestE1rm - first.bestE1rm) / first.bestE1rm) * 100;
    const spanWeeks = Math.max(1, (last.date - first.date) / (7 * DAY_MS));
    rows.push({ exerciseId, name: exerciseIndex?.get(exerciseId)?.name || exerciseId, sessions, e1rm: round1(last.bestE1rm), changePct: round1(change), perWeekPct: round1(change / spanWeeks), trend: trend(history), stalledFor: since, lastDate: last.date });
    if (rows.length >= limit) break;
  }
  return rows;
}

// Lifting sessions in the last 7 days: finished, not a rest day, with at
// least one completed working set. The weekly AI review waits for
// REVIEW_MIN_LIFTS of them, so there's a week of training to review.
export const REVIEW_MIN_LIFTS = 3;
export function liftsThisWeek(workouts, now = Date.now()) {
  return finished(workouts).filter((workout) => !workout.rest && workout.startedAt > now - 7 * DAY_MS && workout.startedAt <= now && (workout.entries || []).some((entry) => workingSets(entry).length)).length;
}

// ---------- coaching context ----------

// A compact picture of the last few weeks of eating and training: what the
// Coach rules read, what assistants get from the connector and what the weekly
// AI review is written from. `dayOf` turns a time into a date key (the
// server passes one in your time zone).
export function coachingContext({ workouts = [], meals = [], bodyweights = [], settings = {}, exerciseIndex = null, splitDays = [], splitName = null, now = Date.now(), dayOf = dateKey, weeks = 4 } = {}) {
  const twoWeeks = finished(workouts).filter((workout) => !workout.rest && workout.startedAt >= now - 14 * DAY_MS && workout.startedAt <= now);
  const today = dayOf(now);
  const plan = energyPlan(meals, bodyweights, settings, today);
  const intake = dailyIntake(meals);
  const sessionList = finished(workouts).filter((workout) => !workout.rest);
  const weekRows = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const to = shiftDateKey(today, -7 * i);
    const from = shiftDateKey(to, -6);
    const days = [...intake.values()].filter((day) => day.date >= from && day.date <= to);
    const done = sessionList.filter((workout) => {
      const key = dayOf(workout.startedAt);
      return key >= from && key <= to;
    });
    const weighIns = live(bodyweights).filter((entry) => entry.date >= from && entry.date <= to);
    const avg = (list, pick) => (list.length ? Math.round(list.reduce((sum, item) => sum + pick(item), 0) / list.length) : null);
    weekRows.push({
      from,
      to,
      loggedDays: days.length,
      avgCalories: avg(days, (day) => day.calories),
      avgProtein: avg(days, (day) => day.protein),
      proteinDays: plan.targets.protein ? days.filter((day) => day.protein >= plan.targets.protein * 0.9).length : null,
      sessions: done.length,
      sets: done.reduce((sum, workout) => sum + workoutSetCount(workout), 0),
      volume: Math.round(done.reduce((sum, workout) => sum + workoutVolume(workout), 0)),
      weight: weighIns.length ? round1(weighIns.reduce((sum, entry) => sum + Number(entry.weight), 0) / weighIns.length) : null
    });
  }
  const next = nextSplitDay(splitDays, workouts);
  const lastWeek = Array.from({ length: 7 }, (_, i) => intake.get(shiftDateKey(today, -i - 1))).filter(Boolean);
  return {
    today,
    unit: settings.unit === "kg" ? "kg" : "lb",
    goal: plan.targets.goal,
    targets: { calories: plan.targets.calories, protein: plan.targets.protein, carbs: plan.targets.carbs, fat: plan.targets.fat },
    maintenance: { calories: plan.maintenance.calories, method: plan.maintenance.method, confidence: plan.maintenance.confidence, loggedDays: plan.maintenance.loggedDays },
    weightRate: plan.rate ? { perWeek: Math.round(plan.rate.perWeek * 100) / 100, percentPerWeek: Math.round(plan.rate.percent * 100) / 100, status: plan.rateStatus } : null,
    todayIntake: (({ meals: count, calories, protein, carbs, fat }) => ({ meals: count, calories, protein, carbs, fat }))(intake.get(today) || dayTotals([])),
    weeks: weekRows,
    // Last 7 days, only nutrients reported for every meal on at least 3 days.
    micros: microAverages(lastWeek)
      .filter((micro) => micro.days >= 3)
      .map((micro) => ({ nutrient: micro.label, perDay: Math.round(micro.avg * 10) / 10, unit: micro.unit, dailyValue: micro.dv, percentDV: micro.pct === null ? null : Math.round(micro.pct), kind: micro.kind })),
    // Hard sets a week per muscle over the last two weeks, indirect work counted
    // as half, against the 10–20 range; and what the split prescribes.
    setsPerMuscle: {
      range: VOLUME_RANGE,
      weeklyAverageLastTwoWeeks: Object.fromEntries(muscleSets(twoWeeks, exerciseIndex || new Map(), 0, { indirect: true }).map((row) => [row.muscle, Math.round(row.sets) / 2])),
      split: Object.fromEntries([...splitWeeklySets(splitDays, exerciseIndex)].map(([muscle, sets]) => [muscle, Math.round(sets * 2) / 2]))
    },
    lifts: liftProgress(workouts, exerciseIndex, { now }).map(({ lastDate, exerciseId, ...row }) => ({ ...row, lastDone: dayOf(lastDate) })),
    currentSplit: splitName,
    nextWorkout: next?.day ? (next.day.rest ? "Rest day" : next.day.name) : null
  };
}


// ---------- coach ----------

const signedPct = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n * 100) / 100)}%`;
const kcalText = (n) => Math.round(n).toLocaleString("en-US");
const roundTo = (n, step) => Math.round(n / step) * step;
const TONE_RANK = { warn: 3, info: 2, good: 1 };
const MICRO_TIPS = {
  fiber: "Beans, oats, berries and vegetables add fiber.",
  saturatedFat: "Swap some fatty meat, butter and cheese for lean meat and olive oil.",
  cholesterol: "Egg yolks and fatty or organ meats are the usual sources.",
  sodium: "Sauces, deli meat, takeout and protein bars carry most of it.",
  potassium: "Potatoes, bananas, beans, yogurt and spinach are high in potassium.",
  calcium: "Dairy, fortified milk, tofu and sardines cover calcium.",
  iron: "Red meat, lentils and spinach (with vitamin C) help with iron.",
  magnesium: "Nuts, seeds, dark chocolate and leafy greens add magnesium.",
  zinc: "Red meat, shellfish and pumpkin seeds are good zinc sources.",
  vitaminA: "Carrots, sweet potatoes and spinach cover vitamin A.",
  vitaminC: "Citrus, peppers, berries and kiwi cover vitamin C.",
  vitaminD: "Fatty fish and eggs help; ask a doctor about a vitamin D supplement.",
  vitaminB12: "Meat, fish, dairy and eggs supply B12.",
  folate: "Leafy greens, beans and fortified grains add folate."
};
const nutrientName = (micro) => (micro.label.startsWith("Vitamin") ? micro.label : micro.label.toLowerCase());
const listNames = (list) => {
  const names = list.map(nutrientName);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
};
const microAmount = (n) => (n < 10 ? String(Math.round(n * 10) / 10) : kcalText(n));
const GOAL_NAME = { cut: "cut", maintain: "maintenance", leanBulk: "lean bulk" };
const RATE_TITLES = {
  leanBulk: { below: "Gaining too slowly for a lean bulk", above: "Gaining faster than a lean bulk needs" },
  cut: { below: "Losing faster than a cut should", above: "Losing too slowly for your cut" },
  maintain: { below: "Weight is drifting down", above: "Weight is drifting up" }
};

// Whether a day's eating hit the goal: calories in the goal's window and
// protein within 10% of target.
function onTarget(day, targets) {
  if (!targets.calories) return false;
  const ratio = day.calories / targets.calories;
  const calories = targets.goal === "leanBulk" ? ratio >= 0.95 && ratio <= 1.15 : targets.goal === "cut" ? ratio >= 0.8 && ratio <= 1.05 : ratio >= 0.9 && ratio <= 1.1;
  return calories && (!targets.protein || day.protein >= targets.protein * 0.9);
}

// The Coach: insight cards from your eating and training together. Each
// rule stays silent until it has enough data, and says what it's based on.
// Returns a "this week" headline and cards, most urgent first.
export function insights({ workouts = [], meals = [], bodyweights = [], settings = {}, exerciseIndex = null, splitDays = [], now = Date.now(), dayOf = dateKey } = {}) {
  const today = dayOf(now);
  const unit = settings.unit === "kg" ? "kg" : "lb";
  const plan = energyPlan(meals, bodyweights, settings, today);
  const { targets, maintenance } = plan;
  const intake = dailyIntake(meals);
  const sessions = finished(workouts).filter((workout) => !workout.rest && workout.startedAt <= now);
  const before = (days) => Array.from({ length: days }, (_, i) => shiftDateKey(today, -i - 1));
  const logged = (days) => before(days).map((date) => intake.get(date)).filter(Boolean);
  const lifts = liftProgress(workouts, exerciseIndex, { now });
  const histories = new Map(lifts.map((lift) => [lift.exerciseId, exerciseHistory(workouts, lift.exerciseId, { before: now + 1 }).filter((point) => point.bestE1rm > 0)]));
  const cards = [];

  // 1. Strength in weeks you ate enough vs. weeks you didn't.
  if (maintenance.method === "adaptive") {
    const weeks = [];
    for (let i = 0; i < 8; i += 1) {
      const to = shiftDateKey(today, -7 * i);
      const from = shiftDateKey(to, -6);
      const days = [...intake.values()].filter((day) => day.date >= from && day.date <= to);
      if (days.length < 4) continue;
      const changes = [];
      for (const history of histories.values()) {
        for (let k = 1; k < history.length; k += 1) {
          const key = dayOf(history[k].date);
          if (key >= from && key <= to) changes.push(((history[k].bestE1rm - history[k - 1].bestE1rm) / history[k - 1].bestE1rm) * 100);
        }
      }
      if (changes.length < 2) continue;
      const avg = mean(days.map((day) => day.calories));
      weeks.push({ fed: avg >= maintenance.calories - 100, under: avg < maintenance.calories - 250, change: mean(changes) });
    }
    const fed = weeks.filter((week) => week.fed);
    const under = weeks.filter((week) => week.under);
    if (fed.length >= 2 && under.length >= 2) {
      const a = mean(fed.map((week) => week.change));
      const b = mean(under.map((week) => week.change));
      if (a - b >= 0.5) {
        cards.push({
          id: "fuel-strength",
          tone: "info",
          title: "Your lifts climb when you eat enough",
          body: `Your main lifts' estimated 1RM moved ${signedPct(a)} per session in weeks at or above maintenance, and ${signedPct(b)} in weeks under it.`,
          evidence: `${fed.length} weeks at maintenance or above, ${under.length} under`,
          action: targets.goal === "cut" ? "Keep training days closest to maintenance and take the deficit on rest days." : "Keep your weekly average at or above maintenance while you push for strength."
        });
      }
    }
  }

  // 2. Stalled lifts, and the likeliest reason.
  const stalled = lifts.filter((lift) => lift.stalledFor >= 3);
  if (stalled.length) {
    const recent = logged(14);
    const avgCalories = recent.length >= 5 ? mean(recent.map((day) => day.calories)) : null;
    const avgProtein = recent.length >= 5 ? mean(recent.map((day) => day.protein)) : null;
    let why;
    let action;
    if (avgCalories !== null && targets.calories && avgCalories < targets.calories - 150) {
      why = `Over the last two weeks you've averaged ${kcalText(avgCalories)} kcal against a ${kcalText(targets.calories)} target.`;
      action = `Eat about ${kcalText(Math.max(100, roundTo(Math.min(400, targets.calories - avgCalories), 50)))} kcal more on training days, mostly carbs before you lift.`;
    } else if (avgProtein !== null && targets.protein && avgProtein < targets.protein * 0.85) {
      why = `Protein has averaged ${Math.round(avgProtein)} g against ${targets.protein} g.`;
      action = `Get protein to ${targets.protein} g a day before changing the program.`;
    } else {
      why = avgCalories !== null ? "You're eating enough, so fatigue is the likelier cause." : "There isn't enough food logged to tell whether eating is the cause.";
      action = "Take a deload week at about 90% of your working weights, or switch rep range (e.g. 8–12 → 5–8) for a few weeks.";
    }
    cards.push({
      id: "stall",
      tone: "warn",
      title: stalled.length === 1 ? `${stalled[0].name} has stalled` : `${stalled.length} lifts have stalled`,
      body: `No new best estimated 1RM: ${stalled.slice(0, 3).map((lift) => `${lift.name} (${lift.stalledFor} sessions)`).join(", ")}. ${why}`,
      action
    });
  }

  // 3. PRs after a pre-workout meal vs. without one.
  const prSessions = new Set();
  for (const history of histories.values()) {
    let best = 0;
    history.forEach((point, k) => {
      if (k > 0 && point.bestE1rm > best + 0.01) prSessions.add(point.workoutId);
      best = Math.max(best, point.bestE1rm);
    });
  }
  const timed = live(meals).filter((meal) => meal.eatenAt);
  const fueledRuns = { yes: [], no: [] };
  for (const workout of sessions.filter((w) => w.startedAt >= now - 56 * DAY_MS)) {
    if (!intake.has(dayOf(workout.startedAt))) continue;
    const carbs = timed.filter((meal) => meal.eatenAt < workout.startedAt && meal.eatenAt >= workout.startedAt - 4 * 3_600_000).reduce((sum, meal) => sum + (Number(meal.carbs) || 0), 0);
    fueledRuns[carbs >= 40 ? "yes" : "no"].push(prSessions.has(workout.id));
  }
  if (fueledRuns.yes.length >= 3 && fueledRuns.no.length >= 3) {
    const rate = (list) => list.filter(Boolean).length / list.length;
    const a = rate(fueledRuns.yes);
    const b = rate(fueledRuns.no);
    if (a - b >= 0.2) {
      cards.push({
        id: "pre-workout",
        tone: "info",
        title: "You PR more after a pre-workout meal",
        body: `${Math.round(a * 100)}% of sessions with 40 g+ carbs in the 4 hours before hit a PR, vs ${Math.round(b * 100)}% without.`,
        evidence: `${fueledRuns.yes.length + fueledRuns.no.length} logged sessions`,
        action: "Eat a carb-heavy meal 1–3 hours before you lift."
      });
    }
  }

  // 4. Weight rate against the goal's range.
  if (plan.rate) {
    const [low, high] = RATE_BANDS[targets.goal];
    const moving = `Your trend weight is moving ${plan.rate.perWeek >= 0 ? "+" : "−"}${Math.abs(Math.round(plan.rate.perWeek * 100) / 100)} ${unit}/week (${signedPct(plan.rate.percent)})`;
    if (plan.rateStatus === "in") {
      cards.push({ id: "rate", tone: "good", title: `Right on pace for your ${GOAL_NAME[targets.goal]}`, body: `${moving}, inside the ${signedPct(low)} to ${signedPct(high)} range.` });
    } else {
      const goalPerWeek = (plan.rate.weight * ((low + high) / 2)) / 100;
      const perDay = ((goalPerWeek - plan.rate.perWeek) * (unit === "kg" ? 7700 : 3500)) / 7;
      const change = roundTo(perDay, 50) || (perDay > 0 ? 50 : -50);
      cards.push({
        id: "rate",
        tone: "warn",
        title: RATE_TITLES[targets.goal][plan.rateStatus],
        body: `${moving}. A ${GOAL_NAME[targets.goal]} aims for ${signedPct(low)} to ${signedPct(high)} a week.`,
        evidence: `${plan.rate.days} days of weigh-ins`,
        action: `${change > 0 ? "Add" : "Cut"} about ${kcalText(Math.abs(change))} kcal a day${targets.autoCalories ? "; your automatic target adjusts as the trend moves" : ""}.`
      });
    }
  }

  // 5. Protein consistency over the last week.
  const week = logged(7);
  if (targets.protein && week.length >= 4) {
    const misses = week.filter((day) => day.protein < targets.protein * 0.9);
    const hits = week.length - misses.length;
    if (hits / week.length < 0.7) {
      const short = Math.round(mean(misses.map((day) => targets.protein - day.protein)));
      cards.push({ id: "protein", tone: "warn", title: `Protein hit ${hits} of ${week.length} days`, body: `On the days you missed you were about ${short} g short of ${targets.protein} g.`, action: short <= 45 ? "A shake or 250 g of Greek yogurt closes that gap." : "Add a palm-sized portion of protein to two meals." });
    } else if (hits / week.length >= 0.85 && week.length >= 5) {
      cards.push({ id: "protein", tone: "good", title: "Protein is locked in", body: `You hit ${targets.protein} g on ${hits} of ${week.length} logged days this week.` });
    }
  }

  // 6. Eating less on training days than rest days.
  const trainingDays = new Set(sessions.map((workout) => dayOf(workout.startedAt)));
  const month = logged(28);
  const onTraining = month.filter((day) => trainingDays.has(day.date));
  const onRest = month.filter((day) => !trainingDays.has(day.date));
  if (onTraining.length >= 4 && onRest.length >= 4) {
    const a = mean(onTraining.map((day) => day.calories));
    const b = mean(onRest.map((day) => day.calories));
    if (a < b - 150) {
      cards.push({ id: "training-days", tone: "info", title: "You eat less on lifting days", body: `${kcalText(a)} kcal on training days vs ${kcalText(b)} on rest days over the last four weeks.`, action: "Move about 200 kcal of carbs from rest days to training days, around your session." });
    }
  }

  // 7. Unlogged days, which make every estimate less sure.
  if (intake.size) {
    const first = [...intake.keys()][0];
    const missing = before(7).filter((date) => date >= first && !intake.has(date)).length;
    if (missing >= 2) {
      cards.push({ id: "gaps", tone: "info", title: `${missing} days unlogged this week`, body: "Unlogged days are left out of averages, so maintenance and these insights get less sure.", action: "Ask ChatGPT to log what you remember, even roughly." });
    }
  }

  // 8. Micronutrients far from their Daily Value over the last week.
  const microWeek = microAverages(week).filter((micro) => micro.dv && micro.days >= 4);
  const low = microWeek.filter((micro) => micro.kind === "goal" && micro.pct < 50).sort((a, b) => a.pct - b.pct);
  const high = microWeek.filter((micro) => micro.kind === "limit" && micro.pct > 120).sort((a, b) => b.pct - a.pct);
  const flagged = [...high, ...low].slice(0, 3);
  if (flagged.length) {
    const shownLow = flagged.filter((micro) => micro.kind === "goal");
    const shownHigh = flagged.filter((micro) => micro.kind === "limit");
    const title = [shownLow.length ? `Low on ${listNames(shownLow)}` : "", shownHigh.length ? `${shownLow.length ? "high" : "High"} on ${listNames(shownHigh)}` : ""].filter(Boolean).join(", ");
    cards.push({
      id: "micros",
      tone: "info",
      title,
      body: `Over the last week: ${flagged.map((micro) => `${micro.label} ${microAmount(micro.avg)} ${micro.unit} a day, ${Math.round(micro.pct)}% of the ${micro.dv} ${micro.unit} Daily Value`).join("; ")}.`,
      evidence: `days where every meal had an estimate (${Math.min(...flagged.map((micro) => micro.days))}+)`,
      action: flagged.map((micro) => MICRO_TIPS[micro.key]).join(" ")
    });
  }

  // ---- training ----
  // Two weeks of history once you've trained that long; until then, what
  // your split prescribes.
  const recentFrom = now - 14 * DAY_MS;
  const recent = sessions.filter((workout) => workout.startedAt >= recentFrom);
  const historyReady = recent.length >= 4 && sessions.some((workout) => workout.startedAt <= now - 13 * DAY_MS);
  const planned = splitWeeklySets(splitDays, exerciseIndex);
  const done = new Map(muscleSets(recent, exerciseIndex || new Map(), recentFrom, { indirect: true }).map((row) => [row.muscle, row.sets / 2]));
  const weekly = historyReady ? done : planned;
  const basis = historyReady ? "history" : planned.size ? "split" : null;
  const capital = (text) => text.replace(/^./, (c) => c.toUpperCase());
  const setsText = (n) => `${Math.round(n * 2) / 2}`.replace(/\.0$/, "");

  // 9. Muscles under (or far over) the evidence-based weekly range.
  if (basis) {
    const extra = [...weekly.keys()].filter((muscle) => muscle === "calves");
    const low = [...new Set([...MAIN_MUSCLES, ...extra])]
      .map((muscle) => ({ muscle, sets: weekly.get(muscle) || 0 }))
      .filter((row) => row.sets < VOLUME_RANGE[0])
      .sort((a, b) => a.sets - b.sets);
    if (low.length) {
      // Prefer an exercise you already do for that muscle, on the split day that trains it most.
      const used = new Map();
      for (const workout of sessions) for (const entry of workout.entries || []) {
        const exercise = exerciseIndex?.get(entry.exerciseId);
        if (exercise && workingSets(entry).length) used.set(`${groupOf(exercise)}|${exercise.name}`, (used.get(`${groupOf(exercise)}|${exercise.name}`) || 0) + 1);
      }
      const pick = (muscle) => [...used.entries()].filter(([key]) => key.startsWith(`${muscle}|`)).sort((a, b) => b[1] - a[1])[0]?.[0].split("|")[1] || GO_TO[muscle] || null;
      const dayFor = (muscle) => {
        let best = null;
        for (const day of orderedDays(splitDays).filter((d) => !d.rest)) {
          const score = (day.exercises || []).reduce((sum, item) => {
            const exercise = exerciseIndex?.get(item.exerciseId);
            return sum + (groupOf(exercise) === muscle ? 2 : secondaryGroups(exercise).includes(muscle) ? 1 : 0);
          }, 0);
          if (score && (!best || score > best.score)) best = { name: day.name, score };
        }
        return best?.name || null;
      };
      const shown = low.slice(0, 3);
      cards.push({
        id: "volume-low",
        area: "training",
        tone: "warn",
        title: low.length === 1 ? `${capital(low[0].muscle)} is under 10 sets a week` : low.length <= 3 ? `${capital(listNames(low.map((row) => ({ label: row.muscle }))))} are under 10 sets a week` : `${low.length} muscles are under 10 sets a week`,
        body: `${basis === "history" ? "Over the last two weeks" : "Your split works out to"}: ${low.map((row) => `${row.muscle} ${setsText(row.sets)}`).join(", ")} sets a week (presses, rows and squats count half a set for the muscles they assist). Muscle growth is clearly better from about 10 hard sets per muscle a week, and most of the benefit comes by about 20.`,
        evidence: basis === "history" ? `${recent.length} sessions in the last 14 days` : "your split's target sets",
        action: `${shown
          .map((row) => {
            const exercise = pick(row.muscle);
            const day = dayFor(row.muscle);
            return `${capital(row.muscle)}: add ${Math.ceil(VOLUME_RANGE[0] - row.sets)} sets a week${exercise ? `, e.g. ${exercise}` : ""}${day ? ` on ${day}` : ""}.`;
          })
          .join(" ")} Take each set to within 1–3 reps of failure. For exact edits, analyze your split on the Coach tab.`,
        source: "Schoenfeld et al., 2017; Baz-Valle et al., 2022; Pelland et al., 2024"
      });
    }
    const high = MAIN_MUSCLES.map((muscle) => ({ muscle, sets: weekly.get(muscle) || 0 })).filter((row) => row.sets > 25);
    if (high.length) {
      cards.push({
        id: "volume-high",
        area: "training",
        tone: "info",
        title: `Very high volume for ${listNames(high.map((row) => ({ label: row.muscle })))}`,
        body: `${high.map((row) => `${capital(row.muscle)} ${setsText(row.sets)}`).join(", ")} sets a week. Gains keep coming with more sets, but each extra set adds less while fatigue keeps adding up.`,
        action: "If those lifts stall or you feel beat up, trim to about 20 sets a week and push the remaining sets harder.",
        source: "Baz-Valle et al., 2022; Pelland et al., 2024"
      });
    }
  }

  // 10. A muscle with plenty of sets that only gets one day a week.
  if (historyReady) {
    const daysByMuscle = new Map();
    for (const workout of recent) for (const entry of workout.entries || []) {
      const muscle = groupOf(exerciseIndex?.get(entry.exerciseId));
      if (!muscle || !workingSets(entry).length) continue;
      if (!daysByMuscle.has(muscle)) daysByMuscle.set(muscle, new Set());
      daysByMuscle.get(muscle).add(dayOf(workout.startedAt));
    }
    const once = MAIN_MUSCLES.filter((muscle) => (done.get(muscle) || 0) >= 8 && (daysByMuscle.get(muscle)?.size || 0) <= 2);
    if (once.length) {
      cards.push({
        id: "frequency",
        area: "training",
        tone: "info",
        title: `${capital(listNames(once.map((muscle) => ({ label: muscle }))))} ${once.length === 1 ? "gets" : "get"} one day a week`,
        body: `${once.map((muscle) => `${capital(muscle)} gets ${setsText(done.get(muscle))} sets a week`).join(", ")}, all on one day. Training a muscle twice a week grows it at least as well as once, and spreading the sets keeps the last ones higher quality.`,
        action: "Move a few of those sets to a second day in your split.",
        source: "Schoenfeld et al., 2016; Schoenfeld et al., 2019"
      });
    }
  }

  // 11. Short rest on big compound lifts.
  const shortRest = new Set();
  for (const day of orderedDays(splitDays)) for (const item of day.exercises || []) {
    const exercise = exerciseIndex?.get(item.exerciseId);
    if (isCompound(exercise) && item.restSec && item.restSec < 90) shortRest.add(exercise.name);
  }
  for (const workout of recent) for (const entry of workout.entries || []) {
    const exercise = exerciseIndex?.get(entry.exerciseId);
    if (isCompound(exercise) && entry.restSec && entry.restSec < 90 && workingSets(entry).length) shortRest.add(exercise.name);
  }
  if (shortRest.size) {
    const names = [...shortRest];
    cards.push({
      id: "rest",
      area: "training",
      tone: "info",
      title: "Rest longer on compound lifts",
      body: `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""} ${names.length === 1 ? "is" : "are"} set to under 90 seconds of rest. Longer rest on multi-joint lifts led to more strength and muscle growth in trained lifters.`,
      action: "Rest 2–3 minutes between sets of squats, presses, rows and deadlifts; 1–2 minutes is fine for isolation work.",
      source: "Schoenfeld et al., 2016 (rest intervals); Singer et al., 2024"
    });
  }

  // 12. More pushing than pulling.
  if (basis) {
    let push = 0;
    let pull = 0;
    const add = (exercise, sets) => {
      if (isPull(exercise)) pull += sets;
      else if (isPush(exercise)) push += sets;
    };
    if (historyReady) for (const workout of recent) for (const entry of workout.entries || []) add(exerciseIndex?.get(entry.exerciseId), workingSets(entry).length / 2);
    else for (const day of orderedDays(splitDays).filter((d) => !d.rest)) for (const item of day.exercises || []) add(exerciseIndex?.get(item.exerciseId), ((Number(item.targetSets) || 3) * 7) / orderedDays(splitDays).length);
    if (push >= 10 && pull < push * 0.7) {
      cards.push({
        id: "balance",
        area: "training",
        tone: "info",
        title: "More pushing than pulling",
        body: `About ${setsText(push)} pushing sets a week against ${setsText(pull)} pulling. Lifters who press much more than they pull tend to end up with weaker upper backs and rear shoulders.`,
        action: `Add about ${Math.ceil(push - pull)} sets of rows, pulldowns or face pulls a week until pulling roughly matches pushing.`,
        source: "Practical guideline; Kolber et al., 2009 (shoulder imbalance in lifters)"
      });
    }
  }

  // 13. Several main lifts going backwards: time to deload.
  const dropping = lifts.filter((lift) => lift.trend === "down");
  if (dropping.length >= 2) {
    cards.push({
      id: "fatigue",
      area: "recovery",
      tone: "warn",
      title: `Strength is dipping on ${dropping.length} lifts`,
      body: `${dropping.slice(0, 3).map((lift) => lift.name).join(", ")} ${dropping.length > 3 ? "and more are" : "are"} trending down over recent sessions. When several lifts drop together, accumulated fatigue is the usual cause.`,
      action: "Take a deload week: about half your usual sets at slightly lighter weights, keep the movements, sleep well, then build back up.",
      source: "Bell et al., 2023 (deloading consensus)"
    });
  }

  // 14. Weekly cardio against health guidelines, once you're logging it.
  const cardioEver = sessions.some((workout) => cardioSeconds(workout, exerciseIndex) > 0);
  if (cardioEver && recent.length >= 2) {
    const minutes = Math.round(sessions.filter((workout) => workout.startedAt >= now - 7 * DAY_MS).reduce((sum, workout) => sum + cardioSeconds(workout, exerciseIndex), 0) / 60);
    if (minutes < 150) {
      cards.push({
        id: "cardio",
        area: "recovery",
        tone: "info",
        title: `Cardio: ${minutes} of 150 minutes this week`,
        body: "Health guidelines call for 150–300 minutes of moderate cardio a week on top of strength training. Low-impact cardio like walking or cycling interferes least with muscle and strength gains.",
        action: `Add about ${Math.ceil((150 - minutes) / 30)} sessions of 30 minutes, e.g. incline walks after lifting or on rest days.`,
        source: "WHO guidelines (Bull et al., 2020); Wilson et al., 2012"
      });
    }
  }

  // The week at a glance.
  const weekStart = shiftDateKey(today, -6);
  const sessionsThisWeek = sessions.filter((workout) => dayOf(workout.startedAt) >= weekStart).length;
  const daysThisWeek = [...intake.values()].filter((day) => day.date >= weekStart && day.date < today);
  const fueled = daysThisWeek.filter((day) => onTarget(day, targets)).length;
  const headline = sessionsThisWeek || daysThisWeek.length
    ? {
        id: "week",
        tone: daysThisWeek.length && fueled / daysThisWeek.length >= 0.7 ? "good" : "info",
        title: `This week: ${sessionsThisWeek} ${sessionsThisWeek === 1 ? "session" : "sessions"}${daysThisWeek.length ? `, on target ${fueled} of ${daysThisWeek.length} days` : ""}`,
        body: daysThisWeek.length ? `On target means ${GOAL_NAME[targets.goal]} calories and ${targets.protein ?? "—"} g protein.` : "Log meals to see how your eating lines up with training."
      }
    : null;

  // Where each card belongs in the app, and what it's based on.
  const RATE_SOURCE = { leanBulk: "Iraki et al., 2019 (rate of gain while bulking)", cut: "Helms et al., 2014 (rate of loss while cutting)", maintain: "Your weigh-in trend" };
  const META = {
    "fuel-strength": ["nutrition", "Your own logs (a pattern, not proof)"],
    stall: ["training", "Bell et al., 2023 (deloading); Schoenfeld et al., 2017 (light and heavy loads build muscle alike)"],
    "pre-workout": ["nutrition", "Your own logs; Kerksick et al., 2017 (nutrient timing)"],
    rate: ["nutrition", RATE_SOURCE[targets.goal]],
    protein: ["nutrition", "Morton et al., 2018 (protein for muscle gain)"],
    "training-days": ["nutrition", "Kerksick et al., 2017 (nutrient timing)"],
    gaps: ["nutrition", ""],
    micros: ["nutrition", "FDA Daily Values"]
  };
  const tagged = cards.map((card) => ({ area: META[card.id]?.[0] || "training", source: META[card.id]?.[1] || "", ...card }));
  return { headline, cards: tagged.map((card, index) => ({ card, index })).sort((x, y) => TONE_RANK[y.card.tone] - TONE_RANK[x.card.tone] || x.index - y.index).map((x) => x.card) };
}

