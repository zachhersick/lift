// The weekly AI review: Claude reads the same summary assistants get from the
// connector, plus the Coach's own rule cards, and writes a short review.
// It's saved as a coachReview record, so it syncs and stays readable offline.
import Anthropic from "@anthropic-ai/sdk";
import { indexExercises } from "../src/lib/exercises.js";
import { coachingContext, dateKeyIn, findCurrentSplit, insights } from "../src/lib/model.js";
import { httpError } from "./http.js";

export const REVIEW_MODEL = "claude-opus-5-5";

const SYSTEM = `You're the coach inside Lift, a workout and nutrition tracker. Once a week you write a review for one of its users from a JSON summary of their last six weeks: weekly averages of calories and protein with how many days were logged, workouts, sets and volume, their bodyweight trend against their goal (cut, maintain or lean bulk), the maintenance calories Lift measured from their log, their main lifts' estimated 1RM progress and stalls, and the insight cards Lift's own rules produced.

Write it the way a good coach talks to an athlete they know: direct, specific, encouraging without hype. Ground every point in the numbers given, and keep advice within mainstream sports-science evidence: about 10–20 hard sets per muscle a week (setsPerMuscle counts indirect work as half a set), training each muscle about twice a week, taking sets close to failure, 2–3 minutes' rest on compound lifts, 1.6–2.2 g/kg of protein, gaining about 0.25–0.5% of bodyweight a week on a lean bulk or losing 0.5–1% on a cut, a deload when several lifts drop together, and 150+ minutes of cardio a week for health. Don't guess at anything the data doesn't show, and say plainly when too little was logged to judge. The point of the review is connecting eating and training: whether intake supported strength progress, whether the weight trend fits the goal, what to change so the lifts keep going up.

Format: plain text, no markdown headings, bold or tables. Open with one sentence on how the week went. Then two to four short paragraphs or "- " bullets on what's working and what's holding progress back. End with a line "This week:" followed by two or three "- " bullets, each a concrete action with a number (kcal, grams, weight, sets or reps). Stay under 220 words. Use the unit field (lb or kg) for weights. If the data points to very low intake or fast weight loss, say so plainly and suggest checking in with a professional.`;

// Everything the Coach reads, straight from the store. Only the current
// split's days: the others aren't what you're training.
export async function loadTrainingData(store) {
  const [meals, bodyweights, settingsDoc, workouts, exercises, splitDays, splits] = await Promise.all(
    ["meal", "bodyweight", null, "workout", "exercise", "splitDay", "split"].map((kind) => (kind ? store.listKind(kind) : store.get("settings")))
  );
  const split = findCurrentSplit(splits, splitDays, settingsDoc || {});
  return { meals, bodyweights, settings: settingsDoc || {}, timeZone: settingsDoc?.timeZone || "UTC", workouts, exerciseIndex: indexExercises(exercises), splitDays: split.days, splitName: split.name };
}

export async function writeReview({ store, apiKey, client = null, now = Date.now() }) {
  const data = await loadTrainingData(store);
  const dayOf = (time) => dateKeyIn(time, data.timeZone);
  const context = coachingContext({ ...data, now, dayOf, weeks: 6 });
  const { headline, cards } = insights({ ...data, now, dayOf });
  if (!data.workouts.length && !data.meals.length) throw httpError(409, "Log some workouts or meals first.");

  const anthropic = client || new Anthropic({ apiKey, timeout: 50_000, maxRetries: 1 });
  const response = await anthropic.beta.messages.create({
    model: REVIEW_MODEL,
    max_tokens: 16000,
    // If a safety classifier declines, Anthropic retries on its recommended model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Here's my week from Lift. Write my review.\n\n${JSON.stringify({ ...context, rules: [headline, ...cards].filter(Boolean).map(({ title, body, action }) => ({ title, body, action })) })}`
      }
    ]
  });
  if (response.stop_reason === "refusal") throw httpError(502, "The coach couldn't write a review this time.");
  const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
  if (!text) throw httpError(502, "The coach came back empty. Try again.");

  const record = { id: `review_${context.today}`, kind: "coachReview", date: context.today, text, model: response.model, createdAt: now, deleted: false };
  const current = await store.get(record.id);
  const saved = { ...record, updatedAt: Math.max(now, (current?.updatedAt || 0) + 1) };
  await store.upsert([saved]);
  return saved;
}
