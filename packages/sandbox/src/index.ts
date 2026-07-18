import { Daytona } from "@daytona/sdk";
import { z } from "zod";

export type SandboxLimits = {
  commandTimeoutSeconds: number;
  maxDurationMs: number;
  ttlMinutes: number;
};

export type StaticSiteValidationInput = {
  html: string;
  limits: SandboxLimits;
  onCreated?: (sandboxId: string) => Promise<void>;
  runId: string;
};

export type StaticSiteValidationResult = {
  durationMs: number;
  provider: "daytona";
  sandboxId: string;
};

export interface SandboxAdapter {
  validateStaticSite(input: StaticSiteValidationInput): Promise<StaticSiteValidationResult>;
}

export type SandboxFailureCode =
  "sandbox_timeout" | "sandbox_unavailable" | "sandbox_validation_failed";

export class SandboxError extends Error {
  constructor(
    readonly code: SandboxFailureCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "SandboxError";
  }
}

type ExecuteResponse = { exitCode: number; result: string };
type DaytonaSandbox = {
  fs: {
    createFolder(path: string, mode: string): Promise<void>;
    uploadFiles(
      files: Array<{ destination: string; source: Buffer }>,
      timeout?: number,
    ): Promise<void>;
  };
  id: string;
  process: {
    executeCommand(
      command: string,
      cwd?: string,
      env?: Record<string, string>,
      timeout?: number,
    ): Promise<ExecuteResponse>;
  };
};

type DaytonaClient = {
  create(
    params: {
      ephemeral: boolean;
      labels: Record<string, string>;
      language: string;
      networkBlockAll: boolean;
      public: boolean;
      ttlMinutes: number;
    },
    options: { timeout: number },
  ): Promise<DaytonaSandbox>;
  delete(sandbox: DaytonaSandbox, timeout?: number, wait?: boolean): Promise<void>;
};

export type DaytonaSandboxConfig = {
  apiKey: string;
  apiUrl?: string;
  target?: string;
};

const runIdSchema = z.uuid();

const validatorSource = [
  'import { readFile } from "node:fs/promises";',
  'const html = await readFile("/tmp/wakil/index.html", "utf8");',
  "const failures = [];",
  'if (!/^\\s*<!doctype html>/i.test(html)) failures.push("doctype");',
  'if (!/<html\\b[^>]*\\blang=["\\\']ar["\\\'][^>]*>/i.test(html)) failures.push("lang");',
  'if (!/<html\\b[^>]*\\bdir=["\\\']rtl["\\\'][^>]*>/i.test(html)) failures.push("dir");',
  'if (!/<title>[^<]{1,120}<\\/title>/i.test(html)) failures.push("title");',
  'if (!/content-security-policy/i.test(html)) failures.push("csp");',
  'if (/(?:https?:|ftp:|wss?:|\\/\\/)[^\\s"\\\']+/i.test(html)) failures.push("remote-url");',
  'if (/<(?:form|iframe|object|embed|base)\\b/i.test(html)) failures.push("unsafe-element");',
  'if (failures.length > 0) { process.stderr.write(failures.join(",")); process.exit(2); }',
  "process.stdout.write(JSON.stringify({ ok: true, size: Buffer.byteLength(html) }));",
].join("\n");

export function createDaytonaSandboxAdapter(config: DaytonaSandboxConfig): SandboxAdapter {
  const client = new Daytona({
    apiKey: config.apiKey,
    ...(config.apiUrl ? { apiUrl: config.apiUrl } : {}),
    ...(config.target ? { target: config.target } : {}),
  });
  return new DaytonaSandboxAdapter(client);
}

export class DaytonaSandboxAdapter implements SandboxAdapter {
  constructor(private readonly client: DaytonaClient) {}

  async validateStaticSite(input: StaticSiteValidationInput): Promise<StaticSiteValidationResult> {
    const startedAt = Date.now();
    const runId = runIdSchema.parse(input.runId);
    const createTimeoutSeconds = Math.max(1, Math.ceil(input.limits.maxDurationMs / 1_000));
    let sandbox: DaytonaSandbox | undefined;

    try {
      sandbox = await this.client.create(
        {
          ephemeral: true,
          labels: { runId, service: "wakil" },
          language: "javascript",
          networkBlockAll: true,
          public: false,
          ttlMinutes: input.limits.ttlMinutes,
        },
        { timeout: createTimeoutSeconds },
      );
      await input.onCreated?.(sandbox.id);
      await sandbox.fs.createFolder("/tmp/wakil", "700");
      await sandbox.fs.uploadFiles(
        [
          { destination: "/tmp/wakil/index.html", source: Buffer.from(input.html, "utf8") },
          { destination: "/tmp/wakil/validate.mjs", source: Buffer.from(validatorSource, "utf8") },
        ],
        input.limits.commandTimeoutSeconds,
      );
      const response = await sandbox.process.executeCommand(
        "node /tmp/wakil/validate.mjs",
        "/tmp/wakil",
        {},
        input.limits.commandTimeoutSeconds,
      );
      if (response.exitCode !== 0) throw new SandboxError("sandbox_validation_failed", false);
      const parsed = z
        .object({ ok: z.literal(true), size: z.number().int().positive() })
        .safeParse(JSON.parse(response.result));
      if (!parsed.success || parsed.data.size !== Buffer.byteLength(input.html, "utf8")) {
        throw new SandboxError("sandbox_validation_failed", false);
      }
      const durationMs = Date.now() - startedAt;
      if (durationMs > input.limits.maxDurationMs) {
        throw new SandboxError("sandbox_timeout", false);
      }
      return { durationMs, provider: "daytona", sandboxId: sandbox.id };
    } catch (error) {
      if (error instanceof SandboxError) throw error;
      const name = error instanceof Error ? error.name.toLowerCase() : "";
      if (name.includes("timeout")) throw new SandboxError("sandbox_timeout", true);
      throw new SandboxError("sandbox_unavailable", true);
    } finally {
      if (sandbox) {
        await this.client
          .delete(sandbox, input.limits.commandTimeoutSeconds, true)
          .catch(() => undefined);
      }
    }
  }
}
