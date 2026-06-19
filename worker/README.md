# Guest-list Worker — setup

This Cloudflare Worker receives sign-up submissions and serves them to the
admin page (`/admin`) behind a passcode.

- `POST /` — store a submission (the site's form calls this)
- `GET /list` — return all submissions as JSON (only with the right passcode)

The admin page is already pointed at `https://pregame-signup.jacobmilesmonroe.workers.dev/list`,
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
