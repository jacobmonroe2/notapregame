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

// Send a confirmation email to the guest via Resend. No-op until RESEND_API_KEY
// is set, so submissions keep working before email is configured.
async function sendConfirmation(env, data) {
  if (!env.RESEND_API_KEY) return;
  const to = String((data && data["Email Address"]) || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return;
  const first = String((data && data["First Name"]) || "").trim();
  const hi = first ? "Hey " + first + "," : "Hey,";
  const from = env.EMAIL_FROM || "The Pregame <invite@notapregame.com>";
  const text = hi + "\n\nThanks for requesting a spot on The Pregame guest list. " +
    "The Pregame is invite-only — every request is reviewed before confirmation. " +
    "If you're in, we'll reach out with the details.\n\n— The Pregame\ninstagram.com/notapregame";
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#060606;font-family:Arial,Helvetica,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060606;padding:32px 16px;"><tr><td align="center">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#0e0e0e;border:1px solid rgba(240,236,227,0.12);"><tr><td style="padding:32px;">' +
    '<div style="height:3px;width:42px;background:#e8d84a;margin-bottom:24px;"></div>' +
    '<p style="font-size:16px;line-height:1.6;margin:0 0 16px;color:#f0ece3;">' + hi + '</p>' +
    '<p style="font-size:15px;line-height:1.7;margin:0 0 16px;color:rgba(240,236,227,0.78);">Thanks for requesting a spot on <strong style="color:#f0ece3;">The Pregame</strong> guest list.</p>' +
    '<p style="font-size:15px;line-height:1.7;margin:0 0 16px;color:rgba(240,236,227,0.78);">The Pregame is invite-only &mdash; every request is reviewed before confirmation. If you\'re in, we\'ll reach out with the details.</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr>' +
    '<td style="vertical-align:bottom;">' +
    '<p style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;margin:0;color:rgba(240,236,227,0.5);">&mdash; The Pregame</p>' +
    '<p style="margin:8px 0 0;"><a href="https://instagram.com/notapregame" style="color:#e8d84a;text-decoration:none;font-size:13px;">@notapregame</a></p>' +
    '</td>' +
    '<td align="right" style="vertical-align:bottom;width:88px;">' +
    '<img src="https://www.notapregame.com/logo.png" alt="The Pregame" width="76" style="display:block;width:76px;height:auto;">' +
    '</td>' +
    '</tr></table>' +
    '</td></tr></table></td></tr></table></body></html>';
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: "Your Pregame request — received", html, text }),
  });
}

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
  });
}

// Wrap body HTML in the branded email card (logo bottom-right).
function emailShell(bodyHtml) {
  return '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#060606;font-family:Arial,Helvetica,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060606;padding:32px 16px;"><tr><td align="center">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#0e0e0e;border:1px solid rgba(240,236,227,0.12);"><tr><td style="padding:32px;">' +
    '<div style="height:3px;width:42px;background:#e8d84a;margin-bottom:24px;"></div>' +
    bodyHtml +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr>' +
    '<td style="vertical-align:bottom;">' +
    '<p style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;margin:0;color:rgba(240,236,227,0.5);">&mdash; The Pregame</p>' +
    '<p style="margin:8px 0 0;"><a href="https://instagram.com/notapregame" style="color:#e8d84a;text-decoration:none;font-size:13px;">@notapregame</a></p>' +
    '</td>' +
    '<td align="right" style="vertical-align:bottom;width:88px;">' +
    '<img src="https://www.notapregame.com/logo.png" alt="The Pregame" width="76" style="display:block;width:76px;height:auto;">' +
    '</td>' +
    '</tr></table>' +
    '</td></tr></table></td></tr></table></body></html>';
}

function inviteHtml(first, message) {
  const hi = first ? "Hey " + escHtml(first) + "," : "Hey,";
  const paras = String(message || "").split(/\n\s*\n/).map(function (p) {
    return '<p style="font-size:15px;line-height:1.7;margin:0 0 16px;color:rgba(240,236,227,0.85);">' + escHtml(p).replace(/\n/g, "<br>") + "</p>";
  }).join("");
  return emailShell('<p style="font-size:16px;line-height:1.6;margin:0 0 16px;color:#f0ece3;">' + hi + "</p>" + paras);
}
function inviteText(first, message) {
  return (first ? "Hey " + first + ",\n\n" : "") + String(message || "") + "\n\n— The Pregame\ninstagram.com/notapregame";
}

// Send an invite to many guests via Resend's batch endpoint (<=100 per call).
async function sendInvites(env, recipients, subject, message) {
  if (!env.RESEND_API_KEY) throw new Error("email not configured");
  const from = env.EMAIL_FROM || "The Pregame <invite@notapregame.com>";
  const subj = (subject || "You're invited — The Pregame").trim();
  let sent = 0;
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100).map(function (r) {
      return { from, to: r.email, subject: subj, html: inviteHtml(r.first, message), text: inviteText(r.first, message) };
    });
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    if (res.ok) sent += chunk.length;
  }
  return sent;
}

export default {
  async fetch(request, env, ctx) {
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
      if (ctx && ctx.waitUntil) ctx.waitUntil(sendConfirmation(env, data).catch(() => {}));
      return json({ ok: true }, 200, headers);
    }

    // ---- everything below requires the admin passcode ----
    const adminPaths = ["/list", "/batches", "/batch", "/delete", "/clear", "/invite"];
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

    if (url.pathname === "/invite" && request.method === "POST") {
      let body; try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400, headers); }
      const recipients = (Array.isArray(body.recipients) ? body.recipients : [])
        .filter((r) => r && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(r.email || "")));
      if (!recipients.length) return json({ error: "no valid recipients" }, 400, headers);
      if (!env.RESEND_API_KEY) return json({ error: "email not configured" }, 400, headers);
      try {
        const sent = await sendInvites(env, recipients, body.subject, body.message);
        return json({ ok: true, sent, total: recipients.length }, 200, headers);
      } catch {
        return json({ error: "send failed" }, 500, headers);
      }
    }

    return new Response("Not found", { status: 404, headers });
  },
};
