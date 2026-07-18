import { auditLogs } from "@wakil/db/schema";

import type { TransactionClient } from "../types";

/** Safe metadata only: flags, lengths, and codes — never prompts or content. */
export type SafeAuditMetadata = Record<string, boolean | number | string | null>;

export type AuditEntry = {
  workspaceId: string;
  actorUserId: string;
  action:
    | "project.created"
    | "project.renamed"
    | "project.archived"
    | "requirement.appended"
    | "run.cancelled"
    | "run.started"
    | "workspace.provisioned";
  targetType: "project" | "conversation" | "run" | "workspace";
  targetId: string | null;
  metadata?: SafeAuditMetadata;
};

const FORBIDDEN_METADATA_KEYS = new Set(["content", "request", "title", "prompt", "message"]);

export async function writeAuditLog(tx: TransactionClient, entry: AuditEntry): Promise<void> {
  const metadata = entry.metadata ?? {};
  for (const key of Object.keys(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) {
      throw new Error(`audit metadata key not allowed: ${key}`);
    }
  }
  await tx.insert(auditLogs).values({
    action: entry.action,
    actorUserId: entry.actorUserId,
    metadata,
    targetId: entry.targetId,
    targetType: entry.targetType,
    workspaceId: entry.workspaceId,
  });
}
