import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDatabaseClient } from "@wakil/db/client";
import { migrateDatabase } from "@wakil/db/migrate";
import { conversations, projects, runs, users, workspaces } from "@wakil/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";

import { appendRunEvent } from "./events.js";

let container: StartedPostgreSqlContainer | undefined;
let handle: ReturnType<typeof createDatabaseClient>;

const ids = {
  user: "10000000-0000-4000-8000-000000000001",
  workspace: "20000000-0000-4000-8000-000000000001",
  project: "30000000-0000-4000-8000-000000000001",
  conversation: "40000000-0000-4000-8000-000000000001",
  run: "50000000-0000-4000-8000-000000000001",
};

beforeAll(async () => {
  const externalDatabaseUrl = process.env.TEST_DATABASE_URL;
  const connectionUri = externalDatabaseUrl
    ? externalDatabaseUrl
    : await new PostgreSqlContainer("postgres:17.10-alpine3.23").start().then((started) => {
        container = started;
        return started.getConnectionUri();
      });
  await migrateDatabase(connectionUri);
  handle = createDatabaseClient(connectionUri);
  const db = handle.db;
  await db.insert(users).values({ id: ids.user, email: "o@example.test" });
  await db.insert(workspaces).values({ id: ids.workspace, name: "W", ownerUserId: ids.user });
  await db
    .insert(projects)
    .values({ id: ids.project, workspaceId: ids.workspace, createdByUserId: ids.user, title: "P" });
  await db
    .insert(conversations)
    .values({ id: ids.conversation, workspaceId: ids.workspace, projectId: ids.project });
  await db.insert(runs).values({
    id: ids.run,
    workspaceId: ids.workspace,
    projectId: ids.project,
    conversationId: ids.conversation,
    createdByUserId: ids.user,
  });
}, 120_000);

afterAll(async () => {
  await handle?.close();
  await container?.stop();
});

it("assigns monotonic per-run seq values", async () => {
  const first = await handle.db.transaction((tx) =>
    appendRunEvent(tx, { runId: ids.run, workspaceId: ids.workspace, type: "run.started" }),
  );
  const second = await handle.db.transaction((tx) =>
    appendRunEvent(tx, {
      runId: ids.run,
      workspaceId: ids.workspace,
      type: "run.step",
      stepKey: "finalize",
      stepIndex: 0,
    }),
  );
  expect(first.seq).toBe(1);
  expect(second.seq).toBe(2);
});
