// Builds the web app for the iOS shell and copies it into ios/ with
// `cap sync`. The app calls the Lift API at LIFT_API_URL (default: the
// production site). Then open ios/App in Xcode on a Mac to run or archive.
// Run with: npm run build:ios
import { spawnSync } from "node:child_process";

const api = (process.env.LIFT_API_URL || "https://lift.zachhersick.com").replace(/\/$/, "");
const run = (command) => {
  const result = spawnSync(command, { stdio: "inherit", shell: true, env: { ...process.env, VITE_API_URL: api } });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

console.log(`Building the iOS app against ${api}`);
run("npx vite build");
run("npx cap sync ios");
