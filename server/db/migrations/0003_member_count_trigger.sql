-- Make channels.member_count structurally true.
--
-- The counter is denormalised so the sidebar and channel list do not each run a
-- count. It was maintained by application code, which meant every path that
-- touched channel_members had to remember to update it — and any path that did
-- not silently drifted it. Two such paths were found: the seed wrote a
-- decorative fixture number (#general claimed 428 members in a 58-person
-- workspace), and deleting a user cascade-deleted memberships while leaving the
-- counter untouched.
--
-- A trigger cannot be forgotten by a caller, so the invariant now holds for any
-- writer, including manual SQL.

CREATE OR REPLACE FUNCTION sync_channel_member_count() RETURNS trigger AS $$
BEGIN
  -- Recomputed rather than incremented: an increment is only correct if every
  -- past write was also correct, which is the assumption that failed before.
  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
    UPDATE channels c
       SET member_count = (SELECT count(*) FROM channel_members m WHERE m.channel_id = OLD.channel_id)
     WHERE c.id = OLD.channel_id;
  END IF;

  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    UPDATE channels c
       SET member_count = (SELECT count(*) FROM channel_members m WHERE m.channel_id = NEW.channel_id)
     WHERE c.id = NEW.channel_id;
  END IF;

  RETURN NULL; -- AFTER trigger: the return value is discarded.
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS channel_members_sync_count ON channel_members;

CREATE TRIGGER channel_members_sync_count
AFTER INSERT OR UPDATE OR DELETE ON channel_members
FOR EACH ROW EXECUTE FUNCTION sync_channel_member_count();

-- Repair whatever the application-maintained era left behind.
UPDATE channels c
   SET member_count = (SELECT count(*) FROM channel_members m WHERE m.channel_id = c.id)
 WHERE c.member_count <> (SELECT count(*) FROM channel_members m WHERE m.channel_id = c.id);
