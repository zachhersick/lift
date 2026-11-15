// Meals and bodyweight: macros, micronutrients, intake per day, weight
// trend, measured maintenance and calorie/protein targets.

import { dateKey, fromDateKey, live, trend } from "./core.js";
import { movingAverage } from "./volume.js";

// ---------- nutrition ----------

export const MACROS = ["calories", "protein", "carbs", "fat", "fiber"];
export const GOALS = ["cut", "maintain", "leanBulk"];
export const DAY_MS = 86_400_000;
const amount = (value) => Math.max(0, Number(value) || 0);

// The date key `days` days after (or before) another, safe across DST.
export function shiftDateKey(key, days) {
  const [y, m, d] = String(key).split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + days).getTime());
}

// The calendar date of a moment in a given time zone, e.g. on the server.
export function dateKeyIn(time = Date.now(), timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
  } catch {
    return dateKey(time);
  }
}

// Micronutrients with their FDA Daily Values (2,000 kcal label reference).
// A "goal" is something to reach, a "limit" something to stay under. Sugar
// has no Daily Value, so it's tracked without a bar. Fiber is stored on the
// meal like the macros; the rest live in `meal.micros`.
export const MICROS = [
  { key: "fiber", label: "Fiber", unit: "g", dv: 28, kind: "goal", max: 300 },
  { key: "sugar", label: "Sugar", unit: "g", dv: null, kind: "limit", max: 1000 },
  { key: "saturatedFat", label: "Saturated fat", unit: "g", dv: 20, kind: "limit", max: 500 },
  { key: "cholesterol", label: "Cholesterol", unit: "mg", dv: 300, kind: "limit", max: 5000 },
  { key: "sodium", label: "Sodium", unit: "mg", dv: 2300, kind: "limit", max: 50000 },
  { key: "potassium", label: "Potassium", unit: "mg", dv: 4700, kind: "goal", max: 50000 },
  { key: "calcium", label: "Calcium", unit: "mg", dv: 1300, kind: "goal", max: 20000 },
  { key: "iron", label: "Iron", unit: "mg", dv: 18, kind: "goal", max: 500 },
  { key: "magnesium", label: "Magnesium", unit: "mg", dv: 420, kind: "goal", max: 10000 },
  { key: "zinc", label: "Zinc", unit: "mg", dv: 11, kind: "goal", max: 500 },
  { key: "vitaminA", label: "Vitamin A", unit: "mcg", dv: 900, kind: "goal", max: 100000 },
  { key: "vitaminC", label: "Vitamin C", unit: "mg", dv: 90, kind: "goal", max: 20000 },
  { key: "vitaminD", label: "Vitamin D", unit: "mcg", dv: 20, kind: "goal", max: 2500 },
  { key: "vitaminB12", label: "Vitamin B12", unit: "mcg", dv: 2.4, kind: "goal", max: 10000 },
  { key: "folate", label: "Folate", unit: "mcg", dv: 400, kind: "goal", max: 20000 }
];
export const MICRO_KEYS = MICROS.map((micro) => micro.key);

// One micronutrient on a meal, or null when it wasn't estimated.
export function mealMicro(meal, key) {
  const value = key === "fiber" ? meal?.fiber : meal?.micros?.[key];
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Math.max(0, Number(value));
}

// Calories and macros added up over a list of meals, plus micronutrients.
// A micronutrient a meal didn't report isn't counted as zero: `microMeals`
// says how many meals reported each one, so a total can be shown as partial.
export function dayTotals(meals) {
  const totals = { meals: 0, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, micros: {}, microMeals: {} };
  for (const meal of live(meals)) {
    for (const key of MACROS) totals[key] += amount(meal[key]);
    for (const key of MICRO_KEYS) {
      const value = mealMicro(meal, key);
      if (value === null) continue;
      totals.micros[key] = (totals.micros[key] || 0) + value;
      totals.microMeals[key] = (totals.microMeals[key] || 0) + 1;
    }
    totals.meals += 1;
  }
  return totals;
}

// Per-day averages of each micronutrient over days where every meal reported
// it, against its Daily Value. Days with a gap would read falsely low.
export function microAverages(intakeDays) {
  return MICROS.map((micro) => {
    const days = intakeDays.filter((day) => day.meals > 0 && (day.microMeals?.[micro.key] || 0) === day.meals);
    const avg = days.length ? days.reduce((sum, day) => sum + day.micros[micro.key], 0) / days.length : null;
    return { ...micro, days: days.length, avg, pct: avg !== null && micro.dv ? (avg / micro.dv) * 100 : null };
  });
}

// Totals per date. A day with no meals is missing from the map: a gap in the
// log, not a day you ate nothing, so averages leave it out.
export function dailyIntake(meals) {
  const byDate = new Map();
  for (const meal of live(meals)) {
    if (!meal.date) continue;
    if (!byDate.has(meal.date)) byDate.set(meal.date, []);
    byDate.get(meal.date).push(meal);
  }
  return new Map([...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => [date, { date, ...dayTotals(list) }]));
}

// Smoothed bodyweight (7-day average) with dates, oldest first.
export function trendWeights(bodyweights) {
  return movingAverage(live(bodyweights).filter((entry) => Number(entry.weight) > 0), 7);
}

// Weigh-ins in [from, to] as a straight-line fit: the change per day and the
// fitted weight at the end. A fit ignores day-to-day water swings and, unlike
// an average, doesn't lag behind. Null until the weigh-ins span `minDays`.
export function weightSlope(bodyweights, from, to, minDays = 7) {
  const points = live(bodyweights)
    .filter((entry) => Number(entry.weight) > 0 && entry.date >= from && entry.date <= to)
    .map((entry) => ({ x: fromDateKey(entry.date) / DAY_MS, y: Number(entry.weight) }));
  if (points.length < 2) return null;
  const xs = points.map((p) => p.x);
  const first = Math.min(...xs);
  const last = Math.max(...xs);
  if (last - first < minDays - 0.5) return null;
  const mx = xs.reduce((sum, x) => sum + x, 0) / points.length;
  const my = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const slope = points.reduce((sum, p) => sum + (p.x - mx) * (p.y - my), 0) / points.reduce((sum, p) => sum + (p.x - mx) ** 2, 0);
  return { perDay: slope, weight: my + slope * (last - mx), start: my + slope * (first - mx), days: Math.round(last - first), count: points.length };
}

// Weekly weight change over the last `days` days, in your unit and as a
// percentage of bodyweight. Null until the weigh-ins span a week.
export function weightRate(bodyweights, { today = dateKey(), days = 21 } = {}) {
  const fit = weightSlope(bodyweights, shiftDateKey(today, -days), today, 7);
  if (!fit) return null;
  const perWeek = fit.perDay * 7;
  return { perWeek, percent: (perWeek / fit.start) * 100, weight: fit.weight, days: fit.days };
}

// Healthy weekly rate of change for each goal, as % of bodyweight.
export const RATE_BANDS = { cut: [-1, -0.5], maintain: [-0.25, 0.25], leanBulk: [0.25, 0.5] };

export function rateStatus(rate, goal = "maintain") {
  if (!rate) return null;
  const [low, high] = RATE_BANDS[goal] || RATE_BANDS.maintain;
  return rate.percent < low ? "below" : rate.percent > high ? "above" : "in";
}

// What you actually burn, worked out from what you ate and how your weight
// moved: average intake minus the energy that went into (or came out of)
// bodyweight. Needs 10 logged days and 10 days' span of weigh-ins;
// before that it falls back to a rough bodyweight multiple. Today is left
// out because it isn't over yet.
export function estimateMaintenance(meals, bodyweights, { unit = "lb", today = dateKey(), days = 28 } = {}) {
  const from = shiftDateKey(today, -days);
  const intake = [...dailyIntake(meals).values()].filter((day) => day.date >= from && day.date < today);
  const loggedDays = intake.length;
  const avgIntake = loggedDays ? intake.reduce((sum, day) => sum + day.calories, 0) / loggedDays : null;
  const trend = trendWeights(bodyweights);
  const latest = trend.length ? trend[trend.length - 1].value : null;
  const base = { avgIntake, loggedDays, days };
  const fit = loggedDays >= 10 ? weightSlope(bodyweights, from, today, 10) : null;
  if (fit) {
    const calories = Math.round(Math.min(6000, Math.max(1200, avgIntake - fit.perDay * (unit === "kg" ? 7700 : 3500))) / 10) * 10;
    const confidence = loggedDays >= 21 && fit.count >= 10 ? "high" : "medium";
    return { ...base, calories, method: "adaptive", confidence, weightPerWeek: fit.perDay * 7 };
  }
  if (latest) return { ...base, calories: Math.round((latest * (unit === "kg" ? 33 : 15)) / 10) * 10, method: "bodyweight", confidence: "rough", weightPerWeek: null };
  return { ...base, calories: null, method: "none", confidence: "none", weightPerWeek: null };
}

// Daily targets from your goal and maintenance. A target set by hand wins.
// Protein is 1 g per lb (2.2 g/kg), fat a quarter of calories, carbs the rest.
export function nutritionTargets(settings = {}, maintenance = null, bodyweight = null) {
  const goal = GOALS.includes(settings.goal) ? settings.goal : "maintain";
  const base = Number(maintenance) || 0;
  const auto = base ? Math.round((goal === "cut" ? base * 0.8 : goal === "leanBulk" ? base + 250 : base) / 10) * 10 : null;
  const calories = Number(settings.calorieTarget) || auto;
  const protein = Number(settings.proteinTarget) || (bodyweight ? Math.round(bodyweight * (settings.unit === "kg" ? 2.2 : 1)) : null);
  const fat = calories ? Math.round((calories * 0.25) / 9) : null;
  const carbs = calories ? Math.max(0, Math.round((calories - (protein || 0) * 4 - (fat || 0) * 9) / 4)) : null;
  return { goal, calories, protein, carbs, fat, autoCalories: !Number(settings.calorieTarget), autoProtein: !Number(settings.proteinTarget) };
}

// Maintenance, targets and weight rate together, the way both the app and
// the server (for the connector) use them.
export function energyPlan(meals, bodyweights, settings = {}, today = dateKey()) {
  const unit = settings.unit === "kg" ? "kg" : "lb";
  const maintenance = estimateMaintenance(meals, bodyweights, { unit, today });
  const trend = trendWeights(bodyweights);
  const targets = nutritionTargets({ ...settings, unit }, maintenance.calories, trend.length ? trend[trend.length - 1].value : null);
  const rate = weightRate(bodyweights, { today });
  return { maintenance, targets, rate, rateStatus: rateStatus(rate, targets.goal) };
}

