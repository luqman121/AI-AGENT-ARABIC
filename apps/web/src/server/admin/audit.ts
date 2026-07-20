import { adminAuditLogs } from "@wakil/db/schema";
import { redactAuditData, type PlatformRole } from "@wakil/shared";
import { headers } from "next/headers";

import type { Database, TransactionClient } from "../features/types";

export type AdminAuditEntry = {
  actorUserId: string;
  actorRole: PlatformRole;
  action: string;
  targetType: string;
  targetId?: string | null | undefined;
  before?: Record<string, unknown> | null | undefined;
  after?: Record<string, unknown> | null | undefined;
  reason?: string | null | undefined;
  requestId?: string | null | undefined;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
};

/** Request-derived, safely-bounded metadata for the audit ledger. */
export type AdminRequestMeta = {
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

const MAX_UA_LENGTH = 500;

/**
 * Reads safe correlation metadata from the incoming request. The client IP is
 * taken from the trusted proxy header; the value is stored only for the audit
 * ledger and never exposed to other tenants.
 */
export async function getAdminRequestMeta(): Promise<AdminRequestMeta> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const ipAddress = forwardedFor ? (forwardedFor.split(",")[0]?.trim() ?? null) : null;
  const userAgent = headerList.get("user-agent");
  const requestId = headerList.get("x-request-id") ?? headerList.get("x-vercel-id") ?? null;
  return {
    ipAddress: ipAddress && ipAddress.length <= 100 ? ipAddress : null,
    requestId: requestId && requestId.length <= 200 ? requestId : null,
    userAgent: userAgent ? userAgent.slice(0, MAX_UA_LENGTH) : null,
  };
}

/**
 * Appends one immutable admin audit row. Before/after snapshots are redacted so
 * no password hash, token, or secret can ever reach the ledger. Runs inside the
 * same transaction as the mutation it records whenever a `tx` is passed.
 */
export async function writeAdminAudit(
  tx: TransactionClient | Database,
  entry: AdminAuditEntry,
): Promise<void> {
  await tx.insert(adminAuditLogs).values({
    action: entry.action,
    actorRole: entry.actorRole,
    actorUserId: entry.actorUserId,
    afterData: entry.after ? redactAuditData(entry.after) : null,
    beforeData: entry.before ? redactAuditData(entry.before) : null,
    ipAddress: entry.ipAddress ?? null,
    reason: entry.reason ?? null,
    requestId: entry.requestId ?? null,
    targetId: entry.targetId ?? null,
    targetType: entry.targetType,
    userAgent: entry.userAgent ?? null,
  });
}
