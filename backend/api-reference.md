# New Age Learning — API reference

Base URL: `https://api.newagelearning.in`
Auth: JWT in `Authorization: Bearer <token>`. Admin routes additionally require `role = admin`.

A guiding rule, enforced server-side: **public content responses never include `author`, `access_level`, or `price`.** Those are admin-only and only appear on `/api/admin/*` routes. This is what keeps them off the live site even though they are stored.

---

## Auth

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | public | Create a learner / educator / institution account |
| POST | `/api/auth/login` | public | Log in with mobile (or email) + password → JWT |
| POST | `/api/auth/logout` | user | Invalidate the session |
| GET  | `/api/auth/me` | user | Current profile (drives "logged-in" state, wishlist, progress) |

**POST /api/auth/signup**
```json
// request
{ "role":"learner", "name":"Asha R", "mobile":"98xxxxxxxx",
  "email":"asha@x.com", "city":"Bengaluru",
  "custom_fields": { "interest":"AI", "state":"Karnataka" } }
// response
{ "token":"<jwt>", "user": { "id":"...","role":"learner","name":"Asha R" } }
```
The server validates against `signup_fields`: any field that is `is_enabled = true AND is_mandatory = true` must be present; dropdown values must be one of the stored `options`.

---

## Catalog structure  → admin "Catalog structure"

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET    | `/api/catalog` | public | Full tree (sections → sub → sub-sub) for menus & filters |
| POST   | `/api/admin/catalog` | admin | Add a section / sub-section / sub-sub-section |
| PATCH  | `/api/admin/catalog/:id` | admin | Rename / reorder |
| DELETE | `/api/admin/catalog/:id` | admin | Delete a node (children cascade) |

```json
// POST /api/admin/catalog
{ "parent_id": null, "name":"Class 2", "node_kind":"Class" }
```

---

## Content library  → admin "Content library" + public library

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET    | `/api/content` | public | List **live** items; author/access/price stripped |
| GET    | `/api/content/:id` | public | One item (same stripping) |
| GET    | `/api/admin/content` | admin | Full list incl. author, access, price, status |
| POST   | `/api/admin/content` | admin | Create an item (then attach files) |
| PATCH  | `/api/admin/content/:id` | admin | Edit fields; toggle `status` live/hidden |
| DELETE | `/api/admin/content/:id` | admin | Remove item + its files |
| POST   | `/api/admin/content/:id/files` | admin | Upload PDF / audio / video (multipart) |
| DELETE | `/api/admin/content/:id/files/:kind` | admin | Remove one format |

```json
// GET /api/content  (PUBLIC — note what is absent)
[ { "id":"...", "title":"AI for Curious Kids", "age_group":"Ages 8–12",
    "cover_image_url":"...", "formats":["pdf","audio","video"] } ]

// GET /api/admin/content  (ADMIN — full record)
[ { "id":"...", "title":"AI for Curious Kids", "author":"Priya Nair",
    "access_level":"free", "price_inr":null, "status":"live",
    "formats":["pdf","audio","video"] } ]
```

File upload uses `multipart/form-data` with `kind` (pdf|audio|video) and `file`. The server streams the file to object storage (S3/GCS) and saves the returned URL in `content_files`.

---

## Approvals  → admin "Approvals"

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/educator/content` | educator | Submit content → lands as `approval='pending'`, `status='pending'` |
| GET  | `/api/admin/approvals/content` | admin | Queue of pending educator content |
| POST | `/api/admin/approvals/content/:id/approve` | admin | Set approved + live |
| POST | `/api/admin/approvals/content/:id/reject` | admin | Set rejected (sent back) |
| GET  | `/api/admin/approvals/blogs` | admin | Queue of pending blogs |
| POST | `/api/admin/approvals/blogs/:id/approve` | admin | Publish the blog |
| POST | `/api/admin/approvals/blogs/:id/reject` | admin | Reject the blog |

Approve sets `approval='approved'`, `status='live'`, `reviewed_by`, `reviewed_at`. Nothing submitted by an educator is ever returned by the public `/api/content` until it reaches `status='live'`.

---

## Blogs  → admin "Blogs"

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET    | `/api/blogs` | public | Published blogs (SEO traffic) |
| GET    | `/api/blogs/:slug` | public | One blog; increments `views` |
| POST   | `/api/admin/blogs` | admin | Create/publish directly |
| PATCH  | `/api/admin/blogs/:id` | admin | Edit / change status / set cover |
| DELETE | `/api/admin/blogs/:id` | admin | Delete |

---

## Signup fields  → admin "Signup fields"

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET    | `/api/signup-fields` | public | Enabled fields, in order, to render the form |
| GET    | `/api/admin/signup-fields` | admin | All fields incl. disabled |
| POST   | `/api/admin/signup-fields` | admin | Add a field (text/number/email/date/**dropdown**) |
| PATCH  | `/api/admin/signup-fields/:id` | admin | Toggle enabled / mandatory; edit options |
| DELETE | `/api/admin/signup-fields/:id` | admin | Delete (blocked for `is_system`) |

```json
// POST /api/admin/signup-fields  (a dropdown)
{ "label":"Interested in", "type":"dropdown",
  "options":["AI","Smart money","Exam prep"],
  "is_enabled":true, "is_mandatory":false }
```

---

## Branding & appearance  → admin "Branding" + "Appearance"

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/branding` | public | Logo URL per placement |
| PUT | `/api/admin/branding/:placement` | admin | Upload/replace a logo (multipart) |
| POST| `/api/admin/branding` | admin | Add a new placement slot |
| GET | `/api/appearance` | public | All editable blocks (text/image/video) |
| PUT | `/api/admin/appearance/:key` | admin | Update text, or upload a picture/video |

---

## Wishlist & progress  → public "♡" + "continue where you left off"

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET    | `/api/me/wishlist` | user | List saved items |
| POST   | `/api/me/wishlist/:contentId` | user | Save |
| DELETE | `/api/me/wishlist/:contentId` | user | Remove |
| GET    | `/api/me/progress/:contentId` | user | Resume position |
| PUT    | `/api/me/progress/:contentId` | user | Save position (page/second/percent) |

---

## Events & campaigns  → data warehouse + admin "Users & campaigns"

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/events` | any | Log a usage event (fire-and-forget; anonymous allowed) |
| GET  | `/api/admin/users/segments` | admin | Segment counts from the warehouse |
| POST | `/api/admin/campaigns` | admin | Queue a push/email/in-app campaign to a segment |

Every login and content view should POST to `/api/events`; these rows feed segmentation and campaigns.

---

## Payments (dormant)

Built but gated behind a feature flag until you switch `paid` on.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/orders` | user | Create an order for a paid/trial item (Razorpay/PayPal) |
| POST | `/api/payments/webhook` | gateway | Confirm payment → unlock content |

---

## Contact us  → public "Contact us" form

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/contact` | public | Submit a query. Requires a message and **at least** a mobile or email. |

```json
// POST /api/contact
{ "name":"Asha", "mobile":"98xxxxxxxx", "email":"", "message":"How do I reset my password?" }
```
The server rejects the request (400) unless `message` is present and at least one of `mobile` / `email` is supplied and well-formed. The database enforces the same rule with a CHECK constraint.

---

### Status codes
`200` ok · `201` created · `400` validation · `401` no/!valid token · `403` wrong role · `404` not found · `409` conflict (e.g. duplicate mobile).
