import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDatabaseClient } from "@wakil/db/client";
import { migrateDatabase } from "@wakil/db";
import { users } from "@wakil/db/schema";
import { Redis } from "ioredis";
import { GenericContainer, type StartedTestContainer } from "testcontainers";

import { ensurePersonalWorkspace } from "../../src/server/auth/workspace";
import type { ServiceContext } from "../../src/server/features/types";

export type IntegrationHarness = {
  db: ReturnType<typeof createDatabaseClient>["db"];
  redis: Redis;
  createTenant: (email: string) => Promise<ServiceContext>;
  stop: () => Promise<void>;
};

/** Starts PostgreSQL 17 + Redis 7 containers and migrates the schema. */
export async function startHarness(): Promise<IntegrationHarness> {
  const [postgresContainer, redisContainer]: [StartedPostgreSqlContainer, StartedTestContainer] =
    await Promise.all([
      new PostgreSqlContainer("postgres:17.10-alpine3.23").start(),
      new GenericContainer("redis:7.4-alpine").withExposedPorts(6379).start(),
    ]);

  await migrateDatabase(postgresContainer.getConnectionUri());
  const handle = createDatabaseClient(postgresContainer.getConnectionUri());
  const redis = new Redis(redisContainer.getHost(), {
    maxRetriesPerRequest: 1,
    port: redisContainer.getMappedPort(6379),
  });

  return {
    createTenant: async (email: string) => {
      const user = (await handle.db.insert(users).values({ email }).returning({ id: users.id }))[0];
      if (!user) throw new Error("failed to insert test user");
      const workspaceId = await ensurePersonalWorkspace(handle.db, user.id);
      return { userId: user.id, workspaceId };
    },
    db: handle.db,
    redis,
    stop: async () => {
      redis.disconnect();
      await handle.close();
      await Promise.all([postgresContainer.stop(), redisContainer.stop()]);
    },
  };
}

export function key(seed: string): string {
  return seed.padEnd(16, "x").slice(0, 64);
}
