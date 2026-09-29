-- Workspace logos.
--
-- The image itself lives in object storage like any attachment; the row keeps
-- only where it is and what it is. `logo_updated_at` versions the public URL so
-- a browser that cached the old logo fetches the new one.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS logo_key        text,
  ADD COLUMN IF NOT EXISTS logo_mime       text
    CHECK (logo_mime IS NULL OR logo_mime IN ('image/png', 'image/jpeg', 'image/webp')),
  ADD COLUMN IF NOT EXISTS logo_updated_at timestamptz;

-- The workspace name was also copied into settings->>'workspaceName', where
-- the System settings page read and wrote it while everything else showed
-- workspaces.name. The column is the one source now; drop the copy so the two
-- cannot disagree again.
UPDATE workspaces SET settings = settings - 'workspaceName';
