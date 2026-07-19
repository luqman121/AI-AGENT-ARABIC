import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { zipSync, strToU8 } from "fflate";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

const objectKeyPartSchema = z.uuid();

export type ArtifactBundle = {
  preview: ArtifactBytes;
  zip: ArtifactBytes;
};

export type ArtifactBytes = {
  bytes: Uint8Array;
  checksumSha256: string;
  mediaType: string;
  sizeBytes: number;
};

export type ArtifactStoreConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  forcePathStyle: boolean;
  region: string;
  secretAccessKey: string;
};

export type ArtifactObjectKeys = {
  previewKey: string;
  zipKey: string;
};

export type ObjectStorageEndpointKind = "local" | "r2";

export type StorageHealthResult = {
  cleanup: true;
  delete: true;
  download: true;
  exists: true;
  privateAccess: true;
  read: true;
  signedUrl: true;
  upload: true;
};

export type StorageHealthPhase =
  | "bucket"
  | "cleanup"
  | "delete"
  | "download"
  | "exists"
  | "private-access"
  | "read"
  | "signed-url"
  | "upload";

export class StorageHealthCheckError extends Error {
  constructor(
    readonly phase: StorageHealthPhase,
    options?: ErrorOptions,
  ) {
    super(`Object storage validation failed during ${phase}`, options);
    this.name = "StorageHealthCheckError";
  }
}

/**
 * Wakil production storage uses the Cloudflare R2 S3 API. Loopback endpoints
 * remain supported for the private MinIO development and test service.
 */
export function objectStorageEndpointKind(value: string): ObjectStorageEndpointKind | null {
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      return null;
    }
    if (
      url.protocol === "https:" &&
      url.hostname.endsWith(".r2.cloudflarestorage.com") &&
      url.hostname !== "r2.cloudflarestorage.com"
    ) {
      return "r2";
    }
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)
    ) {
      return "local";
    }
    return null;
  } catch {
    return null;
  }
}

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { $metadata?: { httpStatusCode?: number }; name?: string };
  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound"
  );
}

export function buildStaticSiteBundle(html: string): ArtifactBundle {
  const previewBytes = Buffer.from(html, "utf8");
  const zipBytes = zipSync({ "index.html": strToU8(html) }, { level: 6 });
  return {
    preview: {
      bytes: previewBytes,
      checksumSha256: checksum(previewBytes),
      mediaType: "text/html; charset=utf-8",
      sizeBytes: previewBytes.byteLength,
    },
    zip: {
      bytes: zipBytes,
      checksumSha256: checksum(zipBytes),
      mediaType: "application/zip",
      sizeBytes: zipBytes.byteLength,
    },
  };
}

export function artifactObjectKeys(input: {
  artifactId: string;
  projectId: string;
  runId: string;
  workspaceId: string;
}): ArtifactObjectKeys {
  const workspaceId = objectKeyPartSchema.parse(input.workspaceId);
  const projectId = objectKeyPartSchema.parse(input.projectId);
  const runId = objectKeyPartSchema.parse(input.runId);
  const artifactId = objectKeyPartSchema.parse(input.artifactId);
  const prefix = `workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/${artifactId}`;
  return { previewKey: `${prefix}/preview.html`, zipKey: `${prefix}/artifact.zip` };
}

export class S3ArtifactStore {
  readonly #bucket: string;
  readonly #client: S3Client;

  constructor(config: ArtifactStoreConfig) {
    if (!objectStorageEndpointKind(config.endpoint)) {
      throw new Error("Invalid object storage endpoint");
    }
    if (config.region !== "auto") {
      throw new Error("Object storage region must be auto");
    }
    if (!config.forcePathStyle) {
      throw new Error("Object storage path-style addressing is required");
    }
    const clientConfig: S3ClientConfig = {
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      region: config.region,
    };
    this.#bucket = config.bucket;
    this.#client = new S3Client(clientConfig);
  }

  async uploadBundle(keys: ArtifactObjectKeys, bundle: ArtifactBundle): Promise<void> {
    await this.#put(keys.previewKey, bundle.preview, "inline");
    await this.#put(keys.zipKey, bundle.zip, 'attachment; filename="wakil-site.zip"');
  }

  /** Uploads a private non-artifact input such as a user file or voice note. */
  async uploadPrivateObject(input: {
    bytes: Uint8Array;
    checksumSha256: string;
    key: string;
    mediaType: string;
    fileName: string;
  }): Promise<void> {
    await this.#put(
      input.key,
      {
        bytes: input.bytes,
        checksumSha256: input.checksumSha256,
        mediaType: input.mediaType,
        sizeBytes: input.bytes.byteLength,
      },
      `attachment; filename="${input.fileName.replace(/["\\\r\n]/g, "_")}"`,
    );
  }

  /** Removes a private input when its database record cannot be committed. */
  async deletePrivateObject(key: string): Promise<void> {
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }));
  }

  async signPrivateObject(
    key: string,
    response: { fileName: string; mediaType: string },
    expiresInSeconds = 300,
  ): Promise<string> {
    return this.#signObject(key, expiresInSeconds, {
      disposition: `attachment; filename="${response.fileName.replace(/["\\\r\n]/g, "_")}"`,
      mediaType: response.mediaType,
    });
  }

  /** Read-only credential, endpoint, and bucket reachability check. */
  async checkHealth(): Promise<void> {
    await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }));
  }

  /**
   * Exercises the private object lifecycle with a small temporary object.
   * Cleanup and confirmed deletion run even when an intermediate validation fails.
   */
  async checkLifecycle(): Promise<StorageHealthResult> {
    const key = `health-check/${Date.now()}-${randomUUID()}.txt`;
    const bytes = Buffer.from(`wakil-storage-health:${randomUUID()}`, "utf8");
    const checksumSha256 = checksum(bytes);
    let uploaded = false;
    let deleted = false;
    let phase: StorageHealthPhase = "bucket";
    let failure: StorageHealthCheckError | undefined;
    let cleanupFailure: StorageHealthCheckError | undefined;
    let lifecycleResult: StorageHealthResult | undefined;

    try {
      await this.checkHealth();
      phase = "upload";
      await this.#client.send(
        new PutObjectCommand({
          Body: bytes,
          Bucket: this.#bucket,
          ContentDisposition: 'attachment; filename="wakil-storage-health.txt"',
          ContentLength: bytes.byteLength,
          ContentType: "text/plain; charset=utf-8",
          Key: key,
          Metadata: { sha256: checksumSha256 },
        }),
      );
      uploaded = true;

      phase = "exists";
      const head = await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
      if (
        head.ContentLength !== bytes.byteLength ||
        head.ContentType !== "text/plain; charset=utf-8" ||
        head.ContentDisposition !== 'attachment; filename="wakil-storage-health.txt"' ||
        head.Metadata?.sha256 !== checksumSha256
      ) {
        throw new Error("Object storage metadata validation failed");
      }

      phase = "read";
      const object = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
      const readBytes = await object.Body?.transformToByteArray();
      if (!readBytes || !Buffer.from(readBytes).equals(bytes)) {
        throw new Error("Object storage read validation failed");
      }

      phase = "signed-url";
      const signedUrl = await this.#signObject(key, 300, {
        disposition: 'attachment; filename="wakil-storage-health.txt"',
        mediaType: "text/plain; charset=utf-8",
      });
      const parsedSignedUrl = new URL(signedUrl);
      if (parsedSignedUrl.searchParams.get("X-Amz-Expires") !== "300") {
        throw new Error("Object storage signed URL expiry validation failed");
      }

      phase = "private-access";
      const unsignedUrl = new URL(signedUrl);
      unsignedUrl.search = "";
      const unsignedResponse = await fetch(unsignedUrl, { redirect: "manual" });
      if (![400, 401, 403, 404].includes(unsignedResponse.status)) {
        throw new Error("Object storage private access validation failed");
      }

      phase = "download";
      const downloadResponse = await fetch(signedUrl, { redirect: "error" });
      if (!downloadResponse.ok) {
        throw new Error("Object storage signed download failed");
      }
      if (
        downloadResponse.headers.get("content-type") !== "text/plain; charset=utf-8" ||
        downloadResponse.headers.get("content-disposition") !==
          'attachment; filename="wakil-storage-health.txt"'
      ) {
        throw new Error("Object storage signed download metadata validation failed");
      }
      const downloadedBytes = Buffer.from(await downloadResponse.arrayBuffer());
      if (!downloadedBytes.equals(bytes)) {
        throw new Error("Object storage downloaded bytes validation failed");
      }

      phase = "delete";
      await this.#deleteAndVerifyMissing(key);
      deleted = true;

      lifecycleResult = {
        cleanup: true,
        delete: true,
        download: true,
        exists: true,
        privateAccess: true,
        read: true,
        signedUrl: true,
        upload: true,
      };
    } catch (error) {
      failure =
        error instanceof StorageHealthCheckError
          ? error
          : new StorageHealthCheckError(phase, { cause: error });
    } finally {
      if (uploaded && !deleted) {
        try {
          await this.#deleteAndVerifyMissing(key);
        } catch (error) {
          cleanupFailure = new StorageHealthCheckError("cleanup", { cause: error });
        }
      }
    }

    if (cleanupFailure) throw cleanupFailure;
    if (failure) throw failure;
    if (!lifecycleResult) throw new StorageHealthCheckError("cleanup");
    return lifecycleResult;
  }

  async signPreview(key: string, expiresInSeconds = 300): Promise<string> {
    return this.#signObject(key, expiresInSeconds, {
      disposition: "inline",
      mediaType: "text/html; charset=utf-8",
    });
  }

  async signDownload(key: string, expiresInSeconds = 300): Promise<string> {
    return this.#signObject(key, expiresInSeconds, {
      disposition: 'attachment; filename="wakil-site.zip"',
      mediaType: "application/zip",
    });
  }

  async #signObject(
    key: string,
    expiresInSeconds: number,
    response: { disposition: string; mediaType: string },
  ): Promise<string> {
    return getSignedUrl(
      this.#client,
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        ResponseContentDisposition: response.disposition,
        ResponseContentType: response.mediaType,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async #put(key: string, artifact: ArtifactBytes, contentDisposition: string): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Body: artifact.bytes,
        Bucket: this.#bucket,
        ContentDisposition: contentDisposition,
        ContentLength: artifact.sizeBytes,
        ContentType: artifact.mediaType,
        Key: key,
        Metadata: { sha256: artifact.checksumSha256 },
      }),
    );
  }

  async #deleteAndVerifyMissing(key: string): Promise<void> {
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }));
    try {
      await this.#client.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: key }));
      throw new Error("Object storage deletion validation failed");
    } catch (error) {
      if (!isMissingObject(error)) throw error;
    }
  }
}
