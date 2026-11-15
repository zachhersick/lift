// Lift's pure logic, shared by the app, the server and the tests: no browser
// APIs, so it runs under node --test. Each area lives in its own module under
// ./model/; this file is the public index, so import from "model.js" (UI:
// "@/lib/model") rather than from a module directly. A helper a module shares
// with a sibling but nobody else stays out of this list.
//
//   core       ids, records, splits and rotation, tracking types, history,
//              PRs, progression, dates, new sets and workouts, sync merging
//   plates     plate math, loadable weights, warm-up sets
//   workout    supersets, focus steps, split vs. what you actually did
//   volume     muscles and groups, weekly sets, streaks, rings, bodyweight average
//   nutrition  macros, micronutrients, intake, weight trend, maintenance, targets
//   coach      strength momentum, the coaching context, insights() cards
//   analyzer   analyzeSplit() and applySplitEdit()
//   social     units, Pro features, badges, profile summary, leaderboard, names

export {
  uid,
  live,
  orderedDays,
  MAIN_SPLIT,
  MAIN_SPLIT_NAME,
  splitIdOf,
  listSplits,
  findCurrentSplit,
  fromAssistant,
  finished,
  byNewest,
  byOldest,
  nextSplitDay,
  lastDoneAt,
  isWorking,
  exerciseInUse,
  workingSets,
  TRACKS,
  FIELDS,
  trackOf,
  isComplete,
  setSeconds,
  setDistance,
  e1rm,
  setVolume,
  entryVolume,
  workoutVolume,
  workoutSetCount,
  previousEntry,
  exerciseHistory,
  personalRecords,
  isPersonalRecord,
  suggestion,
  placeholderFor,
  trend,
  startOfWeek,
  newSet,
  newEntry,
  workoutFromDay,
  newer,
  dateKey,
  fromDateKey
} from "./model/core.js";
export {
  PLATES,
  BARS,
  plateBreakdown,
  barFor,
  roundLoadable,
  warmupSets
} from "./model/plates.js";
export {
  supersetLabels,
  workoutSteps,
  stepProgress,
  restsAfter,
  nextInSuperset,
  splitDiff
} from "./model/workout.js";
export {
  muscleSets,
  dailyVolume,
  weekStreak,
  bodyweightId,
  movingAverage,
  defaultWeeklyGoal,
  weekSummary,
  cardioSeconds,
  previousSession,
  MUSCLE_GROUP,
  muscleGroup,
  secondaryGroups,
  indirectMuscles,
  inferredSecondary,
  MAIN_MUSCLES,
  VOLUME_RANGE,
  splitWeeklySets
} from "./model/volume.js";
export {
  MACROS,
  GOALS,
  shiftDateKey,
  dateKeyIn,
  MICROS,
  MICRO_KEYS,
  mealMicro,
  dayTotals,
  microAverages,
  dailyIntake,
  trendWeights,
  weightSlope,
  weightRate,
  RATE_BANDS,
  rateStatus,
  estimateMaintenance,
  nutritionTargets,
  energyPlan
} from "./model/nutrition.js";
export {
  liftProgress,
  REVIEW_MIN_LIFTS,
  liftsThisWeek,
  coachingContext,
  insights
} from "./model/coach.js";
export {
  analyzeSplit,
  applySplitEdit
} from "./model/analyzer.js";
export {
  convertWeight,
  PRO_FEATURES,
  BADGES,
  badges,
  liftKey,
  profileSummary,
  shareFilter,
  compareLifts,
  leaderboard,
  USERNAME,
  cleanUsername,
  usernameProblem,
  nameProblem
} from "./model/social.js";
