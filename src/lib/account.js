// Which account's data this device shows. Each account keeps its own
// IndexedDB, so people sharing a phone never see each other's workouts.
// The original "lift" database belongs to the first account that signs in
// here (it holds what was logged before accounts, or before signing in);
// later accounts get "lift:<email>", and signed out uses a guest database.
const KEY = "lift-accounts";

function read() {
  try {
    const state = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { active: typeof state.active === "string" ? state.active : "", dbs: state.dbs && typeof state.dbs === "object" ? state.dbs : {} };
  } catch {
    return { active: "", dbs: {} };
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export function databaseName(state = read()) {
  if (state.active && state.dbs[state.active]) return state.dbs[state.active];
  return Object.values(state.dbs).includes("lift") ? "lift:guest" : "lift";
}

// Makes `email` (or "" when signed out) the account this device shows.
// Returns true when that's a different database, so the app must reload.
export function switchAccount(email) {
  const state = read();
  const before = databaseName(state);
  if (email && !state.dbs[email]) state.dbs[email] = Object.values(state.dbs).includes("lift") ? `lift:${email}` : "lift";
  state.active = email;
  write(state);
  return databaseName(state) !== before;
}
