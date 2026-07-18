import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDatabaseClient } from "@wakil/db/client";
import { migrateDatabase } from "@wakil/db/migrate";
import {
  conversationMessages,
  conversations,
  projects,
  runEvents,
  runs,
  users,
  workspaces,
} from "@wakil/db/schema";
import { asc, eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { afterAll, beforeAll, expect, it } from "vitest";

import { processRun } from "./processor.js";

const modelDeps = {
  adapter: {
    provider: "openrouter" as const,
    async *stream() {
      yield { text: "خطة موجزة\n1. جمع المحتوى\n", type: "text-delta" as const };
      yield { text: "2. مراجعة النتيجة", type: "text-delta" as const };
      yield { type: "usage" as const, usage: { inputTokens: 10, outputTokens: 8 } };
      yield { type: "completed" as const };
    },
  },
  limits: {
    deadlineMs: 1_000,
    inputCostMicrosPerMillionTokens: 1,
    maxAttempts: 1,
    maxCostMicros: 1_000,
    maxDeltaEvents: 10,
    maxOutputChars: 1_000,
    maxOutputTokens: 100,
    outputCostMicrosPerMillionTokens: 1,
  },
  model: "configured-model",
  modelConfigKey: "openrouter",
};

let container: StartedPostgreSqlContainer;
let handle: ReturnType<typeof createDatabaseClient>;
let redis: Redis;

const ids = {
  user: "10000000-0000-4000-8000-000000000002",
  workspace: "20000000-0000-4000-8000-000000000002",
  project: "30000000-0000-4000-8000-000000000002",
  conversation: "40000000-0000-4000-8000-000000000002",
};

async function seedRun(runId: string): Promise<void> {
  await handle.db.insert(runs).values({
    id: runId,
    workspaceId: ids.workspace,
    projectId: ids.project,
    conversationId: ids.conversation,
    createdByUserId: ids.user,
  });
  // The web transaction writes run.queued (seq 1); mirror it here.
  await handle.db
    .insert(runEvents)
    .values({ runId, workspaceId: ids.workspace, seq: 1, type: "run.queued", data: {} });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17.10-alpine3.23").start();
  await migrateDatabase(container.getConnectionUri());
  handle = createDatabaseClient(container.getConnectionUri());
  // A real Redis is not required for these assertions; use a throwaway that no-ops publish.
  redis = new Redis({ lazyConnect: true, maxRetriesPerRequest: 1 });
  redis.publish = (async () => 0) as unknown as Redis["publish"];
  const db = handle.db;
  await db.insert(users).values({ id: ids.user, email: "p@example.test" });
  await db.insert(workspaces).values({ id: ids.workspace, name: "W", ownerUserId: ids.user });
  await db
    .insert(projects)
    .values({ id: ids.project, workspaceId: ids.workspace, createdByUserId: ids.user, title: "P" });
  await db
    .insert(conversations)
    .values({ id: ids.conversation, workspaceId: ids.workspace, projectId: ids.project });
  await db.insert(conversationMessages).values({
    conversationId: ids.conversation,
    workspaceId: ids.workspace,
    role: "user",
    content: "أريد موقعًا بسيطًا",
  });
}, 120_000);

afterAll(async () => {
  await handle?.close();
  redis?.disconnect();
  await container?.stop();
});

it("runs to succeeded and emits ordered events", async () => {
  const runId = "50000000-0000-4000-8000-000000000010";
  await seedRun(runId);

  const status = await processRun(
    { db: handle.db, redis, ...modelDeps },
    {
      runId,
      workspaceId: ids.workspace,
      projectId: ids.project,
    },
  );
  expect(status).toBe("succeeded");

  const events = await handle.db
    .select({ seq: runEvents.seq, type: runEvents.type })
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .orderBy(asc(runEvents.seq));
  expect(events.map((e) => e.type)).toEqual([
    "run.queued",
    "run.started",
    "agent.started",
    "assistant.delta",
    "assistant.delta",
    "assistant.completed",
    "run.succeeded",
  ]);

  const run = (await handle.db.select().from(runs).where(eq(runs.id, runId)))[0];
  expect(run?.status).toBe("succeeded");
  expect(run?.stepCount).toBe(4);
  expect(run?.assistantMessageId).not.toBeNull();
  expect(run?.modelConfigKey).toBe("openrouter");
  expect(run?.finishedAt).not.toBeNull();

  const assistant = await handle.db
    .select({ content: conversationMessages.content, role: conversationMessages.role })
    .from(conversationMessages)
    .where(eq(conversationMessages.id, run?.assistantMessageId ?? ""));
  expect(assistant).toEqual([
    { content: "خطة موجزة\n1. جمع المحتوى\n2. مراجعة النتيجة", role: "assistant" },
  ]);
});

it("cancels cooperatively when cancel_requested_at is set", async () => {
  const runId = "50000000-0000-4000-8000-000000000011";
  await seedRun(runId);
  await handle.db.update(runs).set({ cancelRequestedAt: new Date() }).where(eq(runs.id, runId));

  const status = await processRun(
    { db: handle.db, redis, ...modelDeps },
    {
      runId,
      workspaceId: ids.workspace,
      projectId: ids.project,
    },
  );
  expect(status).toBe("cancelled");
  const run = (await handle.db.select().from(runs).where(eq(runs.id, runId)))[0];
  expect(run?.status).toBe("cancelled");
});
