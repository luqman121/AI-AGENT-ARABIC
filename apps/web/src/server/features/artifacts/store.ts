import { S3ArtifactStore } from "@wakil/artifacts";

import { getWebEnv } from "../../../env";

let store: S3ArtifactStore | undefined;

export function getArtifactStore(): S3ArtifactStore {
  const env = getWebEnv();
  store ??= new S3ArtifactStore({
    accessKeyId: env.S3_ACCESS_KEY_ID,
    bucket: env.S3_BUCKET,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    region: env.S3_REGION,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  });
  return store;
}
