import { NextResponse } from "next/server";

import { getDatabaseHandle } from "../../../src/server/db";
import { getWebLogger } from "../../../src/server/logger";
import { checkWebReadiness } from "../../../src/server/readiness";
import { getRedis } from "../../../src/server/redis";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await checkWebReadiness({
    database: () => getDatabaseHandle().ping(),
    redis: async () => {
      await getRedis().ping();
    },
  });

  if (!result.ready) getWebLogger().warn({ state: "unavailable" }, "web dependencies unavailable");

  return NextResponse.json(
    {
      service: "web",
      status: result.ready ? "ready" : "unavailable",
    },
    {
      headers: { "Cache-Control": "no-store" },
      status: result.ready ? 200 : 503,
    },
  );
}
