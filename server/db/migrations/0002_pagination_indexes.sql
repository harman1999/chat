-- Indexes supporting the paginated and batched reads added in Phase 10.
--
-- Written as a migration rather than folded into 0001: the initial schema has
-- already been applied to databases that must not be rebuilt.

-- messagesRepo.listReplies pages forward through a thread.
CREATE INDEX IF NOT EXISTS messages_thread_created_idx
  ON messages (thread_root_id, created_at, id)
  WHERE thread_root_id IS NOT NULL AND deleted_at IS NULL;

-- messagesRepo.listMentions, newest first for one user.
CREATE INDEX IF NOT EXISTS message_mentions_user_message_idx
  ON message_mentions (user_id, message_id);

-- messagesRepo.listSaved, newest first for one user.
CREATE INDEX IF NOT EXISTS message_saves_user_created_idx
  ON message_saves (user_id, created_at DESC);

-- threadsRepo.listFollowed orders by the last reply, per user.
CREATE INDEX IF NOT EXISTS thread_follows_user_idx
  ON thread_follows (user_id, root_id);

-- channelsRepo.members and the admin directory both sort by display name.
CREATE INDEX IF NOT EXISTS users_workspace_name_idx
  ON users (workspace_id, display_name)
  WHERE account_status <> 'deactivated';

-- attachments are listed per channel, newest first.
CREATE INDEX IF NOT EXISTS attachments_channel_uploaded_idx
  ON attachments (channel_id, uploaded_at DESC)
  WHERE channel_id IS NOT NULL;

-- The audit log is always read newest-first within a workspace, often filtered
-- by category.
CREATE INDEX IF NOT EXISTS audit_log_workspace_category_idx
  ON audit_log (workspace_id, category, created_at DESC);
