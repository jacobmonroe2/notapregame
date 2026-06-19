/**
 * The Pregame — guest-list Worker (Cloudflare)
 *
 *   POST  /            Store a submission (public). Tagged with the active batch.
 *   GET   /list        [admin] All submissions, each with _key + batch. ?batch= to filter.
 *   GET   /batches     [admin] { active, batches: [{ name, count }] }
 *   POST  /batch       [admin] { name }  — set the active batch (new submissions go here).
 *   POST  /delete      [admin] { key }   — delete one submission.
 *   POST  /clear       [admin] { batch } — delete every submission in a batch.
 *   OPTIONS *          CORS preflight.
 *
 * Bindings/secrets (see worker/README.md):
 *   - KV namespace binding:  SUBMISSIONS
 *   - Encrypted secret:      ADMIN_KEY     (the /admin passcode)
 *   - Plain var (optional):  ALLOW_ORIGIN  (comma-separated; defaults below)
 */

const ALLOWED_ORIGINS = ["https://notapregame.com", "https://www.notapregame.com"];
const ACTIVE_KEY = "__active__";       // KV key holding the current batch name
const DEFAULT_BATCH = "Unsorted";

function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
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

function authed(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return Boolean(env.ADMIN_KEY) && token === env.ADMIN_KEY;
}

async function allRecords(env) {
  const listed = await env.SUBMISSIONS.list();
  const out = [];
  for (const k of listed.keys) {
    if (k.name.startsWith("__")) continue; // skip config keys
    const v = await env.SUBMISSIONS.get(k.name);
    if (!v) continue;
    let rec;
    try { rec = JSON.parse(v); } catch { continue; }
    rec._key = k.name;
    if (!rec.batch) rec.batch = DEFAULT_BATCH;
    out.push(rec);
  }
  out.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request, env);

    if (request.method === "OPTIONS") return new Response(null, { headers });

    // ---- public: store a submission into the active batch ----
    if (request.method === "POST" && url.pathname === "/") {
      let data;
      try { data = await request.json(); } catch { return json({ error: "invalid JSON" }, 400, headers); }
      const active = (await env.SUBMISSIONS.get(ACTIVE_KEY)) || DEFAULT_BATCH;
      const record = { ...data, batch: active, submittedAt: new Date().toISOString() };
      const key = record.submittedAt + "-" + crypto.randomUUID();
      await env.SUBMISSIONS.put(key, JSON.stringify(record));
      return json({ ok: true }, 200, headers);
    }

    // ---- everything below requires the admin passcode ----
    const adminPaths = ["/list", "/batches", "/batch", "/delete", "/clear"];
    if (adminPaths.includes(url.pathname)) {
      if (!authed(request, env)) return new Response("Unauthorized", { status: 401, headers });
    }

    if (url.pathname === "/list" && request.method === "GET") {
      let recs = await allRecords(env);
      const batch = url.searchParams.get("batch");
      if (batch) recs = recs.filter((r) => r.batch === batch);
      return json(recs, 200, headers);
    }

    if (url.pathname === "/batches" && request.method === "GET") {
      const recs = await allRecords(env);
      const counts = {};
      for (const r of recs) counts[r.batch] = (counts[r.batch] || 0) + 1;
      const active = (await env.SUBMISSIONS.get(ACTIVE_KEY)) || DEFAULT_BATCH;
      if (!(active in counts)) counts[active] = 0; // show the active batch even if empty
      const batches = Object.keys(counts).map((name) => ({ name, count: counts[name] }));
      return json({ active, batches }, 200, headers);
    }

    if (url.pathname === "/batch" && request.method === "POST") {
      let body; try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400, headers); }
      const name = ((body && body.name) || "").trim();
      if (!name) return json({ error: "name required" }, 400, headers);
      await env.SUBMISSIONS.put(ACTIVE_KEY, name);
      return json({ ok: true, active: name }, 200, headers);
    }

    if (url.pathname === "/delete" && request.method === "POST") {
      let body; try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400, headers); }
      const key = body && body.key;
      if (!key || String(key).startsWith("__")) return json({ error: "bad key" }, 400, headers);
      await env.SUBMISSIONS.delete(key);
      return json({ ok: true }, 200, headers);
    }

    if (url.pathname === "/clear" && request.method === "POST") {
      let body; try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400, headers); }
      const batch = body && body.batch;
      if (!batch) return json({ error: "batch required" }, 400, headers);
      const recs = await allRecords(env);
      let deleted = 0;
      for (const r of recs) {
        if (r.batch === batch) { await env.SUBMISSIONS.delete(r._key); deleted++; }
      }
      return json({ ok: true, deleted }, 200, headers);
    }

    return new Response("Not found", { status: 404, headers });
  },
};
