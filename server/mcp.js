// The MCP server ChatGPT and Claude talk to (/api/mcp): stateless JSON-RPC over
// HTTP POST. Its tools log and fix meals, report a day against your targets,
// hand over a summary of your training and eating for coaching, and read, add
// and edit splits. Everything is written as ordinary records, so the phone
// picks it up on its next sync. Logged workouts stay out of reach, and a new
// split waits in the Split tab: only you can make one current.
import { createHash } from "node:crypto";
import { EQUIPMENT, indexExercises, MUSCLES } from "../src/lib/exercises.js";
import { coachingContext, dateKeyIn, dayTotals, energyPlan, listSplits, live, MAIN_SPLIT, MICROS, muscleGroup, nextSplitDay, supersetLabels, trackOf, TRACKS, uid } from "../src/lib/model.js";
import { loadTrainingData } from "./coach.js";

// Newest first: a client asking for something else gets the first.
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPLITS = 30;
const MAX_DAYS = 14;
const MAX_DAY_EXERCISES = 30;

const MACRO_PROPS = {
  calories: { type: "number", minimum: 0, maximum: 10000, description: "Total kcal for the meal." },
  protein: { type: "number", minimum: 0, maximum: 1000, description: "Grams." },
  carbs: { type: "number", minimum: 0, maximum: 1000, description: "Grams." },
  fat: { type: "number", minimum: 0, maximum: 1000, description: "Grams." },
  fiber: { type: "number", minimum: 0, maximum: 500, description: "Grams, if known." }
};
// Everything but fiber, which sits with the macros.
const MICRO_FIELDS = MICROS.filter((micro) => micro.key !== "fiber");
const MICRO_SCHEMA = {
  type: "object",
  description: "Micronutrients for the whole meal, only those you can estimate reliably. Leave out the rest: a missing value means unknown, not zero.",
  properties: Object.fromEntries(MICRO_FIELDS.map((micro) => [micro.key, { type: "number", minimum: 0, maximum: micro.max, description: `${micro.label} in ${micro.unit}.` }])),
  additionalProperties: false
};
const ITEMS = {
  type: "array",
  maxItems: 30,
  description: "What was in the meal.",
  items: { type: "object", properties: { name: { type: "string" }, amount: { type: "string", description: "e.g. 150 g, 2 eggs" }, calories: { type: "number" } }, required: ["name"] }
};

// One day of a split, as create_split and update_split take it.
const DAY_FIELDS = {
  name: { type: "string", maxLength: 60, description: "e.g. Push, Legs, Rest." },
  rest: { type: "boolean", description: "A rest day, which keeps its place in the rotation and has no exercises." },
  exercises: {
    type: "array",
    maxItems: MAX_DAY_EXERCISES,
    description: "In order, each exercise at most once a day.",
    items: {
      type: "object",
      properties: {
        exercise_id: { type: "string", description: "From get_exercises or create_exercise." },
        sets: { type: "integer", minimum: 1, maximum: 12, description: "Target sets, default 3." },
        rep_min: { type: "integer", minimum: 1, maximum: 30, description: "Bottom of the rep range, default 8." },
        rep_max: { type: "integer", minimum: 1, maximum: 30, description: "Top of the rep range, default 12." },
        rest_sec: { type: "integer", minimum: 0, maximum: 600, description: "Rest between sets. Defaults to the user's usual rest." },
        superset: { type: "string", maxLength: 4, description: "The same label on neighbouring exercises makes them a superset, e.g. A." }
      },
      required: ["exercise_id"]
    }
  }
};

export const TOOLS = [
  {
    name: "log_meal",
    title: "Log meal",
    description:
      "Log a meal the user has actually eaten to Lift, their workout tracker. Only call this once the user confirms they ate it, never for planned or hypothetical meals. Include your best estimate of calories and macros, plus fiber and any micronutrients (sodium, potassium, vitamins, minerals…) you can estimate reliably. Pass `ref` (any id unique to this meal) so a retry doesn't log it twice. Returns the day's totals, what's left against their targets and micronutrients against Daily Values.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 120, description: "Short name, e.g. Chicken burrito bowl." },
        ...MACRO_PROPS,
        micros: MICRO_SCHEMA,
        items: ITEMS,
        eaten_at: { type: "string", description: "ISO 8601 time it was eaten. Defaults to now." },
        date: { type: "string", description: "YYYY-MM-DD the meal counts toward, if not the day of eaten_at in the user's time zone." },
        ref: { type: "string", maxLength: 100, description: "Idempotency key for this meal." }
      },
      required: ["name", "calories", "protein", "carbs", "fat"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "update_meal",
    title: "Update meal",
    description: "Correct a meal already logged in Lift (from log_meal or get_day). Only the fields given change; micronutrients given are merged into the ones already logged.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string", maxLength: 120 }, ...MACRO_PROPS, micros: MICRO_SCHEMA, items: ITEMS, date: { type: "string", description: "YYYY-MM-DD" } },
      required: ["id"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "delete_meal",
    title: "Delete meal",
    description: "Remove a meal from Lift, e.g. one logged by mistake.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "get_day",
    title: "Get day",
    description: "The meals logged in Lift for a day with totals, the user's calorie and macro targets and what's left, and micronutrients against their Daily Values. Use it before suggesting what to eat next.",
    inputSchema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD. Defaults to today in the user's time zone." } } },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "get_coaching_context",
    title: "Get coaching context",
    description:
      "A summary of the user's last weeks from Lift: weekly calories and protein, logged days, workouts, sets and volume, bodyweight trend against their goal (cut, maintain or lean bulk), measured maintenance calories, and their main lifts' estimated 1RM progress and stalls. Use it to give advice on eating and training for progressive overload.",
    inputSchema: { type: "object", properties: { weeks: { type: "integer", minimum: 1, maximum: 12, description: "How many weeks, default 4." } } },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "get_splits",
    title: "Get splits",
    description: "Every training split in Lift with its days and exercises, which one is current, and the next day in the current split's rotation. Use it before creating or changing a split.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "get_exercises",
    title: "Get exercises",
    description: "The exercises the user can put in a split: Lift's library and their own, with ids, muscles, equipment and how each is tracked. Use these ids in create_split and update_split.",
    inputSchema: {
      type: "object",
      properties: {
        muscle: { type: "string", description: "Only this muscle or muscle group, e.g. quads, back." },
        search: { type: "string", maxLength: 60, description: "Only names containing this." }
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "create_exercise",
    title: "Create exercise",
    description: "Add an exercise to the user's library, for a split that needs one get_exercises doesn't have. If they already have one by that name, returns it instead.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 80 },
        muscle: { type: "string", enum: MUSCLES, description: "The primary muscle." },
        secondary: { type: "array", items: { type: "string", enum: MUSCLES }, description: "Muscles it also works, each counted as half a set. Leave out to infer them from the name." },
        equipment: { type: "string", enum: EQUIPMENT },
        track: { type: "string", enum: TRACKS, description: "strength is weight and reps, cardio is incline, speed and time, timed is time with optional reps (planks, plyometrics). Default strength." }
      },
      required: ["name", "muscle"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "create_split",
    title: "Create split",
    description:
      "Create a new named training split in Lift when the user asks for one: a rotation of training and rest days that repeats. It does not become their current split and changes nothing they're doing now. It appears in the app's Split tab, where only they can make it current, so tell them to do that. Pass `ref` (any id unique to this split) so a retry doesn't create it twice.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 60, description: "e.g. Ski season prep." },
        days: { type: "array", minItems: 1, maxItems: MAX_DAYS, description: "The rotation in order, rest days included.", items: { type: "object", properties: DAY_FIELDS, required: ["name"] } },
        ref: { type: "string", maxLength: 100, description: "Idempotency key for this split." }
      },
      required: ["name", "days"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "update_split",
    title: "Update split",
    description:
      "Rename a split or change its days, including the current split, where changes apply right away, so only do that when the user asks. `days` replaces the whole rotation: keep a day's `id` from get_splits to keep its place in the rotation, leave `exercises` out to keep that day's exercises, and days left out are removed (workouts already logged stay in History). It can't change which split is current.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The split's id from get_splits." },
        name: { type: "string", maxLength: 60 },
        days: { type: "array", minItems: 1, maxItems: MAX_DAYS, items: { type: "object", properties: { id: { type: "string", description: "An existing day of this split. Leave out for a new day." }, ...DAY_FIELDS }, required: ["name"] } }
      },
      required: ["id"]
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  }
];

// What a connection needs to have approved before it gets these tools.
const SPLIT_TOOLS = new Set(["get_splits", "get_exercises", "create_exercise", "create_split", "update_split"]);

const rpcError = (code, message) => Object.assign(new Error(message), { rpc: code });
const toolError = (message) => Object.assign(new Error(message), { tool: true });

const clean = (value, max) => String(value ?? "").trim().slice(0, max);
function number(value, max, field) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) throw toolError(`${field} must be a number from 0 to ${max}.`);
  return Math.round(n * 10) / 10;
}

function readMacros(args, required) {
  const out = {};
  for (const [field, { maximum }] of Object.entries(MACRO_PROPS)) {
    const value = number(args[field], maximum, field);
    if (value === undefined && required.includes(field)) throw toolError(`${field} is required.`);
    if (value !== undefined) out[field] = value;
  }
  return out;
}

function readMicros(micros) {
  if (micros === undefined || micros === null) return undefined;
  if (typeof micros !== "object" || Array.isArray(micros)) throw toolError("micros must be an object.");
  const out = {};
  for (const [key, value] of Object.entries(micros)) {
    const micro = MICRO_FIELDS.find((m) => m.key === key);
    if (!micro) throw toolError(`Unknown micronutrient "${key}". Use: ${MICRO_FIELDS.map((m) => m.key).join(", ")}.`);
    const n = number(value, micro.max, key);
    if (n !== undefined) out[key] = n;
  }
  return out;
}

function readItems(items) {
  if (items === undefined) return undefined;
  if (!Array.isArray(items)) throw toolError("items must be a list.");
  return items.slice(0, 30).map((item) => ({
    name: clean(item?.name, 80),
    ...(item?.amount ? { amount: clean(item.amount, 40) } : {}),
    ...(Number.isFinite(Number(item?.calories)) && item?.calories !== null && item?.calories !== "" ? { calories: Math.max(0, Math.round(Number(item.calories))) } : {})
  })).filter((item) => item.name);
}

function whole(value, min, max, field) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw toolError(`${field} must be a whole number from ${min} to ${max}.`);
  return n;
}

// A day's exercises in the format split days store, every id checked.
function readPlan(list, exercises, defaultRest) {
  if (!Array.isArray(list) || list.length > MAX_DAY_EXERCISES) throw toolError(`exercises must be a list of at most ${MAX_DAY_EXERCISES}.`);
  const seen = new Set();
  const supersets = new Map();
  return list.map((item) => {
    const id = String(item?.exercise_id || "");
    const exercise = exercises.get(id);
    if (!exercise || exercise.deleted) throw toolError(`No exercise with id "${id}". Use get_exercises, or create_exercise for a new one.`);
    if (seen.has(id)) throw toolError(`${exercise.name} is in the same day twice.`);
    seen.add(id);
    const repMin = whole(item.rep_min, 1, 30, "rep_min") ?? 8;
    const label = item.superset ? clean(item.superset, 4).toUpperCase() : "";
    if (label && !supersets.has(label)) supersets.set(label, uid("ss"));
    return {
      exerciseId: id,
      targetSets: whole(item.sets, 1, 12, "sets") ?? (trackOf(exercise) === "cardio" ? 1 : 3),
      repMin,
      repMax: Math.max(repMin, whole(item.rep_max, 1, 30, "rep_max") ?? Math.max(repMin, 12)),
      restSec: whole(item.rest_sec, 0, 600, "rest_sec") ?? defaultRest,
      ...(label ? { supersetId: supersets.get(label) } : {})
    };
  });
}

function readDays(days, exercises, defaultRest) {
  if (!Array.isArray(days) || !days.length || days.length > MAX_DAYS) throw toolError(`days must be a list of 1 to ${MAX_DAYS} days.`);
  return days.map((day) => {
    const name = clean(day?.name, 60);
    if (!name) throw toolError("Every day needs a name.");
    const rest = Boolean(day.rest);
    return { ...(day.id ? { id: String(day.id) } : {}), name, rest, ...(rest ? { exercises: [] } : day.exercises === undefined ? {} : { exercises: readPlan(day.exercises, exercises, defaultRest) }) };
  });
}

const publicExercise = (exercise) => ({ id: exercise.id, name: exercise.name, muscle: exercise.muscle, equipment: exercise.equipment, track: trackOf(exercise) });

function publicSplit(split, exercises) {
  return {
    id: split.id,
    name: split.name,
    current: split.current,
    ...(split.source ? { source: split.source } : {}),
    days: split.days.map((day) => {
      const items = day.exercises || [];
      const labels = supersetLabels(items);
      return {
        id: day.id,
        name: day.name,
        rest: Boolean(day.rest),
        exercises: items.map((item, index) => ({
          exercise_id: item.exerciseId,
          name: exercises.get(item.exerciseId)?.name || "Unknown exercise",
          sets: item.targetSets,
          rep_min: item.repMin,
          rep_max: item.repMax,
          rest_sec: item.restSec,
          ...(labels[index] ? { superset: labels[index].group } : {})
        }))
      };
    })
  };
}

function readDate(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (!DATE.test(String(value)) || Number.isNaN(Date.parse(`${value}T12:00:00Z`))) throw toolError("date must be YYYY-MM-DD.");
  return String(value);
}

const publicMeal = (meal) => ({ id: meal.id, date: meal.date, name: meal.name, eaten_at: meal.eatenAt ? new Date(meal.eatenAt).toISOString() : null, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, ...(meal.fiber != null ? { fiber: meal.fiber } : {}), ...(meal.micros && Object.keys(meal.micros).length ? { micros: meal.micros } : {}), items: meal.items || [], source: meal.source });

// `app` is the assistant the connection approved (see tokenPair in oauth.js).
export function createMcp({ store, app = null }) {
  async function data() {
    const [{ meal: meals, bodyweight: bodyweights }, settingsDoc] = await Promise.all([store.listKinds(["meal", "bodyweight"]), store.get("settings")]);
    return { meals, bodyweights, settings: settingsDoc || {}, timeZone: settingsDoc?.timeZone || "UTC" };
  }

  async function dayReport(date, loaded) {
    const { meals, bodyweights, settings } = loaded;
    const list = live(meals).filter((meal) => meal.date === date).sort((a, b) => (a.eatenAt || 0) - (b.eatenAt || 0));
    const totals = dayTotals(list);
    const { targets, maintenance } = energyPlan(meals, bodyweights, settings, date);
    const left = (key) => (targets[key] == null ? null : Math.round(targets[key] - totals[key]));
    return {
      date,
      meals: list.map(publicMeal),
      totals: { calories: Math.round(totals.calories), protein: Math.round(totals.protein), carbs: Math.round(totals.carbs), fat: Math.round(totals.fat), fiber: Math.round(totals.fiber) },
      targets: { goal: targets.goal, calories: targets.calories, protein: targets.protein, carbs: targets.carbs, fat: targets.fat },
      remaining: { calories: left("calories"), protein: left("protein"), carbs: left("carbs"), fat: left("fat") },
      // Only nutrients some meal reported; partial when not every meal did.
      micros: MICROS.filter((micro) => totals.microMeals[micro.key]).map((micro) => ({
        nutrient: micro.key,
        amount: Math.round(totals.micros[micro.key] * 10) / 10,
        unit: micro.unit,
        daily_value: micro.dv,
        percent_dv: micro.dv ? Math.round((totals.micros[micro.key] / micro.dv) * 100) : null,
        kind: micro.kind,
        ...(totals.microMeals[micro.key] < list.length ? { partial: `${totals.microMeals[micro.key]} of ${list.length} meals` } : {})
      })),
      maintenance: { calories: maintenance.calories, confidence: maintenance.confidence }
    };
  }

  async function write(record, now) {
    const current = await store.get(record.id);
    const saved = { ...record, updatedAt: Math.max(now, (current?.updatedAt || 0) + 1) };
    await store.upsert([saved]);
    return saved;
  }

  async function writeAll(records, now) {
    const stamped = await Promise.all(records.map(async (record) => ({ ...record, updatedAt: Math.max(now, ((await store.get(record.id))?.updatedAt || 0) + 1) })));
    await store.upsert(stamped);
  }

  async function splitData() {
    const [{ split: splits, splitDay: days, exercise: exercises }, settings] = await Promise.all([store.listKinds(["split", "splitDay", "exercise"]), store.get("settings")]);
    return { splits: listSplits(splits, days, settings || {}), defaultRest: settings?.defaultRest ?? 120, exercises: indexExercises(exercises) };
  }

  // A split's days as records. Days of the main split carry no splitId, the
  // same as ones the app wrote before there were several splits.
  const dayRecord = (splitId, day, position, existing) => ({
    ...existing,
    ...day,
    id: day.id || uid("d"),
    kind: "splitDay",
    ...(splitId === MAIN_SPLIT ? {} : { splitId }),
    position,
    exercises: day.exercises || existing?.exercises || [],
    deleted: false
  });

  async function existingMeal(id) {
    const meal = await store.get(String(id || ""));
    if (!meal || meal.kind !== "meal" || meal.deleted) throw toolError("No meal with that id. Use get_day to find it.");
    return meal;
  }

  const tools = {
    async log_meal(args, now) {
      const name = clean(args.name, 120);
      if (!name) throw toolError("name is required.");
      const macros = readMacros(args, ["calories", "protein", "carbs", "fat"]);
      const eatenAt = args.eaten_at ? Date.parse(String(args.eaten_at)) : now;
      if (!Number.isFinite(eatenAt) || eatenAt > now + 86_400_000) throw toolError("eaten_at must be an ISO 8601 time, not in the future.");
      const loaded = await data();
      const date = readDate(args.date) || dateKeyIn(eatenAt, loaded.timeZone);
      const ref = args.ref ? clean(args.ref, 100) : "";
      const id = ref ? `meal_c${createHash("sha256").update(ref).digest("hex").slice(0, 20)}` : uid("meal");
      const micros = readMicros(args.micros) || {};
      const meal = await write({ id, kind: "meal", source: app || "chatgpt", name, ...macros, micros, items: readItems(args.items) || [], date, eatenAt, loggedAt: now, deleted: false }, now);
      loaded.meals = [...loaded.meals.filter((m) => m.id !== id), meal];
      return { logged: publicMeal(meal), day: await dayReport(date, loaded) };
    },
    async update_meal(args, now) {
      const meal = await existingMeal(args.id);
      const change = { ...readMacros(args, []) };
      if (args.name !== undefined) change.name = clean(args.name, 120) || meal.name;
      const items = readItems(args.items);
      if (items) change.items = items;
      const micros = readMicros(args.micros);
      if (micros) change.micros = { ...(meal.micros || {}), ...micros };
      const date = readDate(args.date);
      if (date) change.date = date;
      const saved = await write({ ...meal, ...change }, now);
      const loaded = await data();
      return { updated: publicMeal(saved), day: await dayReport(saved.date, loaded) };
    },
    async delete_meal(args, now) {
      const meal = await existingMeal(args.id);
      await write({ ...meal, deleted: true }, now);
      return { deleted: meal.id, day: await dayReport(meal.date, await data()) };
    },
    async get_day(args, now) {
      const loaded = await data();
      return dayReport(readDate(args.date) || dateKeyIn(now, loaded.timeZone), loaded);
    },
    async get_coaching_context(args, now) {
      const loaded = await loadTrainingData(store);
      const weeks = Math.min(12, Math.max(1, Math.round(Number(args.weeks) || 4)));
      return coachingContext({ ...loaded, now, dayOf: (t) => dateKeyIn(t, loaded.timeZone), weeks });
    },
    async get_splits() {
      const { splits, exercises } = await splitData();
      const current = splits.find((split) => split.current);
      const next = nextSplitDay(current.days, await store.listKind("workout"));
      return { current_split_id: current.id, next_day: next?.day.name || null, splits: splits.map((split) => publicSplit(split, exercises)) };
    },
    async get_exercises(args) {
      const { exercises } = await splitData();
      const muscle = args.muscle ? String(args.muscle).toLowerCase() : "";
      const search = args.search ? String(args.search).toLowerCase() : "";
      const list = [...exercises.values()]
        .filter((exercise) => !exercise.deleted)
        .filter((exercise) => !muscle || exercise.muscle === muscle || muscleGroup(exercise.muscle) === muscle)
        .filter((exercise) => !search || exercise.name.toLowerCase().includes(search))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { exercises: list.map(publicExercise) };
    },
    async create_exercise(args, now) {
      const name = clean(args.name, 80);
      if (!name) throw toolError("name is required.");
      if (!MUSCLES.includes(args.muscle)) throw toolError(`muscle must be one of: ${MUSCLES.join(", ")}.`);
      const equipment = args.equipment ?? "other";
      if (!EQUIPMENT.includes(equipment)) throw toolError(`equipment must be one of: ${EQUIPMENT.join(", ")}.`);
      const track = args.track ?? (args.muscle === "cardio" ? "cardio" : "strength");
      if (!TRACKS.includes(track)) throw toolError(`track must be one of: ${TRACKS.join(", ")}.`);
      if (args.secondary !== undefined && (!Array.isArray(args.secondary) || !args.secondary.every((muscle) => MUSCLES.includes(muscle)))) throw toolError("secondary must be a list of muscles.");
      const { exercises } = await splitData();
      const same = [...exercises.values()].find((exercise) => !exercise.deleted && exercise.name.toLowerCase() === name.toLowerCase());
      if (same) return { exercise: publicExercise(same), already_existed: true };
      const saved = await write({ id: uid("x"), kind: "exercise", name, muscle: args.muscle, equipment, track, ...(args.secondary ? { secondary: args.secondary } : {}), deleted: false }, now);
      return { exercise: publicExercise(saved), already_existed: false };
    },
    async create_split(args, now) {
      const name = clean(args.name, 60);
      if (!name) throw toolError("name is required.");
      const loaded = await splitData();
      const ref = args.ref ? clean(args.ref, 100) : "";
      const id = ref ? `split_c${createHash("sha256").update(ref).digest("hex").slice(0, 20)}` : uid("split");
      const again = loaded.splits.find((split) => split.id === id);
      if (again) return { created: publicSplit(again, loaded.exercises), already_existed: true };
      if (loaded.splits.length >= MAX_SPLITS) throw toolError(`Lift holds up to ${MAX_SPLITS} splits. Ask the user to delete one in the Split tab.`);
      const days = readDays(args.days, loaded.exercises, loaded.defaultRest).map((day, position) => dayRecord(id, day, position));
      await writeAll([{ id, kind: "split", name, source: app, createdAt: now, deleted: false }, ...days], now);
      const after = await splitData();
      return {
        created: publicSplit(after.splits.find((split) => split.id === id), after.exercises),
        already_existed: false,
        next_step: "It isn't current yet. The user can open the Split tab in Lift, tap it and choose Make current."
      };
    },
    async update_split(args, now) {
      const loaded = await splitData();
      const split = loaded.splits.find((candidate) => candidate.id === String(args.id || ""));
      if (!split) throw toolError("No split with that id. Use get_splits to find it.");
      const changes = [];
      if (args.name !== undefined) {
        const name = clean(args.name, 60);
        if (!name) throw toolError("name can't be empty.");
        const { days, current, ...record } = split;
        changes.push({ ...record, name, deleted: false });
      }
      if (args.days !== undefined) {
        const existing = new Map(split.days.map((day) => [day.id, day]));
        const days = readDays(args.days, loaded.exercises, loaded.defaultRest);
        const kept = days.map((day) => day.id).filter(Boolean);
        if (kept.some((id) => !existing.has(id)) || new Set(kept).size !== kept.length) throw toolError("A day's id must be one of this split's days, used once. Leave it out for a new day.");
        changes.push(...days.map((day, position) => dayRecord(split.id, day, position, existing.get(day.id))));
        changes.push(...split.days.filter((day) => !kept.includes(day.id)).map((day) => ({ ...day, deleted: true })));
      }
      if (changes.length) await writeAll(changes, now);
      const after = await splitData();
      return { updated: publicSplit(after.splits.find((candidate) => candidate.id === split.id), after.exercises) };
    }
  };

  async function call(message, now) {
    const { method, params = {} } = message;
    if (method === "initialize") {
      const requested = String(params.protocolVersion || "");
      return {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "lift", title: "Lift", version: "1.0.0" },
        instructions: "Lift is the user's workout and nutrition tracker. Log meals only after the user confirms they ate them. Use get_day before suggesting food and get_coaching_context for training or diet advice. To build a training split, read get_splits and get_exercises first, then create_split; the user makes it current themselves in the app."
      };
    }
    if (method === "ping") return {};
    if (method === "tools/list") return { tools: TOOLS.filter((tool) => app || !SPLIT_TOOLS.has(tool.name)) };
    if (method === "tools/call") {
      const tool = tools[params.name];
      if (!tool) throw rpcError(-32602, `Unknown tool: ${params.name}`);
      if (SPLIT_TOOLS.has(params.name) && !app) return { content: [{ type: "text", text: "This connection was approved before Lift had split tools. Remove the connector and add it again to allow them." }], isError: true };
      try {
        const result = await tool(params.arguments || {}, now);
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false };
      } catch (error) {
        if (!error.tool) throw error;
        return { content: [{ type: "text", text: error.message }], isError: true };
      }
    }
    throw rpcError(-32601, `Method not found: ${method}`);
  }

  // One JSON-RPC message (or a batch). Notifications get no reply.
  async function handle(body, now = Date.now()) {
    const messages = Array.isArray(body) ? body : [body];
    const replies = [];
    for (const message of messages) {
      if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
        replies.push({ jsonrpc: "2.0", id: message?.id ?? null, error: { code: -32600, message: "Invalid request." } });
        continue;
      }
      if (message.id === undefined || message.id === null) continue;
      try {
        replies.push({ jsonrpc: "2.0", id: message.id, result: await call(message, now) });
      } catch (error) {
        replies.push({ jsonrpc: "2.0", id: message.id, error: { code: error.rpc || -32603, message: error.rpc ? error.message : "Something went wrong." } });
      }
    }
    if (!replies.length) return null;
    return Array.isArray(body) ? replies : replies[0];
  }

  return { handle, tools };
}
