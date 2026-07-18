import { describe, expect, it, vi } from "vitest";

import { DaytonaSandboxAdapter } from "./index.js";

const html =
  '<!doctype html><html lang="ar" dir="rtl"><head><title>وكيل</title><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head></html>';

function fakeClient(exitCode = 0) {
  const uploaded: Array<{ destination: string; source: Buffer }> = [];
  const sandbox = {
    fs: {
      createFolder: vi.fn(async () => undefined),
      uploadFiles: vi.fn(async (files: typeof uploaded) => {
        uploaded.push(...files);
      }),
    },
    id: "sandbox-1",
    process: {
      executeCommand: vi.fn(async () => ({
        exitCode,
        result: JSON.stringify({ ok: true, size: Buffer.byteLength(html) }),
      })),
    },
  };
  return {
    client: {
      create: vi.fn(async () => sandbox),
      delete: vi.fn(async () => undefined),
    },
    sandbox,
    uploaded,
  };
}

describe("Daytona sandbox adapter", () => {
  it("creates a private ephemeral network-blocked sandbox and cleans it up", async () => {
    const fake = fakeClient();
    const adapter = new DaytonaSandboxAdapter(fake.client);
    const result = await adapter.validateStaticSite({
      html,
      limits: { commandTimeoutSeconds: 10, maxDurationMs: 60_000, ttlMinutes: 2 },
      runId: "33333333-3333-4333-8333-333333333333",
    });

    expect(fake.client.create).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true, networkBlockAll: true, public: false }),
      { timeout: 60 },
    );
    expect(fake.uploaded.map((file) => file.destination)).toEqual([
      "/tmp/wakil/index.html",
      "/tmp/wakil/validate.mjs",
    ]);
    expect(fake.sandbox.process.executeCommand).toHaveBeenCalledWith(
      "node /tmp/wakil/validate.mjs",
      "/tmp/wakil",
      {},
      10,
    );
    expect(fake.client.delete).toHaveBeenCalled();
    expect(result).toMatchObject({ provider: "daytona", sandboxId: "sandbox-1" });
  });

  it("maps validation failure and still deletes the sandbox", async () => {
    const fake = fakeClient(2);
    const adapter = new DaytonaSandboxAdapter(fake.client);
    await expect(
      adapter.validateStaticSite({
        html,
        limits: { commandTimeoutSeconds: 10, maxDurationMs: 60_000, ttlMinutes: 2 },
        runId: "33333333-3333-4333-8333-333333333333",
      }),
    ).rejects.toMatchObject({ code: "sandbox_validation_failed" });
    expect(fake.client.delete).toHaveBeenCalled();
  });
});
