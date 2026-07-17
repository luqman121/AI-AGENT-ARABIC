import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { migrateDatabase } from "../src/migrate.js";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

describe("database migrations", () => {
  let container: StartedPostgreSqlContainer;
  let sql: postgres.Sql;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17.10-alpine3.23").start();
    sql = postgres(container.getConnectionUri(), { max: 1 });
    await migrateDatabase(container.getConnectionUri(), migrationsFolder);
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await container?.stop();
  });

  it("applies the complete schema to a clean PostgreSQL 17 database", async () => {
    const tables = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `;

    expect(tables.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "accounts",
        "audit_logs",
        "conversation_messages",
        "conversations",
        "idempotency_keys",
        "projects",
        "sessions",
        "users",
        "verification_tokens",
        "workspace_members",
        "workspaces",
      ]),
    );

    const extensions = await sql<{ extname: string }[]>`
      select extname from pg_extension where extname = 'pg_trgm'
    `;
    expect(extensions).toEqual([{ extname: "pg_trgm" }]);
  });

  it("is idempotent on an existing database and preserves durable rows", async () => {
    const userId = "10000000-0000-4000-8000-000000000001";
    const workspaceId = "20000000-0000-4000-8000-000000000001";
    const projectId = "30000000-0000-4000-8000-000000000001";

    await sql`insert into users (id, email) values (${userId}, 'owner@example.test')`;
    await sql`
      insert into workspaces (id, owner_user_id, name)
      values (${workspaceId}, ${userId}, 'مساحة الاختبار')
    `;
    await sql`
      insert into workspace_members (workspace_id, user_id, role)
      values (${workspaceId}, ${userId}, 'owner')
    `;
    await sql`
      insert into projects (id, workspace_id, created_by_user_id, title)
      values (${projectId}, ${workspaceId}, ${userId}, 'موقع المقهى')
    `;

    await migrateDatabase(container.getConnectionUri(), migrationsFolder);

    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count from projects where id = ${projectId}
    `;
    expect(rows[0]?.count).toBe(1);
  });

  it("rejects cross-workspace conversation linkage", async () => {
    const secondUserId = "10000000-0000-4000-8000-000000000002";
    const secondWorkspaceId = "20000000-0000-4000-8000-000000000002";
    const firstProjectId = "30000000-0000-4000-8000-000000000001";

    await sql`insert into users (id, email) values (${secondUserId}, 'other@example.test')`;
    await sql`
      insert into workspaces (id, owner_user_id, name)
      values (${secondWorkspaceId}, ${secondUserId}, 'مساحة أخرى')
    `;

    await expect(
      sql`
        insert into conversations (workspace_id, project_id)
        values (${secondWorkspaceId}, ${firstProjectId})
      `,
    ).rejects.toMatchObject({ code: "23503" });
  });
});
