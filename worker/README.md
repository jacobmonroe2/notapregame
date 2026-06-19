# Guest-list Worker — setup

This Cloudflare Worker receives sign-up submissions and serves them to the
admin page (`/admin`) behind a passcode.

- `POST /` — store a submission into the **active event batch** (the form calls this)
- `GET /list` — all submissions (admin)
- `GET /batches` — event batches + which is active (admin)
- `POST /batch` — start / switch the active event batch (admin)
- `POST /delete` / `POST /clear` — remove one submission, or a whole batch (admin)

**Updating later:** paste the newest `worker.js` and **Deploy** — your KV binding
and `ADMIN_KEY` are unaffected.

The admin page is already pointed at `https://pregame-signup.jacob-bee.workers.dev/list`,
so if you deploy this to the **same** Worker name, nothing else needs changing.

## One-time setup (Cloudflare dashboard, ~5 min)

1. **KV store** — Workers & Pages → **KV** → **Create a namespace** → name it
   `pregame-submissions`.
2. **Open the Worker** — Workers & Pages → **pregame-signup** → **Edit code**.
3. **Paste** the contents of [`worker.js`](worker.js) (replace what's there) → **Deploy**.
4. **Bind the KV store** — the Worker → **Settings → Variables and Secrets** →
   **KV Namespace Bindings** → **Add** → Variable name **`SUBMISSIONS`** →
   select `pregame-submissions` → **Save**.
5. **Set the passcode** — same **Settings → Variables and Secrets** → **Add variable** →
   name **`ADMIN_KEY`**, value = a passcode you choose → tick **Encrypt** → **Save**.
6. *(optional)* Add a plain variable **`ALLOW_ORIGIN`** = `https://notapregame.com`.
7. **Deploy** again so the bindings take effect.

That's it. Go to **notapregame.com/admin**, enter the `ADMIN_KEY` passcode, and
your submissions appear. Export to CSV from there.

## Keeping your Google Sheet
This version stores submissions in **Cloudflare KV** (which powers the admin page
and CSV export). If your current Worker also writes to a **Google Sheet** and you
want to keep that, **don't replace it** — send me the current Worker code and I'll
merge the `/list` + KV parts into it so you get both. (To grab it: Workers & Pages →
pregame-signup → Edit code → select all → copy.)


## Email confirmations (optional)

Send each guest a confirmation email when they submit. Uses [Resend](https://resend.com)
(free tier; ~10 min). The Worker sends nothing until `RESEND_API_KEY` is set, so
submissions keep working before you set this up.

1. Sign up at **resend.com** → **API Keys** → create one → copy it.
2. **Verify your domain** (Domains → Add `notapregame.com`) and add the DNS records
   it shows you, wherever `notapregame.com` DNS is managed. (To just test first, you
   can send from `onboarding@resend.dev` to your *own* email without verifying.)
3. In the Worker → **Settings → Variables and Secrets**, add:
   - `RESEND_API_KEY` — your Resend key (tick **Encrypt**)
   - `EMAIL_FROM` — e.g. `The Pregame <invite@notapregame.com>` (must be on the verified domain)
4. **Deploy.** New submissions now get a branded confirmation email.
