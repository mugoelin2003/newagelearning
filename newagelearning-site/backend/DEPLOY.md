# Deploying New Age Learning to Netlify

Your site is three layers. Netlify is ideal for the first, a partial fit for the second, and not meant for the third — so here's how each one lands.

| Layer | What it is | Where it goes |
|---|---|---|
| Front end | The 5 HTML files + `api.js` | **Netlify** (where newagelearning.in already lives) |
| Backend API | Express (`server.js`) + PostgreSQL | Netlify Functions **or** a separate host (Render/Railway) + a managed Postgres |
| Media | PDF / audio / video files | Object storage (S3, Cloudinary, etc.) — not Netlify |

You can ship Phase 1 today and add the rest when ready.

---

## Phase 1 — Update the live site now (front end only)

The front ends default to mock mode, so they work as a polished, clickable site with no backend. This gets the new newagelearning.in live immediately.

1. **Gather the files** into one folder:
   ```
   index.html        (homepage)
   learner.html
   educator.html
   institution.html
   admin.html
   api.js
   netlify.toml
   ```

2. **Deploy to your existing Netlify site** — two options:
   - *Quickest:* Netlify dashboard → your site → **Deploys** → drag the folder onto the upload area. Done in seconds, domain unchanged.
   - *Best for ongoing updates:* push the folder to a GitHub repo and connect it under **Site configuration → Build & deploy → Continuous deployment**. After that, every `git push` redeploys automatically.

3. Your domain (newagelearning.in) and HTTPS stay exactly as they are — you're just replacing the site's contents. The pretty-URL rules in `netlify.toml` give you `/learner`, `/educator`, etc.

> **Protect the admin.** `admin.html` is a control panel. Don't leave it at a guessable public path in production — put it behind login + an admin role check (Phase 3), or move it to a separate, access-controlled subdomain like `admin.newagelearning.in`.

---

## Phase 2 — Stand up the database and API

### 2a. Database (do this first)
Create a managed PostgreSQL — **Neon** is a good fit because its connection pooling is built for serverless; Supabase or AWS RDS work too.
- Create the database, then run our schema once:
  ```bash
  psql "<your DATABASE_URL>" -f schema.sql
  ```
- Keep the connection string handy — you'll set it as `DATABASE_URL`.

### 2b. The API — pick one path

**Option A — Netlify Functions (one domain, serverless).**
Wrap the Express app as a function:
- `npm install serverless-http`
- Make `server.js` exportable — change the bottom from a bare `app.listen(...)` to:
  ```js
  if (require.main === module) {
    app.listen(process.env.PORT || 4000);
  }
  module.exports = app;
  ```
- Add `netlify/functions/api.js`:
  ```js
  const serverless = require('serverless-http');
  const app = require('../../server');
  exports.handler = serverless(app);
  ```
- The `netlify.toml` already proxies `/api/*` to this function.
- In Netlify → **Site configuration → Environment variables**, add `DATABASE_URL`, `JWT_SECRET`, and `PAID_ENABLED=false`.
- Use a **pooled** Postgres connection string (Neon gives you one) — serverless functions cold-start often and can exhaust direct connections otherwise.
- Trade-offs: simplest setup, no second host, no CORS. But the 60-second limit and cold starts make it best for standard CRUD, not long jobs or WebSockets.

**Option B — Separate backend host (a real, always-on server).**
- Push the `backend` folder to GitHub, create a **Render** (or Railway/Fly) Web Service from it, start command `npm start`.
- Set the same env vars there; you'll get a URL like `https://nal-api.onrender.com`.
- Enable CORS for your site — in `server.js`, `app.use(cors({ origin: 'https://newagelearning.in' }))`.
- Trade-offs: a persistent server (no cold starts, supports background work and real-time later), at the cost of running a second service.

For your scale and roadmap, Option B is the more future-proof choice; Option A is fine to start and keeps everything in one place.

---

## Phase 3 — Flip the front ends to live data

Once the API is reachable, switch the client out of mock mode:

- For files using `api.js`: `NAL.config({ base: '<API URL>', mock: false })`.
- In `learner.html` (which has the API layer inlined): set `USE_MOCK = false` and `API_BASE = '<API URL>'`.

The `<API URL>` is:
- `/api` (relative) if you chose **Option A** — same domain, no CORS.
- `https://nal-api.onrender.com` if you chose **Option B**.

After login, capture the returned JWT and call `NAL.setToken(token)` so authenticated calls work.

---

## Phase 4 — Media and payments (when ready)

- **Media uploads** (PDF/audio/video) need object storage. Point the upload `TODO`s in `server.js` at S3 or Cloudinary, serve via their CDN. Netlify is not for storing large media.
- **Payments** stay dormant behind `PAID_ENABLED=false` until you switch paid content on, then wire Razorpay (and PayPal for the diaspora).

---

## Recommended first move

Do **Phase 1 today** — it puts the new, modern newagelearning.in live with everything clickable, at zero backend cost. Then take Phase 2 → 3 when you're ready to make the data real. Nothing about Phase 1 has to be redone later; flipping to live data is a config change, not a rebuild.
