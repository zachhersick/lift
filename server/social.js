// Friends and profiles. People find each other by username; emails never
// reach a friend. A friendship (keyed by the two emails) starts as a request
// one person sends and becomes real when the other accepts. Friends never
// read each other's records: they get the summary profileSummary computes
// here on the server, minus whatever its owner chose not to share
// (settings.share).
import { leaderboard, profileSummary, shareFilter } from "../src/lib/model.js";
import { loadTrainingData } from "./coach.js";

export const displayName = (user) => user?.name || (user?.username ? `@${user.username}` : "Lift member");

// Accepted friends, requests waiting on you and requests you sent, leaving
// out anyone who can no longer sign in. Each entry keeps the email for the
// server's own use; `publicPeople` drops it before anything is sent.
export async function friendships(store, email, account) {
  const out = { friends: [], incoming: [], outgoing: [] };
  for (const row of await store.listFriendships(email)) {
    const other = row.a === email ? row.b : row.a;
    const user = await account(other);
    if (!user) continue;
    const person = { email: other, username: user.username || null, name: displayName(user), vip: user.vip, since: row.createdAt };
    if (row.status === "accepted") out.friends.push(person);
    else (row.requestedBy === email ? out.outgoing : out.incoming).push(person);
  }
  for (const list of Object.values(out)) list.sort((x, y) => x.name.localeCompare(y.name));
  return out;
}

export const publicPeople = (lists) => Object.fromEntries(Object.entries(lists).map(([key, list]) => [key, list.map(({ email, vip, ...person }) => person)]));

// What a friend sees of this account.
export async function summaryFor(store, email, { vip = false, now = Date.now() } = {}) {
  const data = await loadTrainingData(store.forOwner(email));
  return shareFilter(profileSummary({ ...data, vip, now }), data.settings.share || {});
}

// You and your friends this week, and on one lift, in your unit.
export async function leaderboardFor(store, user, account, key) {
  const { friends } = await friendships(store, user.email, account);
  const people = [{ email: user.email, username: user.username || null, name: displayName(user), vip: user.vip, me: true }, ...friends];
  const withSummaries = await Promise.all(people.map(async (person) => ({ ...person, summary: await summaryFor(store, person.email, { vip: person.vip }) })));
  return leaderboard(withSummaries, key, withSummaries[0].summary.unit);
}
