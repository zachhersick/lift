// Request helpers shared by the API. Writes must be JSON, which a cross-site
// page can't send without a CORS preflight. Copied from Jarvis (server/http.js).

const BODY_LIMIT = 1_000_000;

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function readJsonBody(req, { limit = BODY_LIMIT } = {}) {
  const type = String(req.headers["content-type"] || "");
  if (!type.includes("application/json")) throw httpError(415, "Send JSON with content-type application/json.");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw httpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch {
    throw httpError(400, "Request body is not valid JSON.");
  }
}
