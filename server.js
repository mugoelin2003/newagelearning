/**
 * New Age Learning — reference API server (Express + PostgreSQL)
 * --------------------------------------------------------------
 * A starting skeleton, not a finished product. It shows the real
 * patterns: JWT auth, role guards, the public/admin field split,
 * the approval workflow, and configurable signup fields.
 *
 * Run:
 *   npm install
 *   cp .env.example .env   # set DATABASE_URL and JWT_SECRET
 *   psql -d newagelearning -f schema.sql
 *   npm start
 */
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { Pool } = require('pg');
const storage = require('./storage');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render's EXTERNAL database URL needs SSL; the INTERNAL one does not.
  ssl: /render\.com/.test(process.env.DATABASE_URL || '') ? { rejectUnauthorized: false } : false,
});
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const PAID_ENABLED = process.env.PAID_ENABLED === 'true';   // feature flag: paid content
const upload = multer({ storage: multer.memoryStorage() }); // swap for S3/GCS in production

const app = express();
app.use(cors());
app.use(express.json());

// ---------- helpers ----------
const q = (text, params) => pool.query(text, params);
const sign = (u) => jwt.sign({ id: u.id, role: u.role }, JWT_SECRET, { expiresIn: '30d' });

// auth middleware (optional = attaches user if present but never blocks)
function auth(required = true) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return required ? res.status(401).json({ error: 'login required' }) : next();
    try { req.user = jwt.verify(token, JWT_SECRET); next(); }
    catch { return res.status(401).json({ error: 'invalid token' }); }
  };
}
const requireAdmin = (req, res, next) =>
  req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'admin only' });

// log a usage event into the warehouse feed (fire-and-forget)
function logEvent(userId, type, contentId = null, metadata = {}) {
  q(`INSERT INTO user_events(user_id,event_type,content_id,metadata) VALUES ($1,$2,$3,$4)`,
    [userId, type, contentId, metadata]).catch(() => {});
}

// ---- health check: open /api/health in a browser to confirm API + DB are up ----
app.get('/api/health', async (_req, res) => {
  try { await q('SELECT 1'); res.json({ ok: true, db: 'connected', time: new Date().toISOString() }); }
  catch (e) { res.status(500).json({ ok: false, db: 'error', error: e.message }); }
});

// ---- one-time admin bootstrap: creates the FIRST admin, then refuses ----
// Call once with the secret you set in BOOTSTRAP_SECRET, then you can clear that var.
app.post('/api/bootstrap-admin', async (req, res) => {
  const { secret, name, mobile, password } = req.body;
  if (!process.env.BOOTSTRAP_SECRET || secret !== process.env.BOOTSTRAP_SECRET)
    return res.status(403).json({ error: 'forbidden' });
  if (!name || !mobile || !password) return res.status(400).json({ error: 'name, mobile, password required' });
  const { rows: ex } = await q(`SELECT 1 FROM users WHERE role='admin' LIMIT 1`);
  if (ex.length) return res.status(409).json({ error: 'an admin already exists' });
  const hash = await bcrypt.hash(password, 10);
  await q(`INSERT INTO users(role,name,mobile,password_hash) VALUES('admin',$1,$2,$3)`, [name, mobile, hash]);
  res.json({ ok: true, message: 'admin created — you can now sign in to the admin console' });
});

// =====================================================================
//  AUTH
// =====================================================================
app.post('/api/auth/signup', async (req, res) => {
  const { role = 'learner', name, mobile, email, city, state, password, custom_fields = {} } = req.body;
  if (!name || !mobile || !password) return res.status(400).json({ error: 'name, mobile, password required' });

  // validate against admin-configured mandatory fields
  const { rows: fields } = await q(`SELECT field_key,label,type,options FROM signup_fields
                                     WHERE is_enabled AND is_mandatory`);
  for (const f of fields) {
    const present = ['name', 'mobile'].includes(f.field_key)
      ? req.body[f.field_key] : custom_fields[f.field_key];
    if (!present) return res.status(400).json({ error: `${f.label} is required` });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await q(
      `INSERT INTO users(role,name,mobile,email,city,state,password_hash,custom_fields)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,role,name,mobile,email`,
      [role, name, mobile, email || null, city || null, state || null, hash, custom_fields]);
    const user = rows[0];
    logEvent(user.id, 'signup');
    res.status(201).json({ token: sign(user), user });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'mobile or email already registered' });
    res.status(500).json({ error: 'server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { mobile, email, password } = req.body;
  const { rows } = await q(`SELECT * FROM users WHERE mobile=$1 OR email=$2 LIMIT 1`,
    [mobile || null, email || null]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password_hash)))
    return res.status(401).json({ error: 'wrong credentials' });
  await q(`UPDATE users SET last_login_at=now() WHERE id=$1`, [user.id]);
  logEvent(user.id, 'login');
  res.json({ token: sign(user), user: { id: user.id, role: user.role, name: user.name } });
});

app.get('/api/auth/me', auth(), async (req, res) => {
  const { rows } = await q(`SELECT id,role,name,mobile,email,city,state,custom_fields FROM users WHERE id=$1`,
    [req.user.id]);
  res.json(rows[0] || null);
});

// =====================================================================
//  CATALOG
// =====================================================================
app.get('/api/catalog', async (_req, res) => {
  const { rows } = await q(`SELECT id,parent_id,name,node_kind,depth,sort_order
                            FROM catalog_nodes ORDER BY depth,sort_order,name`);
  // build a tree
  const byId = Object.fromEntries(rows.map(n => [n.id, { ...n, children: [] }]));
  const roots = [];
  rows.forEach(n => n.parent_id ? byId[n.parent_id]?.children.push(byId[n.id]) : roots.push(byId[n.id]));
  res.json(roots);
});

app.post('/api/admin/catalog', auth(), requireAdmin, async (req, res) => {
  const { parent_id = null, name, node_kind = 'Section' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  let depth = 0;
  if (parent_id) {
    const { rows } = await q(`SELECT depth FROM catalog_nodes WHERE id=$1`, [parent_id]);
    depth = (rows[0]?.depth ?? -1) + 1;
  }
  const { rows } = await q(
    `INSERT INTO catalog_nodes(parent_id,name,node_kind,depth) VALUES ($1,$2,$3,$4) RETURNING *`,
    [parent_id, name, node_kind, depth]);
  res.status(201).json(rows[0]);
});

app.delete('/api/admin/catalog/:id', auth(), requireAdmin, async (req, res) => {
  await q(`DELETE FROM catalog_nodes WHERE id=$1`, [req.params.id]); // children cascade
  res.json({ ok: true });
});

// =====================================================================
//  CONTENT  — note the public/admin field split
// =====================================================================
const PUBLIC_CONTENT = `
  SELECT c.id, c.title, c.age_group, c.cover_image_url,
         COALESCE(array_agg(f.kind) FILTER (WHERE f.kind IS NOT NULL), '{}') AS formats
  FROM content_items c
  LEFT JOIN content_files f ON f.content_id = c.id
  WHERE c.status = 'live'
  GROUP BY c.id`;

app.get('/api/content', async (req, res) => {
  // never selects author / access_level / price_inr — keeps them off the public site
  const { rows } = await q(PUBLIC_CONTENT + ` ORDER BY c.created_at DESC`);
  res.json(rows);
});

app.get('/api/admin/content', auth(), requireAdmin, async (_req, res) => {
  const { rows } = await q(`
    SELECT c.*, COALESCE(array_agg(f.kind) FILTER (WHERE f.kind IS NOT NULL),'{}') AS formats
    FROM content_items c LEFT JOIN content_files f ON f.content_id=c.id
    GROUP BY c.id ORDER BY c.created_at DESC`);
  res.json(rows); // full record incl. author, access_level, price_inr, status
});

app.post('/api/admin/content', auth(), requireAdmin, async (req, res) => {
  const { title, author, publication_date, age_group, access_level = 'free',
          price_inr = null, catalog_node_id = null, cover_image_url = null, status = 'live' } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const { rows } = await q(
    `INSERT INTO content_items(title,author,publication_date,age_group,access_level,price_inr,
       catalog_node_id,cover_image_url,status,approval)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved') RETURNING *`,
    [title, author, publication_date, age_group, access_level, price_inr, catalog_node_id, cover_image_url, status]);
  res.status(201).json(rows[0]);
});

app.patch('/api/admin/content/:id', auth(), requireAdmin, async (req, res) => {
  const allowed = ['title','author','publication_date','age_group','access_level','price_inr',
                   'catalog_node_id','cover_image_url','status'];
  const sets = [], vals = [];
  allowed.forEach(k => { if (k in req.body) { vals.push(req.body[k]); sets.push(`${k}=$${vals.length}`); } });
  if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
  vals.push(req.params.id);
  const { rows } = await q(`UPDATE content_items SET ${sets.join(',')},updated_at=now()
                            WHERE id=$${vals.length} RETURNING *`, vals);
  res.json(rows[0]);
});

app.delete('/api/admin/content/:id', auth(), requireAdmin, async (req, res) => {
  await q(`DELETE FROM content_items WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// upload one format (pdf/audio/video). Stores the bytes in object storage when configured.
app.post('/api/admin/content/:id/files', auth(), requireAdmin, upload.single('file'), async (req, res) => {
  const { kind } = req.body;
  if (!['pdf','audio','video'].includes(kind)) return res.status(400).json({ error: 'bad kind' });
  let file_url;
  if (storage.enabled() && req.file) {
    const ext = kind === 'pdf' ? 'pdf' : kind === 'audio' ? 'mp3' : 'mp4';
    const key = `content/${req.params.id}/${kind}-${Date.now()}.${ext}`;
    await storage.put(key, req.file.buffer, req.file.mimetype);
    file_url = storage.publicUrl(key) || key;   // public URL if available, else the storage key
  } else {
    file_url = `https://cdn.newagelearning.in/${req.params.id}/${kind}`; // placeholder until storage is set up
  }
  const { rows } = await q(
    `INSERT INTO content_files(content_id,kind,file_url,file_size_bytes)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (content_id,kind) DO UPDATE SET file_url=EXCLUDED.file_url,
       file_size_bytes=EXCLUDED.file_size_bytes RETURNING *`,
    [req.params.id, kind, file_url, req.file?.size || null]);
  res.status(201).json(rows[0]);
});

// serve a content file with access control; redirects to a signed/public URL
app.get('/api/content/:id/file/:kind', auth(false), async (req, res) => {
  const { id, kind } = req.params;
  const { rows } = await q(
    `SELECT f.file_url, c.access_level, c.status
     FROM content_files f JOIN content_items c ON c.id = f.content_id
     WHERE f.content_id=$1 AND f.kind=$2`, [id, kind]);
  const row = rows[0];
  if (!row || row.status !== 'live') return res.status(404).json({ error: 'not found' });
  // free is open to all; trial/paid require a logged-in user (full entitlement check is a TODO)
  if (row.access_level !== 'free' && !req.user) return res.status(401).json({ error: 'login required' });
  if (req.user) logEvent(req.user.id, 'open_file', id, { kind });
  if (/^https?:\/\//.test(row.file_url)) return res.redirect(row.file_url);          // stored public URL
  try { return res.redirect(await storage.signedGetUrl(row.file_url)); }              // stored key → sign it
  catch (e) { return res.status(500).json({ error: 'file unavailable' }); }
});

// =====================================================================
//  APPROVALS
// =====================================================================
app.post('/api/educator/content', auth(), async (req, res) => {
  if (!['educator','admin'].includes(req.user.role)) return res.status(403).json({ error: 'educators only' });
  const { title, age_group } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const { rows } = await q(
    `INSERT INTO content_items(title,age_group,status,approval,submitted_by)
     VALUES ($1,$2,'pending','pending',$3) RETURNING *`,
    [title, age_group || null, req.user.id]);
  res.status(201).json(rows[0]);
});

app.get('/api/admin/approvals/content', auth(), requireAdmin, async (_req, res) => {
  const { rows } = await q(`SELECT c.*, u.name AS submitter
    FROM content_items c LEFT JOIN users u ON u.id=c.submitted_by
    WHERE c.approval='pending' ORDER BY c.created_at`);
  res.json(rows);
});

app.post('/api/admin/approvals/content/:id/approve', auth(), requireAdmin, async (req, res) => {
  const { rows } = await q(`UPDATE content_items
    SET approval='approved',status='live',reviewed_by=$1,reviewed_at=now()
    WHERE id=$2 RETURNING *`, [req.user.id, req.params.id]);
  res.json(rows[0]);
});

app.post('/api/admin/approvals/content/:id/reject', auth(), requireAdmin, async (req, res) => {
  const { rows } = await q(`UPDATE content_items
    SET approval='rejected',status='draft',reviewed_by=$1,reviewed_at=now()
    WHERE id=$2 RETURNING *`, [req.user.id, req.params.id]);
  res.json(rows[0]);
});

app.get('/api/admin/approvals/blogs', auth(), requireAdmin, async (_req, res) => {
  const { rows } = await q(`SELECT * FROM blogs WHERE status='pending' ORDER BY created_at`);
  res.json(rows);
});

app.post('/api/admin/approvals/blogs/:id/approve', auth(), requireAdmin, async (req, res) => {
  const { rows } = await q(`UPDATE blogs SET status='published',published_at=now(),reviewed_by=$1
                            WHERE id=$2 RETURNING *`, [req.user.id, req.params.id]);
  res.json(rows[0]);
});

app.post('/api/admin/approvals/blogs/:id/reject', auth(), requireAdmin, async (req, res) => {
  const { rows } = await q(`UPDATE blogs SET status='rejected',reviewed_by=$1 WHERE id=$2 RETURNING *`,
    [req.user.id, req.params.id]);
  res.json(rows[0]);
});

// =====================================================================
//  BLOGS (public)
// =====================================================================
app.get('/api/blogs', async (_req, res) => {
  const { rows } = await q(`SELECT id,title,slug,cover_image_url,published_at,views
                            FROM blogs WHERE status='published' ORDER BY published_at DESC`);
  res.json(rows);
});

app.get('/api/blogs/:slug', async (req, res) => {
  const { rows } = await q(`UPDATE blogs SET views=views+1 WHERE slug=$1 AND status='published' RETURNING *`,
    [req.params.slug]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'not found' });
});

// =====================================================================
//  SIGNUP FIELDS
// =====================================================================
app.get('/api/signup-fields', async (_req, res) => {
  const { rows } = await q(`SELECT field_key,label,type,options,is_mandatory,applies_to
                            FROM signup_fields WHERE is_enabled ORDER BY sort_order`);
  res.json(rows);
});

// admin sees ALL fields (incl. disabled and system) for management
app.get('/api/admin/signup-fields', auth(), requireAdmin, async (_req, res) => {
  const { rows } = await q(`SELECT id,field_key,label,type,options,is_enabled,is_mandatory,
                            is_system,applies_to,sort_order FROM signup_fields ORDER BY sort_order`);
  res.json(rows);
});

app.post('/api/admin/signup-fields', auth(), requireAdmin, async (req, res) => {
  const { label, type = 'text', options = [], is_enabled = true, is_mandatory = false, applies_to = null } = req.body;
  if (!label) return res.status(400).json({ error: 'label required' });
  const field_key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const { rows } = await q(
    `INSERT INTO signup_fields(field_key,label,type,options,is_enabled,is_mandatory,applies_to,sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(MAX(sort_order),0)+1 FROM signup_fields))
     RETURNING *`,
    [field_key, label, type, JSON.stringify(options), is_enabled, is_mandatory, applies_to]);
  res.status(201).json(rows[0]);
});

app.patch('/api/admin/signup-fields/:id', auth(), requireAdmin, async (req, res) => {
  const allowed = ['label','type','options','is_enabled','is_mandatory','applies_to'];
  const sets = [], vals = [];
  allowed.forEach(k => { if (k in req.body) {
    vals.push(k === 'options' ? JSON.stringify(req.body[k]) : req.body[k]);
    sets.push(`${k}=$${vals.length}`);
  }});
  if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
  vals.push(req.params.id);
  const { rows } = await q(`UPDATE signup_fields SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  res.json(rows[0]);
});

app.delete('/api/admin/signup-fields/:id', auth(), requireAdmin, async (req, res) => {
  const { rows } = await q(`SELECT is_system FROM signup_fields WHERE id=$1`, [req.params.id]);
  if (rows[0]?.is_system) return res.status(403).json({ error: 'system field cannot be deleted' });
  await q(`DELETE FROM signup_fields WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// =====================================================================
//  BRANDING & APPEARANCE
// =====================================================================
app.get('/api/branding', async (_req, res) => {
  const { rows } = await q(`SELECT placement,image_url FROM branding_assets`);
  res.json(rows);
});
app.put('/api/admin/branding/:placement', auth(), requireAdmin, upload.single('file'), async (req, res) => {
  let image_url;
  if (storage.enabled() && req.file) {
    const key = `branding/${req.params.placement}-${Date.now()}`;
    await storage.put(key, req.file.buffer, req.file.mimetype);
    image_url = storage.publicUrl(key) || key;
  } else {
    image_url = req.body.image_url || `https://cdn.newagelearning.in/logos/${req.params.placement}`;
  }
  const { rows } = await q(
    `INSERT INTO branding_assets(placement,image_url,updated_by) VALUES ($1,$2,$3)
     ON CONFLICT (placement) DO UPDATE SET image_url=EXCLUDED.image_url,updated_at=now() RETURNING *`,
    [req.params.placement, image_url, req.user.id]);
  res.json(rows[0]);
});

app.get('/api/appearance', async (_req, res) => {
  const { rows } = await q(`SELECT block_key,type,text_value,media_url FROM appearance_blocks`);
  res.json(rows);
});
app.put('/api/admin/appearance/:key', auth(), requireAdmin, async (req, res) => {
  const { text_value = null, media_url = null, type = 'text' } = req.body;
  const { rows } = await q(
    `INSERT INTO appearance_blocks(block_key,type,text_value,media_url,updated_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (block_key) DO UPDATE SET text_value=EXCLUDED.text_value,
       media_url=EXCLUDED.media_url,type=EXCLUDED.type,updated_at=now() RETURNING *`,
    [req.params.key, type, text_value, media_url, req.user.id]);
  res.json(rows[0]);
});

// =====================================================================
//  WISHLIST & PROGRESS
// =====================================================================
app.get('/api/me/wishlist', auth(), async (req, res) => {
  const { rows } = await q(`SELECT c.id,c.title,c.cover_image_url FROM wishlist_items w
    JOIN content_items c ON c.id=w.content_id WHERE w.user_id=$1 ORDER BY w.created_at DESC`,
    [req.user.id]);
  res.json(rows);
});
app.post('/api/me/wishlist/:contentId', auth(), async (req, res) => {
  await q(`INSERT INTO wishlist_items(user_id,content_id) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`, [req.user.id, req.params.contentId]);
  logEvent(req.user.id, 'wishlist_add', req.params.contentId);
  res.json({ ok: true });
});
app.delete('/api/me/wishlist/:contentId', auth(), async (req, res) => {
  await q(`DELETE FROM wishlist_items WHERE user_id=$1 AND content_id=$2`,
    [req.user.id, req.params.contentId]);
  res.json({ ok: true });
});
app.put('/api/me/progress/:contentId', auth(), async (req, res) => {
  const { last_page = null, last_second = null, percent = 0 } = req.body;
  await q(`INSERT INTO reading_progress(user_id,content_id,last_page,last_second,percent)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (user_id,content_id) DO UPDATE SET last_page=$3,last_second=$4,
             percent=$5,updated_at=now()`,
    [req.user.id, req.params.contentId, last_page, last_second, percent]);
  res.json({ ok: true });
});
app.get('/api/me/progress/:contentId', auth(), async (req, res) => {
  const { rows } = await q(`SELECT last_page,last_second,percent FROM reading_progress
                            WHERE user_id=$1 AND content_id=$2`, [req.user.id, req.params.contentId]);
  res.json(rows[0] || { percent: 0 });
});

// =====================================================================
//  EVENTS & CAMPAIGNS
// =====================================================================
app.post('/api/events', auth(false), async (req, res) => {
  const { event_type, content_id = null, metadata = {} } = req.body;
  if (!event_type) return res.status(400).json({ error: 'event_type required' });
  logEvent(req.user?.id || null, event_type, content_id, metadata);
  res.json({ ok: true });
});

app.get('/api/admin/users/segments', auth(), requireAdmin, async (_req, res) => {
  const { rows } = await q(`SELECT role, COUNT(*)::int AS count FROM users GROUP BY role`);
  res.json(rows);
});

app.post('/api/admin/campaigns', auth(), requireAdmin, async (req, res) => {
  const { segment, channel, message } = req.body;
  if (!segment || !channel || !message) return res.status(400).json({ error: 'segment, channel, message required' });
  const { rows } = await q(
    `INSERT INTO campaigns(segment,channel,message,created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
    [segment, channel, message, req.user.id]);
  // TODO: enqueue to push/email/in-app worker
  res.status(201).json(rows[0]);
});

// =====================================================================
//  PAYMENTS (dormant until PAID_ENABLED=true)
// =====================================================================
app.post('/api/orders', auth(), async (req, res) => {
  if (!PAID_ENABLED) return res.status(403).json({ error: 'paid content not enabled' });
  const { content_id } = req.body;
  const { rows: c } = await q(`SELECT price_inr,access_level FROM content_items WHERE id=$1`, [content_id]);
  if (!c[0] || c[0].access_level === 'free') return res.status(400).json({ error: 'item is free' });
  const { rows } = await q(
    `INSERT INTO orders(user_id,content_id,amount_inr,gateway,status)
     VALUES ($1,$2,$3,'razorpay','created') RETURNING *`,
    [req.user.id, content_id, c[0].price_inr]);
  // TODO: create Razorpay order, return gateway order id for the client SDK
  res.status(201).json(rows[0]);
});

// =====================================================================
//  CONTACT US  (public; requires a message + mobile OR email)
// =====================================================================
app.post('/api/contact', async (req, res) => {
  const { name = null, mobile = null, email = null, message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'message required' });
  if (!mobile && !email) return res.status(400).json({ error: 'a mobile number or email is required' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'invalid email' });
  if (mobile && !/^\+?\d[\d\s-]{7,14}$/.test(mobile)) return res.status(400).json({ error: 'invalid mobile' });
  const { rows } = await q(
    `INSERT INTO contact_messages(name,mobile,email,message) VALUES ($1,$2,$3,$4) RETURNING id`,
    [name, mobile || null, email || null, message.trim()]);
  res.status(201).json({ ok: true, id: rows[0].id });
});

app.use((_req, res) => res.status(404).json({ error: 'not found' }));

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`New Age Learning API on :${PORT}`));
}
module.exports = app;   // also importable by the Netlify Function wrapper
