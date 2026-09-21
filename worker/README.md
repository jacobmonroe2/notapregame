# Guest-list Worker — setup

This Cloudflare Worker receives sign-up submissions and serves them to the
admin page (`/admin`) behind a passcode.

- `POST /` — store a submission into the **active event batch** (the form calls this)
- `GET /list` — all submissions (admin)
- `GET /batches` — event batches + which is active (admin)
- `POST /batch` — start / switch the active event batch (admin)
- `POST /add` — add a guest by hand from the admin page, for people who never
  signed up themselves (admin; sends no sign-up emails)
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


## Invite flyers

The "Send invite" compose on `/admin` has an **Add flyer image** button. The image
is downscaled in the browser (max 1000px wide), uploaded to the Worker
(`POST /flyer`, stored in the same `SUBMISSIONS` KV namespace under `__flyer__*`
keys), and embedded at the top of the invite email via its public
`GET /flyer/<id>` URL. No extra setup — it uses the existing KV binding and
Resend config. To update, paste the newest `worker.js` and **Deploy**.

## Text blasts via Twilio (optional)

The admin page's **Send text** button texts selected guests through Twilio.
Only guests who ticked SMS consent *and* have a phone number are included;
`{first}` in the message becomes their first name. The Worker sends nothing
until all three variables are set.

1. In [Twilio Console](https://console.twilio.com): copy the **Account SID**
   and **Auth Token** from the dashboard.
2. Get a sending number — for US guests use a **toll-free number** and submit
   its (free) verification, or register **A2P 10DLC** for a local number.
   Unverified numbers get carrier-filtered.
3. In the Worker → **Settings → Variables and Secrets**, add:
   - `TWILIO_ACCOUNT_SID` — starts with `AC…`
   - `TWILIO_AUTH_TOKEN` — tick **Encrypt**
   - `TWILIO_FROM` — your Twilio number in +1XXXXXXXXXX format
4. **Deploy.** Trial accounts can only text numbers you've verified in Twilio;
   upgrade to text real guests. Consider a usage alert in Twilio
   (Monitor → Usage triggers) as a spending guardrail.

## Mailchimp sync (optional)

Every sign-up (and every guest added by hand from /admin) is also added as a
contact in a Mailchimp audience, tagged with their event batch and tier — so
you can send newsletters/campaigns from Mailchimp against an always-current
list. Invite and confirmation emails still go through Resend. The Worker
does nothing until both variables are set.

1. In Mailchimp: profile icon → **Account & billing** → **Extras → API keys** →
   create a key (it ends in a datacenter code like `-us21`).
2. Find your **Audience ID**: **Audience → Settings → Audience name and defaults**.
3. In the Worker → **Settings → Variables and Secrets**, add:
   - `MAILCHIMP_API_KEY` — the API key (tick **Encrypt**)
   - `MAILCHIMP_AUDIENCE_ID` — the audience ID (plain **Text** is fine)
4. **Deploy.** New guests appear in Mailchimp automatically. For guests who
   signed up *before* this was enabled, export the CSV from /admin and use
   Mailchimp's **Audience → Import contacts** once.

## Sign-up notifications (optional)

Get an email every time someone requests a spot (guest details + a link to /admin,
reply-to set to the guest). Uses the same Resend setup as confirmations.

1. In the Worker → **Settings → Variables and Secrets**, add a **Text** variable:
   - `NOTIFY_EMAIL` — where to send alerts, e.g. `invite@notapregame.com`
     (comma-separate for multiple: `invite@notapregame.com, che@notapregame.com`)
2. **Deploy.** Remove the variable to turn notifications off.
