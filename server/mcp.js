// The MCP server ChatGPT talks to (/api/mcp): stateless JSON-RPC over HTTP
// POST. Its tools log and fix meals, report a day against your targets and
// hand over a summary of your training and eating for coaching. Meals are
// written as ordinary records, so the phone picks them up on its next sync.
import { createHash } from "node:crypto";
import { BUILT_IN } from "../src/lib/exercises.js";
import { coachingContext, dateKeyIn, dayTotals, energyPlan, live, uid } from "../src/lib/model.js";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const MACRO_PROPS = {
  calories: { type: "number", minimum: 0, maximum: 10000, description: "Total kcal for the meal." },
  protein: { type: "number", minimum: 0, maximum: 1000, description: "Grams." },
  carbs: { type: "number", minimum: 0, maximum: 1000, description: "Grams." },
  fat: { type: "number", minimum: 0, maximum: 1000, description: "Grams." },
  fiber: { type: "number", minimum: 0, maximum: 500, description: "Grams, if known." }
};
const ITEMS = {
  type: "array",
  maxItems: 30,
  description: "What was in the meal.",
  items: { type: "object", properties: { name: { type: "string" }, amount: { type: "string", description: "e.g. 150 g, 2 eggs" }, calories: { type: "number" } }, required: ["name"] }
};

export const TOOLS = [
  {
    name: "log_meal",
    title: "Log meal",
    description:
      "Log a meal the user has actually eaten to Lift, their workout tracker. Only call this once the user confirms they ate it, never for planned or hypothetical meals. Include your best estimate of calories and macros. Pass `ref` (any id unique to this meal) so a retry doesn't log it twice. Returns the day's totals and what's left against their targets.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 120, description: "Short name, e.g. Chicken burrito bowl." },
        ...MACRO_PROPS,
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
    description: "Correct a meal already logged in Lift (from log_meal or get_day). Only the fields given change.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string", maxLength: 120 }, ...MACRO_PROPS, items: ITEMS, date: { type: "string", description: "YYYY-MM-DD" } },
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
    description: "The meals logged in Lift for a day with totals, the user's calorie and macro targets and what's left. Use it before suggesting what to eat next.",
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
  }
];

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

function readItems(items) {
  if (items === undefined) return undefined;
  if (!Array.isArray(items)) throw toolError("items must be a list.");
  return items.slice(0, 30).map((item) => ({
    name: clean(item?.name, 80),
    ...(item?.amount ? { amount: clean(item.amount, 40) } : {}),
    ...(Number.isFinite(Number(item?.calories)) && item?.calories !== null && item?.calories !== "" ? { calories: Math.max(0, Math.round(Number(item.calories))) } : {})
  })).filter((item) => item.name);
}

function readDate(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (!DATE.test(String(value)) || Number.isNaN(Date.parse(`${value}T12:00:00Z`))) throw toolError("date must be YYYY-MM-DD.");
  return String(value);
}

const publicMeal = (meal) => ({ id: meal.id, date: meal.date, name: meal.name, eaten_at: meal.eatenAt ? new Date(meal.eatenAt).toISOString() : null, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, ...(meal.fiber != null ? { fiber: meal.fiber } : {}), items: meal.items || [], source: meal.source });

export function createMcp({ store }) {
  async function data() {
    const [meals, bodyweights, settingsDoc] = await Promise.all([store.listKind("meal"), store.listKind("bodyweight"), store.get("settings")]);
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
      maintenance: { calories: maintenance.calories, confidence: maintenance.confidence }
    };
  }

  async function write(record, now) {
    const current = await store.get(record.id);
    const saved = { ...record, updatedAt: Math.max(now, (current?.updatedAt || 0) + 1) };
    await store.upsert([saved]);
    return saved;
  }

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
      const meal = await write({ id, kind: "meal", source: "chatgpt", name, ...macros, items: readItems(args.items) || [], date, eatenAt, loggedAt: now, deleted: false }, now);
      loaded.meals = [...loaded.meals.filter((m) => m.id !== id), meal];
      return { logged: publicMeal(meal), day: await dayReport(date, loaded) };
    },
    async update_meal(args, now) {
      const meal = await existingMeal(args.id);
      const change = { ...readMacros(args, []) };
      if (args.name !== undefined) change.name = clean(args.name, 120) || meal.name;
      const items = readItems(args.items);
      if (items) change.items = items;
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
      const [loaded, workouts, exercises, splitDays] = await Promise.all([data(), store.listKind("workout"), store.listKind("exercise"), store.listKind("splitDay")]);
      const index = new Map(BUILT_IN.map((exercise) => [exercise.id, exercise]));
      for (const record of exercises) index.set(record.id, { ...index.get(record.id), ...record });
      const weeks = Math.min(12, Math.max(1, Math.round(Number(args.weeks) || 4)));
      return coachingContext({ workouts, meals: loaded.meals, bodyweights: loaded.bodyweights, settings: loaded.settings, exerciseIndex: index, splitDays, now, dayOf: (t) => dateKeyIn(t, loaded.timeZone), weeks });
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
        instructions: "Lift is the user's workout and nutrition tracker. Log meals only after the user confirms they ate them. Use get_day before suggesting food and get_coaching_context for training or diet advice."
      };
    }
    if (method === "ping") return {};
    if (method === "tools/list") return { tools: TOOLS };
    if (method === "tools/call") {
      const tool = tools[params.name];
      if (!tool) throw rpcError(-32602, `Unknown tool: ${params.name}`);
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
