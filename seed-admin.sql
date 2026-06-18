-- Guaranteed way to create the admin (no curl, no secret).
-- Run from a file so the shell doesn't mangle the $ signs in the hash:
--   psql "<YOUR EXTERNAL DATABASE URL>" -f seed-admin.sql
--
-- Then log in to /admin with:
--   mobile:   9937049949
--   password: NewAge@2026
-- (change the mobile below if you like; the password matches the hash)

INSERT INTO users (role, name, mobile, password_hash)
VALUES ('admin', 'Admin', '9937049949',
        '$2b$10$sjA42CFHVIYMjLBCe4Vsk.87ofXl9nGQsO/s.HTC5/HYl0Ne.p2Lu');
