// Friends and profiles. A friendship starts as a request one person sends and
// becomes real when the other accepts. Friends never read each other's
// records: they get the summary profileSummary computes here on the server,
// minus whatever its owner chose not to share (settings.share).
import { profileSummary, shareFilter } from "../src/lib/model.js";
import { loadTrainingData } from "./coach.js";

export const displayName = (user, email) => user?.name || email.split("@")[0];

// Accepted friends, requests waiting on you and requests you sent, leaving
// out anyone who can no longer sign in.
export async function friendsOf(store, email, account) {
  const out = { friends: [], incoming: [], outgoing: [] };
  for (const row of await store.listFriendships(email)) {
    const other = row.a === email ? row.b : row.a;
    const user = await account(other);
    if (!user) continue;
    const person = { email: other, name: displayName(user, other), since: row.createdAt };
    if (row.status === "accepted") out.friends.push(person);
    else (row.requestedBy === email ? out.outgoing : out.incoming).push(person);
  }
  for (const list of Object.values(out)) list.sort((x, y) => x.name.localeCompare(y.name));
  return out;
}

// What a friend sees of this account.
export async function summaryFor(store, email, { now = Date.now() } = {}) {
  const data = await loadTrainingData(store.forOwner(email));
  return shareFilter(profileSummary({ ...data, now }), data.settings.share || {});
}
