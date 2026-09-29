-- Role kinds, and the permission to create workspaces.
--
-- Code used to name the built-in roles by id — "role_member", "role_owner" —
-- which only works while one workspace exists: role ids are global, so a
-- second workspace cannot also have a "role_member". Each built-in role now
-- carries a kind instead, unique within its workspace, and code asks for "the
-- member role of this workspace". Custom roles have no kind.

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS kind text CHECK (kind IN ('owner', 'admin', 'member', 'guest'));

UPDATE roles SET kind = substring(id FROM 6)
 WHERE kind IS NULL AND id IN ('role_owner', 'role_admin', 'role_member', 'role_guest');

CREATE UNIQUE INDEX IF NOT EXISTS roles_workspace_kind_idx
  ON roles (workspace_id, kind) WHERE kind IS NOT NULL;

-- Only owners and administrators may start a new workspace.
INSERT INTO permissions (id, grp, label, description)
VALUES ('p_workspace_create', 'Administration', 'Create workspaces',
        'Start a new, separate workspace and become its owner.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT id, 'p_workspace_create' FROM roles WHERE kind IN ('owner', 'admin')
ON CONFLICT DO NOTHING;
