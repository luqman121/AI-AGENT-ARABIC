import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import { ensureLocalEnv, rootDirectory } from "./local-env.mjs";

function run(command, args, env, capture = false) {
  return new Promise((resolve, reject) => {
    const output = [];
    const child = spawn(command, args, {
      cwd: rootDirectory,
      env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    if (capture) {
      child.stdout.on("data", (chunk) => output.push(chunk));
      child.stderr.on("data", (chunk) => output.push(chunk));
    }
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(Buffer.concat(output).toString("utf8"));
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function waitForWeb(child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Web process exited before becoming ready.");
    try {
      const response = await fetch("http://127.0.0.1:3100/api/health", { cache: "no-store" });
      if (response.ok) {
        const body = await response.json();
        if (body.service === "web" && body.status === "ok") return;
      }
    } catch {
      // The server is still starting.
    }
    await delay(250);
  }
  throw new Error("Web health route did not become ready.");
}

async function main() {
  const env = { ...(await ensureLocalEnv()), NODE_ENV: "production" };
  const composeArgs = ["compose", "-f", "infra/docker-compose.yml"];
  const statusText = await run("docker", [...composeArgs, "ps", "--format", "json"], env, true);
  const statuses = statusText
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const required = new Set(["mailpit", "minio", "postgres", "redis"]);

  for (const status of statuses) {
    if (required.has(status.Service) && status.State === "running" && status.Health === "healthy") {
      required.delete(status.Service);
    }
  }
  if (required.size > 0)
    throw new Error(`Unhealthy Compose services: ${[...required].join(", ")}.`);

  await run("docker", [...composeArgs, "run", "--rm", "minio-init"], env);
  await run(process.execPath, ["apps/worker/dist/index.js", "--check"], env);

  const web = spawn(
    process.execPath,
    ["apps/web/node_modules/next/dist/bin/next", "start", "apps/web", "-p", "3100"],
    { cwd: rootDirectory, env, stdio: "inherit" },
  );

  try {
    await waitForWeb(web);
    process.stdout.write("M0 smoke checks passed.\n");
  } finally {
    web.kill("SIGTERM");
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown smoke-test error.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
