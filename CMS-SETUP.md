# Editing the site content (no code)

The team can update the site's content through a web form — no code, no developer.
Everything editable lives in plain data files under [`content/`](content/), and the
site reads from them. A change you save commits to GitHub, and Vercel redeploys the
live site automatically (usually within a minute).

## What you can edit

| Where on the site | What | File it edits |
|---|---|---|
| Homepage | Upcoming event (city, date, venue) + on/off toggle | `content/home.json` |
| Homepage | City ticker (cities you operate in) | `content/home.json` |
| Homepage | "Coming Soon" teaser cities | `content/home.json` |
| Partners page | Current & past partner logos | `content/partners.json` |
| Archive page | Events — name, volume, date, blurb, thumbnail, photos | `content/archive.json` |

## One-time setup (≈ 5 minutes)

We use **[Pages CMS](https://pagescms.org)** — a free editing UI for sites kept on GitHub.

1. Go to **https://app.pagescms.org** and click **Sign in with GitHub**.
2. When prompted, **install the Pages CMS GitHub app** and give it access to the
   **`jacobmonroe2/notapregame`** repository only.
3. Open that repository inside Pages CMS. You'll see **Homepage**, **Partners**, and
   **Archive events** in the sidebar — these are defined by [`.pages.yml`](.pages.yml).

That's it. Anyone you want editing the site just repeats steps 1–2 (they need access to the repo).

## How to edit

- **Announce an event:** Homepage → *Upcoming event* → turn **Event is live?** on, fill in
  **City**, **Date**, and optional **Venue**, Save. The homepage flips from "The Next One Is
  Coming" to e.g. "New York — July 18". Turn it off after the event.
- **Add a Coming Soon city / change the ticker:** Homepage → edit the list fields, Save.
- **Add or swap a partner logo:** Partners → *Current* or *Past* → add an item, type the brand
  **name**, and optionally upload a **logo image**. No image? The brand name shows as styled text.
- **Add an archive event:** Archive events → add an event → fill in the fields and upload
  **photos** (aim for 8–12). Give each event a unique lowercase **ID** (e.g. `rooftop-june`).

Images you upload land in `/photos` (event galleries) or `/partners` (logos) automatically.

## How it works (for developers)

- Content is decoupled from markup: pages fetch `content/*.json` at load and render from it.
  Nothing is hardcoded in `home.html`, `partners.html`, or `archive.html`.
- `.pages.yml` defines the editing form (fields, media folders). Saving in Pages CMS commits
  the JSON change to `main` → Vercel deploys.
- If a JSON file ever fails to load, each page falls back to sensible static defaults baked into
  the markup (the homepage shows "The Next One Is Coming", etc.).

### Self-hosted alternative
Prefer the editing UI on your own domain instead of pagescms.org? The same `content/*.json`
files work with **[Decap CMS](https://decapcms.org)** or **[Sveltia CMS](https://github.com/sveltia/sveltia-cms)**
served from `/admin`. That route needs a GitHub OAuth app + a small auth handler (a Cloudflare
Worker works well, since one is already in use for the guest-list form). Ask the developer to set it up.
