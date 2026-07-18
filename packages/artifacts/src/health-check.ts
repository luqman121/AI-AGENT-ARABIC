import { z } from "zod";

import { objectStorageEndpointKind, S3ArtifactStore, StorageHealthCheckError } from "./index.js";

const healthEnvSchema = z.object({
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ENDPOINT: z.url(),
  S3_FORCE_PATH_STYLE: z.literal("true"),
  S3_REGION: z.literal("auto"),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
});

function issueNames(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => String(issue.path[0] ?? "environment")))].sort();
}

async function main(): Promise<void> {
  const result = healthEnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      `Invalid storage environment variables: ${issueNames(result.error).join(", ")}`,
    );
  }
  const storageKind = objectStorageEndpointKind(result.data.S3_ENDPOINT);
  if (!storageKind) {
    throw new Error("Invalid storage environment variables: S3_ENDPOINT");
  }
  const store = new S3ArtifactStore({
    accessKeyId: result.data.S3_ACCESS_KEY_ID,
    bucket: result.data.S3_BUCKET,
    endpoint: result.data.S3_ENDPOINT,
    forcePathStyle: true,
    region: result.data.S3_REGION,
    secretAccessKey: result.data.S3_SECRET_ACCESS_KEY,
  });
  const resultSummary = await store.checkLifecycle();
  for (const [check, passed] of Object.entries(resultSummary)) {
    process.stdout.write(`${check}: ${passed ? "passed" : "failed"}\n`);
  }
}

main().catch((error: unknown) => {
  if (
    error instanceof Error &&
    error.message.startsWith("Invalid storage environment variables:")
  ) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (error instanceof StorageHealthCheckError) {
    process.stderr.write(`Object storage health check failed during ${error.phase}.\n`);
    process.exitCode = 1;
    return;
  }
  const name = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(`Object storage health check failed (${name}).\n`);
  process.exitCode = 1;
});
