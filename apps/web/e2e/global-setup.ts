import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { config as loadDotEnv } from "dotenv";

const rootDirectory = fileURLToPath(new URL("../../..", import.meta.url));
const localEnvPath = fileURLToPath(new URL("../../../.env.local", import.meta.url));

export default async function globalSetup(): Promise<() => Promise<void>> {
  const localEnv: Record<string, string> = {};
  loadDotEnv({ path: localEnvPath, processEnv: localEnv, quiet: true });

  const worker = spawn("pnpm", ["--filter", "@wakil/worker", "start"], {
    cwd: rootDirectory,
    env: { ...process.env, ...localEnv, NODE_ENV: "test" },
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
    if (worker.exitCode !== null) return;
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
  };
}
