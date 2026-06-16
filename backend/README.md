# New Age Learning — backend

The server side that turns the admin console and public site from clickable demos into a real, data-backed platform.

## What's here

| File | What it is |
|---|---|
| `schema.sql` | Complete PostgreSQL database — every table, relationship, enum and seed data |
| `api-reference.md` | Every endpoint, mapped to the admin buttons and public actions |
| `server.js` | Runnable Express reference server implementing those endpoints |
| `package.json` | Dependencies |
| `.env.example` | Configuration template |

## Run it locally

```bash
# 1. create the database
createdb newagelearning
psql -d newagelearning -f schema.sql

# 2. install and configure
npm install
cp .env.example .env        # set DATABASE_URL and JWT_SECRET

# 3. start
npm start                   # API on http://localhost:4000
```

## How the pieces connect

The web and mobile front-ends call this API. The same API serves both the **public site** (read-only, signed-in personalisation) and the **admin console** (full control). Two rules are enforced in code, not just convention:

1. **The public/admin field split.** `GET /api/content` never selects `author`, `access_level` or `price` — those columns exist and are editable in the admin, but they cannot leak to the live site. This is how "admin-only for now" is guaranteed.
2. **Approval gating.** Anything an educator submits, or any blog awaiting review, stays out of public responses until an admin approves it and its status becomes `live` / `published`.

## What still needs wiring for production

This is a faithful skeleton, but a few integrations are stubbed with clear `TODO`s:

- **File storage** — `multer` currently buffers uploads in memory; point it at S3 or GCS so PDFs, audio and video persist, then save the returned URL.
- **Payments** — order creation is gated behind `PAID_ENABLED`. When you turn paid content on, plug Razorpay (and PayPal for the diaspora) into `/api/orders` and add the webhook.
- **Campaign delivery** — `/api/admin/campaigns` records the campaign; connect a push/email worker (e.g. FCM + an email service) to actually send.
- **Data warehouse** — `user_events` captures everything locally; in production also stream these rows to BigQuery or Snowflake for heavier segmentation.
- **Hardening** — add rate limiting, refresh tokens, input validation middleware, and HTTPS at the proxy.

## Suggested deployment shape

- API: a Node host (Render, Railway, AWS ECS, or a VPS) behind HTTPS.
- Database: managed PostgreSQL (RDS, Supabase, Neon).
- Media: S3/GCS + CloudFront/Cloud CDN for fast delivery across India and the diaspora.
- Web front-end: the static site (and later a Next.js app for SEO) on the same domain, calling this API.
