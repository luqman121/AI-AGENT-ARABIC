import { canAccessAdmin } from "@wakil/shared";
import { NextResponse } from "next/server";

import { checkSystemHealth } from "../../../../src/server/admin/system";
import { getSessionAccount } from "../../../../src/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  // Server-side RBAC: a generic 403 that never reveals whether admin exists.
  const account = await getSessionAccount();
  if (!account || account.status === "suspended" || !canAccessAdmin(account.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const health = await checkSystemHealth();
  return NextResponse.json(health, { headers: { "Cache-Control": "no-store" } });
}
