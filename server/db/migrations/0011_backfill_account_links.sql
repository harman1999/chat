-- Links accounts for workspaces created before links existed (0010).
--
-- The only evidence used is the audit log. Creating a workspace writes a
-- 'workspace.created' entry for the *new* account, with the workspace it was
-- made from, and only after the creator's password was checked and their
-- session held. That is proof the two accounts are one person; nothing else is
-- treated as one, so an account that merely shares an email stays unlinked.

WITH created AS (
  SELECT a.actor_id AS new_user_id, (regexp_match(a.target, ', from (.+)$'))[1] AS from_workspace
    FROM audit_log a
   WHERE a.action = 'workspace.created' AND a.target ~ ', from .+$' AND a.actor_id IS NOT NULL
),
pairs AS (
  SELECT DISTINCT c.new_user_id, o.id AS origin_user_id
    FROM created c
    JOIN users n ON n.id = c.new_user_id
    JOIN users o ON o.workspace_id = c.from_workspace
                AND lower(o.email) = lower(n.email) AND NOT o.is_bot AND o.id <> n.id
)
UPDATE users o
   SET identity_id = 'ident_' || gen_random_uuid()
  FROM pairs p
 WHERE o.id = p.origin_user_id AND o.identity_id IS NULL;

UPDATE users n
   SET identity_id = o.identity_id
  FROM (
    SELECT DISTINCT c.new_user_id, o2.id AS origin_user_id
      FROM (
        SELECT a.actor_id AS new_user_id, (regexp_match(a.target, ', from (.+)$'))[1] AS from_workspace
          FROM audit_log a
         WHERE a.action = 'workspace.created' AND a.target ~ ', from .+$' AND a.actor_id IS NOT NULL
      ) c
      JOIN users n2 ON n2.id = c.new_user_id
      JOIN users o2 ON o2.workspace_id = c.from_workspace
                   AND lower(o2.email) = lower(n2.email) AND NOT o2.is_bot AND o2.id <> n2.id
  ) p
  JOIN users o ON o.id = p.origin_user_id
 WHERE n.id = p.new_user_id AND n.identity_id IS NULL AND o.identity_id IS NOT NULL;
