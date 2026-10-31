// Friends and profiles from the server (server/social.js). These need the
// network: each call returns the reply or throws with a message to show.
export async function social(path, body) {
  let response;
  try {
    response = await fetch(path, body ? { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new Error("You're offline. Friends load when you're back online.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "That didn't work. Try again.");
  return data;
}
