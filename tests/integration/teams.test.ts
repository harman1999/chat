import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

/**
 * A team is a group of people with channels of their own. Access still comes
 * from channel membership, so the tests that matter most are the ones showing
 * team membership really does put people in, and take them out of, the team's
 * channels — and that none of it reaches across workspaces.
 *
 * Everything happens in teams and channels the suite creates and removes.
 */
describe("teams", () => {
  const tag = Date.now().toString(36);
  const otherWs = `ws_team_${tag}`;
  let owner: Client;
  let admin: Client;
  let member: Client;
  const teams: string[] = [];
  const channels: string[] = [];

  const call = (client: Client, path: string, method = "GET", body?: unknown) =>
    client.fetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const makeTeam = async (name: string, client = owner) => {
    const response = await call(client, "/teams", "POST", { name });
    const team = (await response.clone().json()) as { id: string };
    if (team.id) teams.push(team.id);
    return { response, id: team.id };
  };
  const makeChannel = async (name: string, teamId?: string) => {
    const response = await call(owner, "/channels", "POST", { name, teamId });
    const channel = (await response.clone().json()) as { id: string };
    if (channel.id) channels.push(channel.id);
    return { response, id: channel.id };
  };
  const inChannel = async (channelId: string, userId: string) =>
    ((await db().query(`SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2`, [channelId, userId])).rowCount ?? 0) > 0;

  beforeAll(async () => {
    await assertServerRunning();
    owner = await signIn(ACCOUNTS.owner);
    admin = await signIn(ACCOUNTS.admin);
    member = await signIn(ACCOUNTS.member);
  });

  afterAll(async () => {
    await db().query(`DELETE FROM channels WHERE id = ANY($1::text[])`, [channels]);
    await db().query(`DELETE FROM teams WHERE id = ANY($1::text[])`, [teams]);
    await db().query(`DELETE FROM workspaces WHERE id = $1`, [otherWs]); // cascades
    await closeDb();
  });

  describe("who may manage them", () => {
    it("lets everyone see the list, marking their own teams", async () => {
      const { id } = await makeTeam(`Visible ${tag}`);
      await call(owner, `/teams/${id}/members`, "POST", { userIds: ["u_bob"] });

      const list = (await (await call(member, "/teams")).json()) as { id: string; isMember: boolean }[];
      expect(list.find((team) => team.id === id)?.isMember).toBe(true);
      const alices = (await (await call(admin, "/teams")).json()) as { id: string; isMember: boolean }[];
      expect(alices.find((team) => team.id === id)?.isMember).toBe(false);
    });

    it("refuses a member every change", async () => {
      const { id } = await makeTeam(`Locked ${tag}`);
      const channel = await makeChannel(`locked-${tag}`);
      for (const [path, method, body] of [
        ["/teams", "POST", { name: `Nope ${tag}` }],
        [`/teams/${id}`, "PATCH", { name: `Renamed ${tag}` }],
        [`/teams/${id}`, "DELETE", undefined],
        [`/teams/${id}/members`, "POST", { userIds: ["u_bob"] }],
        [`/teams/${id}/members/u_alice`, "DELETE", undefined],
        [`/teams/${id}/channels/${channel.id}`, "PUT", undefined],
        [`/teams/${id}/channels/${channel.id}`, "DELETE", undefined],
      ] as [string, string, unknown][]) {
        expect((await call(member, path, method, body)).status, `${method} ${path}`).toBe(403);
      }
    });

    it("lets an administrator, not only the owner, manage teams", async () => {
      const { response, id } = await makeTeam(`By admin ${tag}`, admin);
      expect(response.status).toBe(201);
      expect((await call(admin, `/teams/${id}`, "DELETE")).status).toBe(204);
    });
  });

  describe("creating and naming", () => {
    it("creates a team and refuses the same name in any case", async () => {
      const { response } = await makeTeam(`Naming ${tag}`);
      expect(response.status).toBe(201);
      const created = (await response.json()) as { memberCount: number; channelCount: number; isMember: boolean };
      expect(created).toMatchObject({ memberCount: 0, channelCount: 0, isMember: false });

      expect((await makeTeam(`NAMING ${tag}`)).response.status).toBe(409);
      expect((await call(owner, "/teams", "POST", { name: "   " })).status).toBe(400);
    });

    it("renames, and refuses a rename onto another team's name", async () => {
      const a = await makeTeam(`Alpha ${tag}`);
      const b = await makeTeam(`Beta ${tag}`);
      expect((await call(owner, `/teams/${a.id}`, "PATCH", { name: `Gamma ${tag}` })).status).toBe(204);
      expect((await call(owner, `/teams/${b.id}`, "PATCH", { name: `gamma ${tag}` })).status).toBe(409);
      expect((await call(owner, `/teams/${b.id}`, "PATCH", {})).status).toBe(400);
    });
  });

  describe("people and channels", () => {
    let teamId = "";
    let firstChannel = "";

    beforeAll(async () => {
      teamId = (await makeTeam(`Core ${tag}`)).id;
      await call(owner, `/teams/${teamId}/members`, "POST", { userIds: ["u_bob"] });
      firstChannel = (await makeChannel(`core-a-${tag}`, teamId)).id;
    });

    it("puts a new channel's team in it", async () => {
      const channel = (await (await call(owner, `/channels/${firstChannel}`)).json()) as { teamId: string };
      expect(channel.teamId).toBe(teamId);
      expect(await inChannel(firstChannel, "u_bob")).toBe(true);
    });

    it("only lets a team manager create a channel inside a team", async () => {
      const response = await call(member, "/channels", "POST", { name: `sneak-${tag}`, teamId });
      expect(response.status).toBe(403);
    });

    it("adds someone to the team's channels when they join it, once", async () => {
      expect(await inChannel(firstChannel, "u_alice")).toBe(false);
      const first = await call(owner, `/teams/${teamId}/members`, "POST", { userIds: ["u_alice"] });
      expect(((await first.json()) as { added: string[] }).added).toEqual(["u_alice"]);
      expect(await inChannel(firstChannel, "u_alice")).toBe(true);

      const again = await call(owner, `/teams/${teamId}/members`, "POST", { userIds: ["u_alice"] });
      expect(((await again.json()) as { added: string[] }).added).toEqual([]);
    });

    it("does not add a bot, or someone who does not exist", async () => {
      const response = await call(owner, `/teams/${teamId}/members`, "POST", { userIds: ["u_deploybot", "u_nobody"] });
      expect(((await response.json()) as { added: string[] }).added).toEqual([]);
    });

    it("lists the team's people and channels", async () => {
      const people = (await (await call(member, `/teams/${teamId}/members`)).json()) as { id: string }[];
      expect(people.map((person) => person.id).sort()).toEqual(["u_alice", "u_bob"]);
      const list = (await (await call(member, `/teams/${teamId}/channels`)).json()) as { id: string }[];
      expect(list.map((channel) => channel.id)).toEqual([firstChannel]);
    });

    it("takes someone out of the team's channels when they leave it", async () => {
      expect((await call(owner, `/teams/${teamId}/members/u_bob`, "DELETE")).status).toBe(204);
      expect(await inChannel(firstChannel, "u_bob")).toBe(false);
      expect(await inChannel(firstChannel, "u_alice")).toBe(true);
      expect((await call(owner, `/teams/${teamId}/members/u_bob`, "DELETE")).status).toBe(404);
    });

    it("gives an existing channel the team's people when it is added, and keeps them when removed", async () => {
      const existing = (await makeChannel(`plain-${tag}`)).id;
      expect(await inChannel(existing, "u_alice")).toBe(false);

      expect((await call(owner, `/teams/${teamId}/channels/${existing}`, "PUT")).status).toBe(204);
      expect(await inChannel(existing, "u_alice")).toBe(true);
      const attached = (await (await call(owner, `/channels/${existing}`)).json()) as { teamId: string };
      expect(attached.teamId).toBe(teamId);

      expect((await call(owner, `/teams/${teamId}/channels/${existing}`, "DELETE")).status).toBe(204);
      const detached = (await (await call(owner, `/channels/${existing}`)).json()) as { teamId: string | null };
      expect(detached.teamId).toBeNull();
      expect(await inChannel(existing, "u_alice")).toBe(true);
      expect((await call(owner, `/teams/${teamId}/channels/${existing}`, "DELETE")).status).toBe(404);
    });

    it("leaves the channels and everyone in them when the team is deleted", async () => {
      expect((await call(owner, `/teams/${teamId}`, "DELETE")).status).toBe(204);
      expect((await call(owner, `/teams/${teamId}`)).status).toBe(404);
      const channel = (await (await call(owner, `/channels/${firstChannel}`)).json()) as { teamId: string | null };
      expect(channel.teamId).toBeNull();
      expect(await inChannel(firstChannel, "u_alice")).toBe(true);
    });
  });

  describe("across workspaces", () => {
    let foreignTeam = "";
    let foreignChannel = "";
    const foreignUser = `u_team_x_${tag}`;

    beforeAll(async () => {
      await db().query(`INSERT INTO workspaces (id, name, slug, initials) VALUES ($1,$2,$3,'TX')`, [
        otherWs, `Team Test ${tag}`, `team-test-${tag}`,
      ]);
      await db().query(
        `INSERT INTO users (id, workspace_id, username, display_name, full_name, email) VALUES ($1,$2,'x','X','X',$3)`,
        [foreignUser, otherWs, `${foreignUser}@example.com`],
      );
      foreignTeam = `team_x_${tag}`;
      foreignChannel = `ch_team_x_${tag}`;
      await db().query(`INSERT INTO teams (id, workspace_id, name) VALUES ($1,$2,'Elsewhere')`, [foreignTeam, otherWs]);
      await db().query(`INSERT INTO channels (id, workspace_id, kind, name) VALUES ($1,$2,'public','elsewhere')`, [
        foreignChannel, otherWs,
      ]);
    });

    it("cannot see, change or fill another workspace's team", async () => {
      expect((await call(owner, `/teams/${foreignTeam}`)).status).toBe(404);
      expect((await call(owner, `/teams/${foreignTeam}`, "PATCH", { name: "Taken" })).status).toBe(404);
      expect((await call(owner, `/teams/${foreignTeam}`, "DELETE")).status).toBe(404);
      expect((await call(owner, `/teams/${foreignTeam}/members`, "POST", { userIds: ["u_bob"] })).status).toBe(404);
      expect((await call(owner, `/teams/${foreignTeam}/members`)).status).toBe(404);
      const list = (await (await call(owner, "/teams")).json()) as { id: string }[];
      expect(list.some((team) => team.id === foreignTeam)).toBe(false);
      const untouched = await db().query(`SELECT 1 FROM teams WHERE id = $1`, [foreignTeam]);
      expect(untouched.rowCount).toBe(1);
    });

    it("cannot put another workspace's person or channel into its own team", async () => {
      const { id } = await makeTeam(`Mine ${tag}`);
      const added = await call(owner, `/teams/${id}/members`, "POST", { userIds: [foreignUser] });
      expect(((await added.json()) as { added: string[] }).added).toEqual([]);
      expect((await call(owner, `/teams/${id}/channels/${foreignChannel}`, "PUT")).status).toBe(404);
      const still = await db().query(`SELECT team_id FROM channels WHERE id = $1`, [foreignChannel]);
      expect(still.rows[0].team_id).toBeNull();
    });

    it("cannot create a channel in another workspace's team", async () => {
      expect((await call(owner, "/channels", "POST", { name: `nope-${tag}`, teamId: foreignTeam })).status).toBe(404);
    });
  });
});
