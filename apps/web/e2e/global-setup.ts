import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { config as loadDotEnv } from "dotenv";

const rootDirectory = fileURLToPath(new URL("../../..", import.meta.url));
const localEnvPath = fileURLToPath(new URL("../../../.env.local", import.meta.url));

export default async function globalSetup(): Promise<() => Promise<void>> {
  const localEnv: Record<string, string> = {};
  loadDotEnv({ path: localEnvPath, processEnv: localEnv, quiet: true });

  const provider = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    if (body.includes("فشل المزود")) {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end('{"error":{"message":"local unavailable"}}');
      return;
    }

    response.writeHead(200, { "Content-Type": "text/event-stream" });
    if (body.includes("حالة الرفض")) {
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "content_filter" }] })}\n\n`,
      );
      response.end("data: [DONE]\n\n");
      return;
    }
    if (body.includes("حد الاستخدام")) {
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: `خطة موجزة\n1. خطوة أولى\n2. خطوة ثانية\n${"م".repeat(8_200)}` }, finish_reason: null }] })}\n\n`,
      );
      response.end("data: [DONE]\n\n");
      return;
    }
    response.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "خطة موجزة للمشروع\n1. تنظيم المحتوى المطلوب\n" }, finish_reason: null }] })}\n\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    response.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "2. مراجعة النتيجة معك" }, finish_reason: null }] })}\n\n`,
    );
    response.write(
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
    );
    response.write(
      `data: ${JSON.stringify({ choices: [], usage: { completion_tokens: 18, cost: 0.00002, prompt_tokens: 30 } })}\n\n`,
    );
    response.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve, reject) => {
    provider.once("error", reject);
    provider.listen(0, "127.0.0.1", () => resolve());
  });
  const address = provider.address();
  if (!address || typeof address === "string") throw new Error("E2E provider failed to bind");

  // Spawn Node directly instead of a pnpm wrapper so termination cannot orphan
  // the actual worker process after Playwright exits or global setup fails.
  const worker = spawn(process.execPath, ["apps/worker/dist/index.js"], {
    cwd: rootDirectory,
    env: {
      ...process.env,
      ...localEnv,
      MODEL_INPUT_COST_MICROS_PER_MILLION_TOKENS: "1000",
      MODEL_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: "2000",
      MODEL_PROVIDER: "openrouter",
      NODE_ENV: "test",
      OPENROUTER_API_KEY: "e2e-local-key",
      OPENROUTER_BASE_URL: `http://127.0.0.1:${address.port}`,
      OPENROUTER_MODEL: "e2e-local-model",
      WORKER_HEALTH_PORT: "3102",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Playwright does not run cleanup values returned by globalSetup. Ensure the
  // spawned worker never survives the test runner process.
  const terminateWorker = () => {
    if (worker.exitCode === null) worker.kill("SIGTERM");
  };
  process.once("exit", terminateWorker);

  await new Promise<void>((resolve, reject) => {
    let workerError = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`E2E worker did not become ready: ${workerError.trim() || "no stderr"}`));
    }, 30_000);
    const onExit = () => {
      cleanup();
      reject(
        new Error(`E2E worker exited before becoming ready: ${workerError.trim() || "no stderr"}`),
      );
    };
    const onStdout = (chunk: Buffer) => {
      if (chunk.toString().includes('"state":"consuming"')) {
        cleanup();
        resolve();
      }
    };
    const onStderr = (chunk: Buffer) => {
      // Retain bounded diagnostics; environment values are never written here.
      workerError = `${workerError}${chunk.toString()}`.slice(-4_000);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      worker.off("exit", onExit);
      worker.stdout.off("data", onStdout);
      worker.stderr.off("data", onStderr);
    };

    worker.once("exit", onExit);
    worker.stdout.on("data", onStdout);
    worker.stderr.on("data", onStderr);
  });

  return async () => {
    if (worker.exitCode === null) {
      worker.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (worker.exitCode === null) worker.kill("SIGKILL");
          resolve();
        }, 5_000);
        worker.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    await new Promise<void>((resolve) => provider.close(() => resolve()));
  };
}
