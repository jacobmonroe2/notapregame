/**
 * The Pregame — guest-list Worker (Cloudflare)
 *
 *   POST  /        Store a guest-list submission (called by the site's sign-up form).
 *   GET   /list    Return all submissions as JSON for the admin page — requires the passcode.
 *   OPTIONS *      CORS preflight.
 *
 * Set these in the Cloudflare dashboard (see worker/README.md):
 *   - KV namespace binding:    SUBMISSIONS
 *   - Encrypted secret:        ADMIN_KEY      (the passcode the /admin page asks for)
 *   - Plain variable (opt.):   ALLOW_ORIGIN   (defaults to https://notapregame.com)
 */

// Origins allowed to call this Worker from the browser (the site uses www).
const ALLOWED_ORIGINS = [
  "https://notapregame.com",
  "https://www.notapregame.com",
];

function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
  // env.ALLOW_ORIGIN (comma-separated) overrides the list above if set
  const allowed = (env && env.ALLOW_ORIGIN)
    ? env.ALLOW_ORIGIN.split(",").map((s) => s.trim())
    : ALLOWED_ORIGINS;
  const allow = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request, env);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // ---- store a submission ----
    if (request.method === "POST") {
      let data;
      try {
        data = await request.json();
      } catch {
        return json({ error: "invalid JSON" }, 400, headers);
      }
      const record = { ...data, submittedAt: new Date().toISOString() };
      // key prefix is the timestamp so keys are roughly time-ordered
      const key = record.submittedAt + "-" + crypto.randomUUID();
      await env.SUBMISSIONS.put(key, JSON.stringify(record));
      return json({ ok: true }, 200, headers);
    }

    // ---- admin: list submissions ----
    if (url.pathname === "/list" && request.method === "GET") {
      const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!env.ADMIN_KEY || token !== env.ADMIN_KEY) {
        return new Response("Unauthorized", { status: 401, headers });
      }
      // NOTE: lists up to 1000 keys — plenty to start; paginate later if needed.
      const listed = await env.SUBMISSIONS.list();
      const rows = await Promise.all(
        listed.keys.map((k) =>
          env.SUBMISSIONS.get(k.name).then((v) => {
            try { return JSON.parse(v); } catch { return null; }
          })
        )
      );
      const submissions = rows
        .filter(Boolean)
        .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
      return json(submissions, 200, headers);
    }

    return new Response("Not found", { status: 404, headers });
  },
};
