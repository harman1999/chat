-- Teams.
--
-- A team is a named group of people inside the one workspace, with channels of
-- its own. Someone can be in several teams. There is still a single account per
-- person: teams organise the workspace, they do not divide it.
--
-- Access is still decided by channel_members, as everywhere else. A team is a
-- way of filling that table in bulk: adding someone to a team adds them to the
-- team's channels, and removing them takes them out again.

CREATE TABLE IF NOT EXISTS teams (
  id           text PRIMARY KEY,
  workspace_id text        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  description  text        NOT NULL DEFAULT '',
  created_by   text        REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- "Support" and "support" side by side in a picker is a mistake waiting to be made.
CREATE UNIQUE INDEX IF NOT EXISTS teams_workspace_name_idx ON teams (workspace_id, lower(name));

CREATE TABLE IF NOT EXISTS team_members (
  team_id   text        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS team_members_user_idx ON team_members (user_id);

-- Deleting a team leaves its channels standing as ordinary channels.
ALTER TABLE channels ADD COLUMN IF NOT EXISTS team_id text REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS channels_team_idx ON channels (team_id) WHERE team_id IS NOT NULL;

-- Only owners and administrators manage teams.
INSERT INTO permissions (id, grp, label, description)
VALUES ('p_team_manage', 'People', 'Manage teams', 'Create teams, and add or remove their people and channels.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT id, 'p_team_manage' FROM roles WHERE kind IN ('owner', 'admin')
ON CONFLICT DO NOTHING;

-- "Create workspaces" is retired: the workspace is fixed and teams replace it.
-- Left in the matrix it would be a permission that grants nothing.
DELETE FROM permissions WHERE id = 'p_workspace_create';

-- Workspaces made with that feature are kept but put away. Sign-in and the menu
-- ignore an archived workspace, so nobody is asked to choose between two. The
-- evidence is the audit log: creating a workspace wrote a 'workspace.created'
-- entry for the new account's own workspace.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE workspaces SET archived_at = now()
 WHERE archived_at IS NULL
   AND id IN (SELECT workspace_id FROM audit_log
               WHERE action = 'workspace.created' AND target LIKE '%, from %');
