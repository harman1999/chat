-- Profile photos.
--
-- Stored like workspace logos: the image in object storage, the row keeping
-- where it is and what it is. `avatar_url` (from 0001, never written until
-- now) holds the versioned URL clients load, so every place that already
-- renders avatarUrl shows the photo without change.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_key  text,
  ADD COLUMN IF NOT EXISTS avatar_mime text
    CHECK (avatar_mime IS NULL OR avatar_mime IN ('image/png', 'image/jpeg', 'image/webp'));
