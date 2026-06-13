# Connecting the front ends to the backend

This explains how the screens go from clickable demos to a live, data-backed product, and what changed in this pass.

## The short version

Every front end talks to the backend through one small client, `api.js`. It ships with a built-in mock so the screens work with no server. To go live, you set two values once:

```html
<script src="api.js"></script>
<script>
  NAL.config({ base: 'https://api.newagelearning.in', mock: false });
</script>
```

That's the whole switch. `mock: true` (the default) resolves calls against in-memory sample data; `mock: false` sends real `fetch` requests to your deployed server. No other code changes.

## What's already wired

The **learner portal** (`learner.html`) is fully converted as the working template. Its data no longer lives in the page — it loads through an API layer at the top of the script (look for the `API LAYER` comment). Specifically:

| Action in the UI | API call |
|---|---|
| Loading the library on open | `GET /api/content` |
| Saving / removing a wishlist item | `POST` / `DELETE /api/me/wishlist/:id` |
| Saving reading or playback position | `PUT /api/me/progress/:id` |
| Opening any content | `POST /api/events` (a `view` event) |

It defaults to `USE_MOCK = true` so it still runs standalone; set that to `false` and point `API_BASE` at your server to make it live. There's also a graceful fallback: if the backend is unreachable, it shows offline data instead of breaking.

## Wiring the other front ends

Each one follows the same pattern — replace the in-memory arrays with an `await` call, and route writes through the client. The mapping:

**Public site (`index.html`)**
- Hero/About text → `NAL.appearance.list()`
- Signup form fields (incl. dropdowns) → `NAL.signupFields.list()`
- Logos → `NAL.branding.list()`
- Library cards → `NAL.content.list()`
- Sign up / Log in → `NAL.auth.signup()` / `NAL.auth.login()`, then `NAL.setToken(token)`

**Educator (`educator.html`)**
- Submit content → `NAL.educator.submitContent()`
- My content / status → `NAL.content.adminList()` filtered to the educator
- Blogs → `NAL.blogs.create()`
- (Learner questions/availability need the schema additions noted below)

**Institution (`institution.html`)**
- Members, classes, assignments → endpoints to be added (see below)
- Reports → derived from `user_events`

**Admin (`admin.html`)**
- Catalog → `NAL.catalog.*`
- Content + uploads → `NAL.content.*`, `NAL.content.uploadFile()`
- Approvals → `NAL.approvals.*`
- Signup fields → `NAL.signupFields.*`
- Branding / appearance → `NAL.branding.set()` / `NAL.appearance.set()`
- Campaigns → `NAL.campaigns.send()`

## Auth flow

1. User signs up or logs in → server returns a JWT.
2. Call `NAL.setToken(token)` and keep the token (in your app, a secure cookie or storage).
3. Every later call automatically sends `Authorization: Bearer <token>`.
4. Admin and educator routes also check the user's role server-side.

## Schema additions still needed

The portals built after the backend introduced a few concepts the current `schema.sql` doesn't cover yet. When you're ready to wire them, add:

- **Educator availability + learner questions** — an availability flag on educators, and a `questions` table linking a learner, optional content item (specific vs general), the text, and the reply.
- **Institution structures** — `institutions`, `classes`, class membership, `assignments` (content → class, due date, required), and per-grade access rules.

These are straightforward extensions of the existing tables, and the `api.js` client already has placeholders where their methods will slot in.

## Consistency pass (done in this round)

Alongside the wiring, the screens were aligned so they read as one product:

- **Unified palette** — the same lavender-gray scale (`--muted`, `--line`, `--paper`, shadows) now across the learner, educator, institution, and admin surfaces. The institution console previously used a bluer gray; it now matches.
- **Accessibility baseline everywhere** — a visible keyboard focus ring (`:focus-visible`) and full `prefers-reduced-motion` support were added to every surface, matching the public site.
- Role-specific accent gradients on each logo mark were kept on purpose, so each area still has its own identity within the shared system.
