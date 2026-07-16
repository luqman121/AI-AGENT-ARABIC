import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

export function createDatabaseClient(connectionString: string) {
  const client = postgres(connectionString, {
    connect_timeout: 5,
    idle_timeout: 20,
    max: 5,
  });
  const db = drizzle({ client, schema });

  return {
    close: async (): Promise<void> => client.end({ timeout: 5 }),
    db,
    ping: async (): Promise<void> => {
      await client`select 1`;
    },
  };
}
