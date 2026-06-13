-- =============================================================
--  New Age Learning — PostgreSQL schema
--  Run with:  psql -d newagelearning -f schema.sql
--  Postgres 14+ recommended.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- for gen_random_uuid()

-- ---------- enumerated types ----------
CREATE TYPE user_role        AS ENUM ('learner', 'educator', 'institution', 'admin');
CREATE TYPE learner_type     AS ENUM ('young_explorer', 'student', 'professional');
CREATE TYPE access_level     AS ENUM ('free', 'trial', 'paid');           -- admin-only field
CREATE TYPE file_type        AS ENUM ('pdf', 'audio', 'video');           -- read / listen / watch
CREATE TYPE content_status   AS ENUM ('draft', 'pending', 'live', 'hidden');
CREATE TYPE approval_status  AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE blog_status      AS ENUM ('draft', 'pending', 'published', 'rejected');
CREATE TYPE field_type       AS ENUM ('text', 'number', 'email', 'date', 'dropdown');
CREATE TYPE block_type       AS ENUM ('text', 'image', 'video');
CREATE TYPE campaign_channel AS ENUM ('push', 'email', 'in_app');
CREATE TYPE order_status     AS ENUM ('created', 'paid', 'failed', 'refunded');

-- =============================================================
--  USERS  (learners, educators, institutions, admins)
-- =============================================================
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role           user_role     NOT NULL DEFAULT 'learner',
    learner_kind   learner_type,                        -- only meaningful when role = learner
    name           TEXT          NOT NULL,
    mobile         TEXT          NOT NULL UNIQUE,        -- primary login id in India
    email          TEXT          UNIQUE,                 -- optional
    password_hash  TEXT          NOT NULL,
    city           TEXT,
    state          TEXT,
    -- values for any admin-defined custom signup fields (key = signup_fields.field_key)
    custom_fields  JSONB         NOT NULL DEFAULT '{}',
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ
);
CREATE INDEX idx_users_role ON users(role);

-- =============================================================
--  CATALOG  (self-referencing tree: section > sub > sub-sub)
--  One table models all three levels and stays future-proof.
-- =============================================================
CREATE TABLE catalog_nodes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id   UUID REFERENCES catalog_nodes(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,                  -- e.g. "Class 1", "Maths", "Algebra"
    node_kind   TEXT NOT NULL,                  -- descriptive: Class / Age group / Subject / Topic
    depth       SMALLINT NOT NULL DEFAULT 0,    -- 0 section, 1 sub-section, 2 sub-sub-section
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_catalog_parent ON catalog_nodes(parent_id);

-- =============================================================
--  CONTENT  (books / PDFs / audio / video)
-- =============================================================
CREATE TABLE content_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title            TEXT          NOT NULL,
    author           TEXT,                              -- ADMIN-ONLY (not exposed publicly yet)
    publication_date DATE,
    age_group        TEXT,
    access_level     access_level  NOT NULL DEFAULT 'free',  -- ADMIN-ONLY
    price_inr        NUMERIC(10,2),                     -- ADMIN-ONLY, only when trial/paid
    catalog_node_id  UUID REFERENCES catalog_nodes(id) ON DELETE SET NULL,
    cover_image_url  TEXT,
    status           content_status NOT NULL DEFAULT 'draft',
    -- approval workflow (for content submitted by educators)
    submitted_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    approval         approval_status NOT NULL DEFAULT 'approved', -- admin uploads = approved
    reviewed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_status   ON content_items(status);
CREATE INDEX idx_content_approval ON content_items(approval);
CREATE INDEX idx_content_node     ON content_items(catalog_node_id);

-- a content item can have one file per format (read=pdf, listen=audio, watch=video)
CREATE TABLE content_files (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id       UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    kind             file_type NOT NULL,
    file_url         TEXT NOT NULL,                     -- object-storage URL (S3/GCS/CDN)
    file_size_bytes  BIGINT,
    duration_seconds INT,                               -- for audio / video
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (content_id, kind)
);

-- =============================================================
--  BLOGS  (with approval workflow)
-- =============================================================
CREATE TABLE blogs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    body            TEXT,
    cover_image_url TEXT,
    status          blog_status NOT NULL DEFAULT 'draft',
    author_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    views           INT NOT NULL DEFAULT 0,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_blogs_status ON blogs(status);

-- =============================================================
--  SIGNUP FIELDS  (admin-configurable form, supports dropdowns)
-- =============================================================
CREATE TABLE signup_fields (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_key    TEXT NOT NULL UNIQUE,          -- machine name, e.g. "interested_in"
    label        TEXT NOT NULL,                 -- shown to user, e.g. "Interested in"
    type         field_type NOT NULL DEFAULT 'text',
    options      JSONB NOT NULL DEFAULT '[]',   -- for type = dropdown: ["AI","Smart money"]
    is_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
    is_system    BOOLEAN NOT NULL DEFAULT FALSE,-- system fields (Name) cannot be deleted
    applies_to   user_role,                     -- NULL = all roles
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
--  BRANDING  (logo per placement) & APPEARANCE (editable blocks)
-- =============================================================
CREATE TABLE branding_assets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    placement  TEXT NOT NULL UNIQUE,            -- header / footer / app_icon / login / email / custom
    image_url  TEXT,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE appearance_blocks (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_key  TEXT NOT NULL UNIQUE,            -- e.g. "home.hero.headline"
    type       block_type NOT NULL DEFAULT 'text',
    text_value TEXT,
    media_url  TEXT,                            -- for image / video blocks
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
--  PERSONALISATION  (wishlist + continue-where-you-left-off)
-- =============================================================
CREATE TABLE wishlist_items (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, content_id)
);

CREATE TABLE reading_progress (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id  UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    last_page   INT,                            -- for pdf
    last_second INT,                            -- for audio / video
    percent     SMALLINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, content_id)
);

-- =============================================================
--  DATA WAREHOUSE FEED  (login & usage history for campaigns)
--  In production this also streams to BigQuery / Snowflake.
-- =============================================================
CREATE TABLE user_events (
    id         BIGSERIAL PRIMARY KEY,
    user_id    UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL = anonymous visitor
    event_type TEXT NOT NULL,                  -- login / view / read / wishlist_add / purchase ...
    content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
    metadata   JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_user ON user_events(user_id);
CREATE INDEX idx_events_type ON user_events(event_type);
CREATE INDEX idx_events_time ON user_events(created_at);

-- =============================================================
--  CAMPAIGNS  (notifications to segments)
-- =============================================================
CREATE TABLE campaigns (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment     JSONB NOT NULL,                -- criteria, e.g. {"role":"learner","inactive_days":30}
    channel     campaign_channel NOT NULL,
    message     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'queued',
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at     TIMESTAMPTZ
);

-- =============================================================
--  ORDERS / PAYMENTS  (built now, dormant until "paid" is switched on)
-- =============================================================
CREATE TABLE orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id    UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    amount_inr    NUMERIC(10,2) NOT NULL,
    gateway       TEXT,                         -- razorpay / paypal
    gateway_ref   TEXT,
    status        order_status NOT NULL DEFAULT 'created',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_user ON orders(user_id);

-- =============================================================
--  CONTACT MESSAGES  (write-to-us; mobile OR email required)
-- =============================================================
CREATE TABLE contact_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT,
    mobile      TEXT,
    email       TEXT,
    message     TEXT NOT NULL,
    handled     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- guarantees we always have a way to reply
    CONSTRAINT contact_reachable CHECK (mobile IS NOT NULL OR email IS NOT NULL)
);

-- =============================================================
--  SEED: system signup fields & default appearance / branding
-- =============================================================
INSERT INTO signup_fields (field_key,label,type,is_enabled,is_mandatory,is_system,sort_order) VALUES
  ('name',        'Name',          'text',     TRUE,  TRUE,  TRUE,  0),
  ('mobile',      'Mobile number', 'number',   TRUE,  TRUE,  FALSE, 1),
  ('city',        'City',          'text',     TRUE,  FALSE, FALSE, 2),
  ('email',       'Email ID',      'email',    TRUE,  FALSE, FALSE, 3);

INSERT INTO signup_fields (field_key,label,type,options,is_enabled,is_mandatory,sort_order) VALUES
  ('state',       'State',         'dropdown', '["Karnataka","Maharashtra","Delhi","Tamil Nadu"]', TRUE, FALSE, 4),
  ('interest',    'Interested in', 'dropdown', '["AI","Smart money","Exam prep","Future skills"]', FALSE, FALSE, 5);

INSERT INTO branding_assets (placement) VALUES
  ('header'), ('footer'), ('app_icon'), ('login'), ('email');

INSERT INTO appearance_blocks (block_key,type,text_value) VALUES
  ('home.hero.headline','text','Learning that helps young India lead the world.'),
  ('home.hero.subtext', 'text','Read, listen and watch — across AI, smart money and the skills tomorrow asks for.'),
  ('home.about.headline','text','Learning built for the new world — and for India''s place in it.');
