-- Optional: run AFTER schema.sql so the learner page shows real data from Postgres.
--   psql "<YOUR DATABASE URL>" -f sample-data.sql

WITH new_items AS (
  INSERT INTO content_items (title, age_group, access_level, status, approval) VALUES
    ('Smart Money for Teens', 'Grades 8–12', 'free', 'live', 'approved'),
    ('AI for Curious Kids',   'Ages 8–12',   'free', 'live', 'approved'),
    ('Future Skills Playbook','Professional','free', 'live', 'approved')
  RETURNING id, title
)
INSERT INTO content_files (content_id, kind, file_url)
SELECT id, 'pdf', 'https://cdn.example.com/' || id || '.pdf' FROM new_items;
