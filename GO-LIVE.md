# Go live: connect Netlify (front end) + Render (backend) + Postgres

You've deployed both halves. They aren't talking yet because (1) the database isn't created/loaded, (2) no admin user exists, and (3) the front end wasn't pointing at the backend. This runbook fixes all three, in order. Do them top to bottom.

---

## Step 1 — Create the database on Render and load the schema

1. Render Dashboard → **New +** → **PostgreSQL**. Give it a name, pick the **same region** as your web service, create it. (Free tier allows one Postgres.)
2. Open the database → **Info** page. Copy two things:
   - **Internal Database URL** — used by your backend (same region = faster, no SSL needed).
   - **External Database URL** — used by you to load the schema from your computer.
3. Load the schema. On your computer (with `psql` installed), run:
   ```bash
   psql "<EXTERNAL DATABASE URL>" -f backend/schema.sql
   psql "<EXTERNAL DATABASE URL>" -f backend/sample-data.sql   # optional: sample content
   ```
   No `psql`? Use a free GUI like TablePlus or pgAdmin, connect with the External URL, and run the contents of `schema.sql` (then `sample-data.sql`).

---

## Step 2 — Configure the backend web service on Render

1. Open your Render **web service** → **Settings**:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
2. **Environment → Add environment variables:**
   - `DATABASE_URL` = the **Internal Database URL** from Step 1
   - `JWT_SECRET` = any long random string
   - `BOOTSTRAP_SECRET` = a temporary secret you'll use once in Step 3
   - `PAID_ENABLED` = `false`
3. **Save** → Render redeploys. Watch the logs for "New Age Learning API on :PORT" with no errors.
4. **Verify it's alive:** open `https://YOUR-RENDER-SERVICE.onrender.com/api/health` in a browser.
   - You should see `{"ok":true,"db":"connected"}`.
   - If `db:"error"`, your `DATABASE_URL` is wrong — recheck Step 1.
   - (Free Render services sleep when idle; the first request may take ~30–60s to wake.)

---

## Step 3 — Create your admin account (one time)

With the backend healthy, create the first admin. Replace the values and run:

```bash
curl -X POST https://YOUR-RENDER-SERVICE.onrender.com/api/bootstrap-admin \
  -H "Content-Type: application/json" \
  -d '{"secret":"<your BOOTSTRAP_SECRET>","name":"Admin","mobile":"98xxxxxxxx","password":"<a strong password>"}'
```

You should get `{"ok":true,...}`. Then **delete the `BOOTSTRAP_SECRET` env var** on Render so the route can't be used again. (No curl? Use Postman, or any "send a POST request" tool, with the same JSON body.)

---

## Step 4 — Connect the Netlify front end to the backend

This makes the site call `/api/...` on its own domain, and Netlify quietly forwards that to Render — so there's **no CORS to configure**.

1. Open `public/_redirects` and replace `YOUR-RENDER-SERVICE.onrender.com` with your real Render host.
2. Redeploy the front end: drag the **`public`** folder onto Netlify → **Deploys**. (Or `git push` if you connected the repo.)
3. **Verify the wiring:** open `https://newagelearning.in/api/health` — you should see the same `{"ok":true}` as in Step 2. If yes, the front end and backend are now connected.

The `_redirects` file also restores your pretty URLs (`/learner`, `/admin`, etc.), which fixes broken links if a plain drag-drop dropped them before.

---

## Step 5 — See it working

- **Admin:** go to `https://newagelearning.in/admin`. You'll now get a **login screen** (the admin is protected). Sign in with the admin mobile + password from Step 3.
- **Learner:** `https://newagelearning.in/learner` loads its library from the database. If you ran `sample-data.sql`, you'll see those three titles — real data from Postgres. (If it says "showing offline data," the proxy URL in `_redirects` is wrong — recheck Step 4.)

---

## Important to know

- **The front ends were demos.** Only the learner library and the admin login are wired to the backend so far. The other admin actions (adding content, approvals, etc.) and the educator/institution portals still use on-screen sample data until each is connected to its API endpoint. The endpoints already exist (`api-reference.md`) and the client (`api.js`) already has the methods — it's wiring work, which can be done screen by screen.
- **Admin protection:** the login gate requires a backend admin account. For an extra layer, you can also enable Netlify's site password (Site configuration → Access control), or later move the admin to a separate subdomain.
- **Cold starts:** on Render's free tier the API sleeps when idle; the first request after a pause is slow. A paid instance removes this.

---

## Quick troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/api/health` on Render fails | DB not connected | Recheck `DATABASE_URL` (use the Internal URL) |
| `/api/health` on your domain 404s | proxy not set | Fix the host in `public/_redirects`, redeploy |
| Admin login "cannot reach server" | proxy or backend down | Confirm Step 4 health check passes |
| Admin login "not an admin" | logged in as non-admin | Use the account from Step 3 |
| Learner shows "offline data" | proxy URL wrong | Fix `public/_redirects` |
| First call very slow | Render free tier sleeping | Wait ~60s, or upgrade the instance |
