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

  const worker = spawn("pnpm", ["--filter", "@wakil/worker", "start"], {
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("E2E worker did not become ready"));
    }, 30_000);
    const onExit = () => {
      cleanup();
      reject(new Error("E2E worker exited before becoming ready"));
    };
    const onStdout = (chunk: Buffer) => {
      if (chunk.toString().includes('"state":"consuming"')) {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      worker.off("exit", onExit);
      worker.stdout.off("data", onStdout);
    };

    worker.once("exit", onExit);
    worker.stdout.on("data", onStdout);
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
