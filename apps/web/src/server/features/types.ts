import type { createDatabaseClient } from "@wakil/db/client";

export type Database = ReturnType<typeof createDatabaseClient>["db"];

/** The drizzle transaction client passed to nested service helpers. */
export type TransactionClient = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Session-derived actor identity; never constructed from client input. */
export type ServiceContext = {
  userId: string;
  workspaceId: string;
};
