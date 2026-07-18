import { S3ArtifactStore } from "@wakil/artifacts";
import { createDaytonaSandboxAdapter, type SandboxAdapter } from "@wakil/sandbox";

import type { WorkerEnv } from "./env.js";

export function createArtifactStore(env: WorkerEnv): S3ArtifactStore {
  return new S3ArtifactStore({
    accessKeyId: env.S3_ACCESS_KEY_ID,
    bucket: env.S3_BUCKET,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    region: env.S3_REGION,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  });
}

export function createSandbox(env: WorkerEnv): SandboxAdapter | null {
  if (!env.DAYTONA_API_KEY) return null;
  return createDaytonaSandboxAdapter({
    apiKey: env.DAYTONA_API_KEY,
    ...(env.DAYTONA_API_URL ? { apiUrl: env.DAYTONA_API_URL } : {}),
    ...(env.DAYTONA_TARGET ? { target: env.DAYTONA_TARGET } : {}),
  });
}
