import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

describe("channel lifecycle", () => {
  let owner: Client;
  let member: Client;
  const created: string[] = [];

  beforeAll(async () => {
    await assertServerRunning();
    owner = await signIn(ACCOUNTS.owner);
    member = await signIn(ACCOUNTS.member);
  });

  afterAll(async () => {
    if (created.length) {
      await db().query(`DELETE FROM channels WHERE id = ANY($1::text[])`, [created]);
    }
    await closeDb();
  });

  const create = async (name: string, kind: "public" | "private" = "public") => {
    const response = await owner.fetch("/channels", {
      method: "POST",
      body: JSON.stringify({ name, purpose: "Created by a test", kind }),
    });
    const channel = (await response.json()) as { id: string; name: string; memberCount: number };
    if (channel.id) created.push(channel.id);
    return { response, channel };
  };

  it("creates a channel with its creator as the only member", async () => {
    const { response, channel } = await create(`test-create-${Date.now()}`);

    expect(response.status).toBe(201);
    expect(channel.memberCount).toBe(1);

    const members = await db().query<{ user_id: string }>(
      `SELECT user_id FROM channel_members WHERE channel_id = $1`,
      [channel.id],
    );
    expect(members.rows.map((row) => row.user_id)).toEqual([owner.userId]);
  });

  it("rejects a duplicate name", async () => {
    const name = `test-dupe-${Date.now()}`;
    await create(name);
    const { response } = await create(name);
    expect(response.status).toBe(409);
  });

  it("rejects a name outside the grammar", async () => {
    const response = await owner.fetch("/channels", {
      method: "POST",
      body: JSON.stringify({ name: "Not A Valid Name!" }),
    });
    expect(response.status).toBe(400);
  });

  it("adds members and keeps member_count in step", async () => {
    const { channel } = await create(`test-members-${Date.now()}`);

    const response = await owner.fetch(`/channels/${channel.id}/members`, {
      method: "POST",
      body: JSON.stringify({ userIds: [member.userId, "u_alice"] }),
    });
    expect(response.status).toBe(200);

    const { added } = (await response.json()) as { added: string[] };
    expect(added).toHaveLength(2);

    const row = await db().query<{ member_count: number; actual: string }>(
      `SELECT c.member_count,
              (SELECT count(*)::text FROM channel_members cm WHERE cm.channel_id = c.id) AS actual
       FROM channels c WHERE c.id = $1`,
      [channel.id],
    );
    // The denormalised counter must not drift from reality.
    expect(row.rows[0].member_count).toBe(Number(row.rows[0].actual));
    expect(row.rows[0].member_count).toBe(3);
  });

  it("is idempotent when adding someone twice", async () => {
    const { channel } = await create(`test-idem-${Date.now()}`);
    await owner.fetch(`/channels/${channel.id}/members`, {
      method: "POST",
      body: JSON.stringify({ userIds: [member.userId] }),
    });
    const second = await owner.fetch(`/channels/${channel.id}/members`, {
      method: "POST",
      body: JSON.stringify({ userIds: [member.userId] }),
    });

    const { added } = (await second.json()) as { added: string[] };
    expect(added).toHaveLength(0);

    const row = await db().query<{ member_count: number }>(
      `SELECT member_count FROM channels WHERE id = $1`,
      [channel.id],
    );
    expect(row.rows[0].member_count).toBe(2);
  });

  it("refuses to add members to a channel the caller is not in", async () => {
    const { channel } = await create(`test-outsider-${Date.now()}`, "private");

    const response = await member.fetch(`/channels/${channel.id}/members`, {
      method: "POST",
      body: JSON.stringify({ userIds: [member.userId] }),
    });
    // Otherwise anyone could join a private channel by adding themselves.
    expect(response.status).toBe(403);
  });

  it("lets a member leave", async () => {
    const { channel } = await create(`test-leave-${Date.now()}`);
    await owner.fetch(`/channels/${channel.id}/members`, {
      method: "POST",
      body: JSON.stringify({ userIds: [member.userId] }),
    });

    const response = await member.fetch(`/channels/${channel.id}/members/me`, { method: "DELETE" });
    expect(response.status).toBe(204);

    const row = await db().query(
      `SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2`,
      [channel.id, member.userId],
    );
    expect(row.rowCount).toBe(0);
  });

  it("archives a channel and records it", async () => {
    const { channel } = await create(`test-archive-${Date.now()}`);

    const response = await owner.fetch(`/channels/${channel.id}/archive`, {
      method: "PUT",
      body: JSON.stringify({ isArchived: true }),
    });
    expect(response.status).toBe(204);

    const row = await db().query<{ is_archived: boolean }>(
      `SELECT is_archived FROM channels WHERE id = $1`,
      [channel.id],
    );
    expect(row.rows[0].is_archived).toBe(true);

    const audit = await db().query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_log
       WHERE action = 'channel.archived' AND target = $1`,
      [`#${channel.name}`],
    );
    expect(Number(audit.rows[0].n)).toBe(1);
  });

  // The per-channel assertions above only cover channels the API created. The
  // seed used to write the fixture's decorative memberCount straight into the
  // column, so #general claimed 428 members in a 58-person workspace — a number
  // the UI showed and the "Add people" dialog then incremented off.
  it("has no channel whose member_count disagrees with its memberships", async () => {
    const { rows } = await db().query<{ name: string; member_count: number; actual: string }>(
      `SELECT c.name, c.member_count,
              (SELECT count(*)::text FROM channel_members cm WHERE cm.channel_id = c.id) AS actual
       FROM channels c
       WHERE c.member_count <> (SELECT count(*) FROM channel_members cm WHERE cm.channel_id = c.id)`,
    );
    expect(rows).toEqual([]);
  });

  it("has no channel claiming more members than the workspace has users", async () => {
    const { rows } = await db().query<{ name: string; member_count: number }>(
      `SELECT c.name, c.member_count FROM channels c
       WHERE c.member_count > (SELECT count(*) FROM users u WHERE u.workspace_id = c.workspace_id)`,
    );
    expect(rows).toEqual([]);
  });

  it("refuses to archive a direct message", async () => {
    const response = await owner.fetch(`/channels/dm_alice/archive`, {
      method: "PUT",
      body: JSON.stringify({ isArchived: true }),
    });
    expect(response.status).toBe(409);
  });
});
