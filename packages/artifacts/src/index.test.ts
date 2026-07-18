import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it, vi } from "vitest";

import {
  artifactObjectKeys,
  buildStaticSiteBundle,
  objectStorageEndpointKind,
  S3ArtifactStore,
} from "./index.js";

describe("static site artifacts", () => {
  it("creates a checksummed preview and valid ZIP", () => {
    const html = '<!doctype html><html lang="ar" dir="rtl"><title>وكيل</title></html>';
    const bundle = buildStaticSiteBundle(html);
    expect(bundle.preview.sizeBytes).toBe(Buffer.byteLength(html));
    expect(bundle.preview.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    const files = unzipSync(bundle.zip.bytes);
    expect(strFromU8(files["index.html"]!)).toBe(html);
  });

  it("creates tenant and run scoped immutable keys", () => {
    const keys = artifactObjectKeys({
      artifactId: "44444444-4444-4444-8444-444444444444",
      projectId: "22222222-2222-4222-8222-222222222222",
      runId: "33333333-3333-4333-8333-333333333333",
      workspaceId: "11111111-1111-4111-8111-111111111111",
    });
    expect(keys.previewKey).toContain("workspaces/11111111-1111-4111-8111-111111111111/");
    expect(keys.zipKey.endsWith("/artifact.zip")).toBe(true);
  });

  it("issues short-lived signed preview and download URLs without a storage request", async () => {
    const store = new S3ArtifactStore({
      accessKeyId: "test-access",
      bucket: "private-bucket",
      endpoint: "https://0123456789abcdef.r2.cloudflarestorage.com",
      forcePathStyle: true,
      region: "auto",
      secretAccessKey: "test-secret",
    });
    const [preview, download] = await Promise.all([
      store.signPreview("private/preview.html", 300),
      store.signDownload("private/artifact.zip", 300),
    ]);
    expect(new URL(preview).hostname).toBe("0123456789abcdef.r2.cloudflarestorage.com");
    expect(new URL(preview).pathname).toBe("/private-bucket/private/preview.html");
    expect(new URL(preview).searchParams.get("X-Amz-Expires")).toBe("300");
    expect(new URL(preview).searchParams.get("X-Amz-Credential")).toContain(
      "/auto/s3/aws4_request",
    );
    expect(new URL(download).searchParams.get("response-content-disposition")).toContain(
      "attachment",
    );
  });

  it("uploads private artifact bytes and metadata through an S3-compatible endpoint", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({ $metadata: {} } as never);

    try {
      const store = new S3ArtifactStore({
        accessKeyId: "test-access",
        bucket: "private-bucket",
        endpoint: "https://0123456789abcdef.r2.cloudflarestorage.com",
        forcePathStyle: true,
        region: "auto",
        secretAccessKey: "test-secret",
      });
      const bundle = buildStaticSiteBundle("<!doctype html><title>Wakil</title>");
      await store.uploadBundle(
        { previewKey: "private/preview.html", zipKey: "private/artifact.zip" },
        bundle,
      );

      expect(send).toHaveBeenCalledTimes(2);
      const previewCommand = send.mock.calls[0]?.[0];
      const zipCommand = send.mock.calls[1]?.[0];
      expect(previewCommand).toBeInstanceOf(PutObjectCommand);
      expect(zipCommand).toBeInstanceOf(PutObjectCommand);
      expect((previewCommand as PutObjectCommand).input).toMatchObject({
        Body: bundle.preview.bytes,
        Bucket: "private-bucket",
        ContentDisposition: "inline",
        ContentLength: bundle.preview.sizeBytes,
        ContentType: bundle.preview.mediaType,
        Key: "private/preview.html",
        Metadata: { sha256: bundle.preview.checksumSha256 },
      });
      expect((zipCommand as PutObjectCommand).input).toMatchObject({
        Body: bundle.zip.bytes,
        Bucket: "private-bucket",
        ContentDisposition: 'attachment; filename="wakil-site.zip"',
        ContentLength: bundle.zip.sizeBytes,
        ContentType: bundle.zip.mediaType,
        Key: "private/artifact.zip",
        Metadata: { sha256: bundle.zip.checksumSha256 },
      });
    } finally {
      send.mockRestore();
    }
  });

  it("validates the complete private storage lifecycle and cleanup", async () => {
    let uploadedBytes: Uint8Array | undefined;
    let uploadedChecksum: string | undefined;
    let uploadedKey: string | undefined;
    let deleted = false;
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command) => {
      if (command instanceof HeadBucketCommand) return { $metadata: {} } as never;
      if (command instanceof PutObjectCommand) {
        uploadedBytes = command.input.Body as Uint8Array;
        uploadedChecksum = command.input.Metadata?.sha256;
        uploadedKey = command.input.Key;
        return { $metadata: {} } as never;
      }
      if (command instanceof HeadObjectCommand) {
        if (deleted) {
          throw Object.assign(new Error("not found"), {
            $metadata: { httpStatusCode: 404 },
            name: "NotFound",
          });
        }
        return {
          ContentDisposition: 'attachment; filename="wakil-storage-health.txt"',
          ContentLength: uploadedBytes?.byteLength,
          ContentType: "text/plain; charset=utf-8",
          Metadata: { sha256: uploadedChecksum },
        } as never;
      }
      if (command instanceof GetObjectCommand) {
        return {
          Body: { transformToByteArray: async () => uploadedBytes },
        } as never;
      }
      if (command instanceof DeleteObjectCommand) {
        deleted = true;
        return { $metadata: {} } as never;
      }
      throw new Error("Unexpected storage command");
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("private", { status: 400 }))
      .mockImplementationOnce(
        async () =>
          new Response(uploadedBytes, {
            headers: {
              "content-disposition": 'attachment; filename="wakil-storage-health.txt"',
              "content-type": "text/plain; charset=utf-8",
            },
            status: 200,
          }),
      );

    try {
      const store = new S3ArtifactStore({
        accessKeyId: "test-access",
        bucket: "private-bucket",
        endpoint: "https://0123456789abcdef.r2.cloudflarestorage.com",
        forcePathStyle: true,
        region: "auto",
        secretAccessKey: "test-secret",
      });
      await expect(store.checkLifecycle()).resolves.toEqual({
        cleanup: true,
        delete: true,
        download: true,
        exists: true,
        privateAccess: true,
        read: true,
        signedUrl: true,
        upload: true,
      });
      expect(deleted).toBe(true);
      expect(uploadedKey).toMatch(
        /^health-check\/\d+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.txt$/,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(new URL(String(fetchMock.mock.calls[0]?.[0])).search).toBe("");
      expect(new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get("X-Amz-Expires")).toBe(
        "300",
      );
    } finally {
      fetchMock.mockRestore();
      send.mockRestore();
    }
  });

  it("deletes the temporary object after an intermediate validation failure", async () => {
    let deleted = false;
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command) => {
      if (command instanceof HeadBucketCommand || command instanceof PutObjectCommand) {
        return { $metadata: {} } as never;
      }
      if (command instanceof DeleteObjectCommand) {
        deleted = true;
        return { $metadata: {} } as never;
      }
      if (command instanceof HeadObjectCommand) {
        if (deleted) {
          throw Object.assign(new Error("not found"), {
            $metadata: { httpStatusCode: 404 },
            name: "NotFound",
          });
        }
        return { ContentLength: 0 } as never;
      }
      throw new Error("Unexpected storage command");
    });

    try {
      const store = new S3ArtifactStore({
        accessKeyId: "test-access",
        bucket: "private-bucket",
        endpoint: "https://0123456789abcdef.r2.cloudflarestorage.com",
        forcePathStyle: true,
        region: "auto",
        secretAccessKey: "test-secret",
      });
      await expect(store.checkLifecycle()).rejects.toMatchObject({ phase: "exists" });
      expect(deleted).toBe(true);
    } finally {
      send.mockRestore();
    }
  });

  it("accepts only Cloudflare R2 or loopback S3 API endpoints", () => {
    expect(objectStorageEndpointKind("https://0123456789abcdef.r2.cloudflarestorage.com")).toBe(
      "r2",
    );
    expect(objectStorageEndpointKind("https://0123456789abcdef.eu.r2.cloudflarestorage.com")).toBe(
      "r2",
    );
    expect(objectStorageEndpointKind("http://127.0.0.1:9000")).toBe("local");
    expect(objectStorageEndpointKind("https://assets.example.com")).toBeNull();
  });

  it("fails fast when region or path-style configuration is invalid", () => {
    expect(
      () =>
        new S3ArtifactStore({
          accessKeyId: "test-access",
          bucket: "private-bucket",
          endpoint: "https://0123456789abcdef.r2.cloudflarestorage.com",
          forcePathStyle: true,
          region: "us-east-1",
          secretAccessKey: "test-secret",
        }),
    ).toThrowError(/region/);
    expect(
      () =>
        new S3ArtifactStore({
          accessKeyId: "test-access",
          bucket: "private-bucket",
          endpoint: "https://0123456789abcdef.r2.cloudflarestorage.com",
          forcePathStyle: false,
          region: "auto",
          secretAccessKey: "test-secret",
        }),
    ).toThrowError(/path-style/);
  });
});
