// The built-in exercise library and starter splits. Built-ins live in code,
// not in the database; only exercises you create (or edit) are stored.

export const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves", "core", "full body"];
export const EQUIPMENT = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "smith", "kettlebell", "band", "other"];

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
  ["Barbell Row", "back", "barbell"],
  ["Pendlay Row", "back", "barbell"],
  ["T-Bar Row", "back", "barbell"],
  ["Rack Pull", "back", "barbell"],
  ["Pull-Up", "back", "bodyweight"],
  ["Chin-Up", "back", "bodyweight"],
  ["Assisted Pull-Up", "back", "machine"],
  ["Lat Pulldown", "back", "cable"],
  ["Close-Grip Lat Pulldown", "back", "cable"],
  ["Single-Arm Lat Pulldown", "back", "cable"],
  ["Seated Cable Row", "back", "cable"],
  ["Straight-Arm Pulldown", "back", "cable"],
  ["One-Arm Dumbbell Row", "back", "dumbbell"],
  ["Chest-Supported Dumbbell Row", "back", "dumbbell"],
  ["Chest-Supported Machine Row", "back", "machine"],
  ["Machine Lat Pullover", "back", "machine"],
  ["Back Extension", "back", "bodyweight"],
  ["Barbell Shrug", "back", "barbell"],
  ["Dumbbell Shrug", "back", "dumbbell"],
  // shoulders
  ["Overhead Press", "shoulders", "barbell"],
  ["Seated Dumbbell Shoulder Press", "shoulders", "dumbbell"],
  ["Arnold Press", "shoulders", "dumbbell"],
  ["Machine Shoulder Press", "shoulders", "machine"],
  ["Dumbbell Lateral Raise", "shoulders", "dumbbell"],
  ["Cable Lateral Raise", "shoulders", "cable"],
  ["Machine Lateral Raise", "shoulders", "machine"],
  ["Dumbbell Front Raise", "shoulders", "dumbbell"],
  ["Rear Delt Dumbbell Fly", "shoulders", "dumbbell"],
  ["Reverse Pec Deck", "shoulders", "machine"],
  ["Face Pull", "shoulders", "cable"],
  ["Upright Row", "shoulders", "barbell"],
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
  ["Hip Abduction", "glutes", "machine"],
  ["Hip Adduction", "glutes", "machine"],
  // calves
  ["Standing Calf Raise", "calves", "machine"],
  ["Seated Calf Raise", "calves", "machine"],
  ["Leg Press Calf Raise", "calves", "machine"],
  // core
  ["Plank", "core", "bodyweight"],
  ["Hanging Leg Raise", "core", "bodyweight"],
  ["Cable Crunch", "core", "cable"],
  ["Ab Wheel Rollout", "core", "other"],
  ["Machine Crunch", "core", "machine"],
  ["Decline Sit-Up", "core", "bodyweight"],
  ["Russian Twist", "core", "bodyweight"],
  // full body
  ["Power Clean", "full body", "barbell"],
  ["Kettlebell Swing", "full body", "kettlebell"],
  ["Farmer's Carry", "full body", "dumbbell"]
];

export const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const BUILT_IN = LIST.map(([name, muscle, equipment]) => ({ id: `b_${slug(name)}`, kind: "exercise", name, muscle, equipment, builtIn: true }));

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
