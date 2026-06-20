# File storage setup (PDFs, audio, video, logos)

Until this is configured, uploads save a placeholder URL and files won't actually open. Once you set the env vars below, admin uploads stream the real bytes to object storage, and the learner reader plays them through `/api/content/:id/file/:kind` (which also enforces free-vs-paid access).

The backend speaks the S3 API, so any S3-compatible provider works. **Cloudflare R2 is the easiest and cheapest** (no egress fees — good for video), but AWS S3 works identically.

## Option A — Cloudflare R2 (recommended)

1. Cloudflare dashboard → **R2** → create a bucket, e.g. `newage-media`.
2. **R2 → Manage API Tokens → Create API Token** (Object Read & Write). Note the **Access Key ID**, **Secret Access Key**, and your **Account ID**.
3. (To serve files publicly/cheaply) enable a public domain on the bucket: **Settings → Public access → Connect a custom domain** (e.g. `cdn.newagelearning.in`), or use the r2.dev URL.
4. On Render → your web service → **Environment**, add:
   ```
   S3_BUCKET            = newage-media
   S3_ACCESS_KEY_ID     = <your R2 access key id>
   S3_SECRET_ACCESS_KEY = <your R2 secret>
   S3_ENDPOINT          = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   S3_REGION            = auto
   S3_PUBLIC_BASE       = https://cdn.newagelearning.in   (your public domain; omit to use signed URLs)
   ```

## Option B — AWS S3

1. Create a bucket (e.g. `newage-media`) in a region like `ap-south-1` (Mumbai).
2. Create an IAM user with programmatic access and `s3:PutObject` / `s3:GetObject` on that bucket. Note the keys.
3. On Render add:
   ```
   S3_BUCKET            = newage-media
   S3_ACCESS_KEY_ID     = <key>
   S3_SECRET_ACCESS_KEY = <secret>
   S3_REGION            = ap-south-1
   # leave S3_ENDPOINT unset for AWS
   # S3_PUBLIC_BASE: set to a CloudFront domain, or omit to use signed URLs
   ```

## Public vs signed

- **`S3_PUBLIC_BASE` set** → files are served from that URL directly (fast, cacheable). Use for a public/CDN bucket.
- **`S3_PUBLIC_BASE` omitted** → the API hands out short-lived (5-min) signed URLs on each open. Use this for private buckets / paid content.

Either way the front end always calls `/api/content/:id/file/:kind`, so you can switch later without touching the site.

## CORS (only if you stream cross-origin)

Because the site proxies `/api` same-origin and the API redirects to storage, you usually don't need bucket CORS for `<audio>`/`<video>`. If a provider blocks the media request, add a CORS rule allowing `GET` from `https://newagelearning.in`.

## After setting the vars

1. Redeploy the Render service (env changes trigger a redeploy; it runs `npm install`, which pulls the new AWS SDK packages).
2. In admin, open a title → **⬆ upload a new PDF** (or add audio/video). 
3. On the learner page, open that title → **Open full PDF** / press play. It now streams the real file.
