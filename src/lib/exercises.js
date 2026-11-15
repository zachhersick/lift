// The built-in exercise library and starter splits. Built-ins live in code,
// not in the database; only exercises you create (or edit) are stored.

// Muscle groups, for filtering and weekly volume, and every muscle you can
// give an exercise: each group followed by the specific muscles in it, which
// count toward the group (MUSCLE_GROUP in model.js).
export const MUSCLE_GROUPS = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "adductors", "calves", "core", "full body", "cardio"];
export const MUSCLES = ["chest", "back", "lats", "mid back", "traps", "lower back", "shoulders", "front delts", "side delts", "rear delts", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "abductors", "adductors", "calves", "core", "full body", "cardio"];
export const EQUIPMENT = ["barbell", "dumbbell", "machine", "plate loaded", "cable", "bodyweight", "smith", "kettlebell", "band", "other"];

const LIST = [
  // chest
  ["Bench Press", "chest", "barbell"],
  ["Incline Bench Press", "chest", "barbell"],
  ["Decline Bench Press", "chest", "barbell"],
  ["Dumbbell Bench Press", "chest", "dumbbell"],
  ["Incline Dumbbell Press", "chest", "dumbbell"],
  ["Dumbbell Fly", "chest", "dumbbell"],
  ["Cable Fly", "chest", "cable"],
  ["Low-to-High Cable Fly", "chest", "cable"],
  ["Pec Deck", "chest", "machine"],
  ["Machine Chest Press", "chest", "machine"],
  ["Incline Machine Press", "chest", "machine"],
  ["Smith Machine Bench Press", "chest", "smith"],
  ["Smith Machine Incline Press", "chest", "smith"],
  ["Push-Up", "chest", "bodyweight"],
  ["Chest Dip", "chest", "bodyweight"],
  // back
  ["Deadlift", "back", "barbell"],
  ["Barbell Row", "mid back", "barbell"],
  ["Pendlay Row", "mid back", "barbell"],
  ["T-Bar Row", "mid back", "barbell"],
  ["Rack Pull", "back", "barbell"],
  ["Pull-Up", "lats", "bodyweight"],
  ["Chin-Up", "lats", "bodyweight"],
  ["Assisted Pull-Up", "lats", "machine"],
  ["Lat Pulldown", "lats", "cable"],
  ["Close-Grip Lat Pulldown", "lats", "cable"],
  ["Single-Arm Lat Pulldown", "lats", "cable"],
  ["Seated Cable Row", "mid back", "cable"],
  ["Straight-Arm Pulldown", "lats", "cable"],
  ["One-Arm Dumbbell Row", "lats", "dumbbell"],
  ["Chest-Supported Dumbbell Row", "mid back", "dumbbell"],
  ["Chest-Supported Machine Row", "mid back", "machine"],
  ["Machine Lat Pullover", "lats", "machine"],
  ["Back Extension", "lower back", "bodyweight"],
  ["Barbell Shrug", "traps", "barbell"],
  ["Dumbbell Shrug", "traps", "dumbbell"],
  // shoulders
  ["Overhead Press", "front delts", "barbell"],
  ["Seated Dumbbell Shoulder Press", "front delts", "dumbbell"],
  ["Arnold Press", "front delts", "dumbbell"],
  ["Machine Shoulder Press", "front delts", "machine"],
  ["Dumbbell Lateral Raise", "side delts", "dumbbell"],
  ["Cable Lateral Raise", "side delts", "cable"],
  ["Machine Lateral Raise", "side delts", "machine"],
  ["Dumbbell Front Raise", "front delts", "dumbbell"],
  ["Rear Delt Dumbbell Fly", "rear delts", "dumbbell"],
  ["Reverse Pec Deck", "rear delts", "machine"],
  ["Face Pull", "rear delts", "cable"],
  ["Upright Row", "side delts", "barbell"],
  // biceps
  ["Barbell Curl", "biceps", "barbell"],
  ["EZ-Bar Curl", "biceps", "barbell"],
  ["Dumbbell Curl", "biceps", "dumbbell"],
  ["Hammer Curl", "biceps", "dumbbell"],
  ["Incline Dumbbell Curl", "biceps", "dumbbell"],
  ["Preacher Curl", "biceps", "barbell"],
  ["Machine Preacher Curl", "biceps", "machine"],
  ["Cable Curl", "biceps", "cable"],
  ["Bayesian Cable Curl", "biceps", "cable"],
  ["Concentration Curl", "biceps", "dumbbell"],
  // triceps
  ["Rope Pushdown", "triceps", "cable"],
  ["Bar Pushdown", "triceps", "cable"],
  ["Overhead Cable Extension", "triceps", "cable"],
  ["Overhead Dumbbell Extension", "triceps", "dumbbell"],
  ["Skull Crusher", "triceps", "barbell"],
  ["Close-Grip Bench Press", "triceps", "barbell"],
  ["Tricep Dip", "triceps", "bodyweight"],
  ["Dumbbell Kickback", "triceps", "dumbbell"],
  ["Machine Tricep Extension", "triceps", "machine"],
  // forearms
  ["Wrist Curl", "forearms", "dumbbell"],
  ["Reverse Curl", "forearms", "barbell"],
  // quads
  ["Back Squat", "quads", "barbell"],
  ["Front Squat", "quads", "barbell"],
  ["Hack Squat", "quads", "machine"],
  ["Pendulum Squat", "quads", "machine"],
  ["Leg Press", "quads", "machine"],
  ["Leg Extension", "quads", "machine"],
  ["Smith Machine Squat", "quads", "smith"],
  ["Bulgarian Split Squat", "quads", "dumbbell"],
  ["Walking Lunge", "quads", "dumbbell"],
  ["Goblet Squat", "quads", "dumbbell"],
  ["Step-Up", "quads", "dumbbell"],
  // hamstrings
  ["Romanian Deadlift", "hamstrings", "barbell"],
  ["Dumbbell Romanian Deadlift", "hamstrings", "dumbbell"],
  ["Stiff-Leg Deadlift", "hamstrings", "barbell"],
  ["Lying Leg Curl", "hamstrings", "machine"],
  ["Seated Leg Curl", "hamstrings", "machine"],
  ["Good Morning", "hamstrings", "barbell"],
  ["Nordic Curl", "hamstrings", "bodyweight"],
  // glutes
  ["Hip Thrust", "glutes", "barbell"],
  ["Machine Hip Thrust", "glutes", "machine"],
  ["Glute Bridge", "glutes", "bodyweight"],
  ["Cable Kickback", "glutes", "cable"],
  ["Hip Abduction", "abductors", "machine"],
  ["Hip Adduction", "adductors", "machine"],
  // calves
  ["Standing Calf Raise", "calves", "machine"],
  ["Seated Calf Raise", "calves", "machine"],
  ["Leg Press Calf Raise", "calves", "machine"],
  // core
  ["Plank", "core", "bodyweight", "timed"],
  ["Side Plank", "core", "bodyweight", "timed"],
  ["Hanging Leg Raise", "core", "bodyweight"],
  ["Cable Crunch", "core", "cable"],
  ["Ab Wheel Rollout", "core", "other"],
  ["Machine Crunch", "core", "machine"],
  ["Decline Sit-Up", "core", "bodyweight"],
  ["Russian Twist", "core", "bodyweight"],
  // full body
  ["Power Clean", "full body", "barbell"],
  ["Kettlebell Swing", "full body", "kettlebell"],
  ["Farmer's Carry", "full body", "dumbbell"],
  ["Wall Sit", "quads", "bodyweight", "timed"],
  // plyo and conditioning: time, optional reps
  ["Box Jumps", "full body", "bodyweight", "timed"],
  ["Jump Rope", "full body", "other", "timed"],
  ["Burpees", "full body", "bodyweight", "timed"],
  ["Jumping Jacks", "full body", "bodyweight", "timed"],
  ["Mountain Climbers", "core", "bodyweight", "timed"],
  ["Broad Jumps", "full body", "bodyweight", "timed"],
  ["Skater Hops", "full body", "bodyweight", "timed"],
  ["Battle Ropes", "full body", "other", "timed"],
  ["Sled Push", "full body", "other", "timed"],
  // cardio: incline, speed, time
  ["Treadmill Walk", "cardio", "machine", "cardio"],
  ["Incline Walk", "cardio", "machine", "cardio"],
  ["Treadmill Run", "cardio", "machine", "cardio"],
  ["StairMaster", "cardio", "machine", "cardio"],
  ["Stationary Bike", "cardio", "machine", "cardio"],
  ["Elliptical", "cardio", "machine", "cardio"],
  ["Rowing Machine", "cardio", "machine", "cardio"],
  ["Assault Bike", "cardio", "machine", "cardio"]
];

export const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const BUILT_IN = LIST.map(([name, muscle, equipment, track = "strength"]) => ({ id: `b_${slug(name)}`, kind: "exercise", name, muscle, equipment, track, builtIn: true }));

// Every exercise by id: the library with stored records (your own exercises
// and edits to built-ins) on top. Shared by the app's store and the server.
export function indexExercises(stored = []) {
  const index = new Map(BUILT_IN.map((exercise) => [exercise.id, exercise]));
  for (const record of stored) index.set(record.id, { ...index.get(record.id), ...record });
  return index;
}

const ex = (name) => `b_${slug(name)}`;
const item = (name, targetSets, repMin, repMax, restSec) => ({ exerciseId: ex(name), targetSets, repMin, repMax, restSec });

export const TEMPLATES = [
  {
    id: "ppl",
    name: "Push / Pull / Legs",
    blurb: "Push, Pull, Legs, Rest, then repeat",
    days: [
      { name: "Push", exercises: [item("Bench Press", 3, 5, 8, 180), item("Incline Dumbbell Press", 3, 8, 12, 120), item("Seated Dumbbell Shoulder Press", 3, 8, 12, 120), item("Dumbbell Lateral Raise", 3, 12, 15, 60), item("Rope Pushdown", 3, 10, 15, 60), item("Overhead Cable Extension", 2, 10, 15, 60)] },
      { name: "Pull", exercises: [item("Pull-Up", 3, 6, 10, 150), item("Barbell Row", 3, 6, 10, 150), item("Lat Pulldown", 3, 8, 12, 90), item("Seated Cable Row", 3, 10, 12, 90), item("Face Pull", 3, 12, 15, 60), item("Dumbbell Curl", 3, 10, 12, 60), item("Hammer Curl", 2, 10, 12, 60)] },
      { name: "Legs", exercises: [item("Back Squat", 3, 5, 8, 180), item("Romanian Deadlift", 3, 8, 10, 150), item("Leg Press", 3, 10, 12, 120), item("Lying Leg Curl", 3, 10, 12, 90), item("Leg Extension", 3, 12, 15, 60), item("Standing Calf Raise", 4, 10, 15, 60)] },
      { name: "Rest", rest: true, exercises: [] }
    ]
  },
  {
    id: "upper-lower",
    name: "Upper / Lower",
    blurb: "Upper, Lower, Rest, then repeat",
    days: [
      { name: "Upper", exercises: [item("Bench Press", 3, 5, 8, 180), item("Barbell Row", 3, 6, 10, 150), item("Seated Dumbbell Shoulder Press", 3, 8, 12, 120), item("Lat Pulldown", 3, 8, 12, 90), item("EZ-Bar Curl", 2, 10, 12, 60), item("Rope Pushdown", 2, 10, 15, 60)] },
      { name: "Lower", exercises: [item("Back Squat", 3, 5, 8, 180), item("Romanian Deadlift", 3, 8, 10, 150), item("Leg Press", 3, 10, 12, 120), item("Seated Leg Curl", 3, 10, 12, 90), item("Standing Calf Raise", 3, 10, 15, 60), item("Hanging Leg Raise", 3, 10, 15, 60)] },
      { name: "Rest", rest: true, exercises: [] }
    ]
  },
  {
    id: "full-body",
    name: "Full body",
    blurb: "Workout A, Rest, Workout B, Rest",
    days: [
      { name: "Full Body A", exercises: [item("Back Squat", 3, 5, 8, 180), item("Bench Press", 3, 5, 8, 180), item("Barbell Row", 3, 6, 10, 150), item("Dumbbell Lateral Raise", 2, 12, 15, 60), item("Dumbbell Curl", 2, 10, 12, 60)] },
      { name: "Rest", rest: true, exercises: [] },
      { name: "Full Body B", exercises: [item("Deadlift", 3, 3, 5, 180), item("Overhead Press", 3, 5, 8, 150), item("Pull-Up", 3, 6, 10, 150), item("Bulgarian Split Squat", 2, 8, 12, 90), item("Rope Pushdown", 2, 10, 15, 60)] },
      { name: "Rest", rest: true, exercises: [] }
    ]
  }
];
