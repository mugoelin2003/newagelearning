# New Age Learning — deploy package

Everything needed to put the new newagelearning.in live on Netlify.

```
public/                 ← the site Netlify serves (this is the whole front end)
  index.html            ← public homepage (sharing + contact us built in)
  learner.html          ← learner portal (sharing + TV mode)
  educator.html         ← educator studio
  institution.html      ← institution console
  admin.html            ← central admin console  (protect this — see below)
  api.js                ← front-end API client (used when you go live with data)
netlify.toml            ← Netlify config (publish dir, pretty URLs, API proxy)
package.json            ← deps for the serverless API function
netlify/functions/api.js← wraps the backend as a Netlify Function (Option A)
backend/                ← the API + database (server.js, schema.sql, guides)
```

---

## Go live in 3 steps (front end — do this now)

The front ends run in **mock mode** by default, so the site is fully usable the moment it's deployed — no backend required yet.

**1. Get the files onto your existing Netlify site.** Two ways:

- *Drag & drop (fastest):* Netlify dashboard → your newagelearning.in site → **Deploys** → drag the **`public`** folder onto the upload box. Live in seconds; domain unchanged.
- *Git (best for ongoing updates):* push this whole folder to a GitHub repo, then in Netlify → **Site configuration → Build & deploy → Continuous deployment**, link the repo. Set **Publish directory = `public`**. Every `git push` redeploys.

**2. Check it.** Visit newagelearning.in — you'll get the new homepage. `/learner`, `/educator`, `/institution`, `/admin` all resolve (pretty URLs come from `netlify.toml`).

**3. Lock down the admin.** `admin.html` is a control panel. Don't leave it open at `/admin` in production — gate it behind login + an admin role once the backend is live, or move it to a password-protected/separate subdomain. Netlify's password protection (Site configuration → Access control) is a quick interim guard.

That's the whole front-end launch. Nothing here has to be redone when you add real data later.

---

## Make the data real (backend — when ready)

Full detail is in **`backend/DEPLOY.md`**. In short:

1. **Database:** create a managed PostgreSQL (Neon is serverless-friendly) and run `psql "<DATABASE_URL>" -f backend/schema.sql`.
2. **API — pick one:**
   - *Option A (stay on Netlify):* run `npm install` at the repo root, set `DATABASE_URL`, `JWT_SECRET`, `PAID_ENABLED=false` in Netlify → Environment variables, and push. `netlify/functions/api.js` + the `/api/*` redirect are already wired.
   - *Option B (separate host):* deploy the `backend/` folder to Render/Railway, set the same env vars, and use that URL as the API base.
3. **Flip the front ends to live data:** set `NAL.config({ base: '<api-url>', mock: false })` (or in `learner.html`, `USE_MOCK = false`). For Option A the base is just `/api`.

---

## What's included and working

- **Sharing** — WhatsApp + X/Facebook/Telegram/LinkedIn + copy link (native share sheet on phones), on content cards and inside the learner reader, plus a site share link.
- **Contact us** — validated form (message required; mobile **or** email required, both format-checked), enforced again in the API and the database.
- **TV mode** — a 10-foot layout in the learner portal with remote/arrow-key navigation, the groundwork for packaging a smart-TV app (Tizen / webOS / Android TV) later.
- **All five surfaces** — public site, learner, educator, institution, admin — on one shared, consistent design system.
- **Backend** — schema, REST API, reference server, and the API client, all documented in `backend/`.
