import { createDatabaseClient } from "@wakil/db/client";

import { getWebEnv } from "../env";

type DatabaseHandle = ReturnType<typeof createDatabaseClient>;

const globalScope = globalThis as typeof globalThis & {
  __wakilDb?: DatabaseHandle;
};

/** Lazy singleton PostgreSQL client, reused across dev hot reloads. */
export function getDatabaseHandle(): DatabaseHandle {
  globalScope.__wakilDb ??= createDatabaseClient(getWebEnv().DATABASE_URL);
  return globalScope.__wakilDb;
}

export function getDatabase(): DatabaseHandle["db"] {
  return getDatabaseHandle().db;
}
