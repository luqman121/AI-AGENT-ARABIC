import { spawn } from "node:child_process";

import { ensureLocalEnv, rootDirectory } from "./local-env.mjs";

function assertNode22() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major !== 22) {
    throw new Error(`Node.js 22 is required; received ${process.versions.node}.`);
  }
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: rootDirectory, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
  });
}

function pnpmCommand(args, env) {
  const pnpmPath = process.env.npm_execpath;
  if (!pnpmPath) throw new Error("Run this command through pnpm.");
  return run(process.execPath, [pnpmPath, ...args], env);
}

async function main() {
  assertNode22();
  const env = await ensureLocalEnv();
  await run("docker", ["info", "--format", "{{.ServerVersion}}"], env);
  await run("docker", ["compose", "-f", "infra/docker-compose.yml", "up", "-d", "--wait"], env);
  await run(
    "docker",
    ["compose", "-f", "infra/docker-compose.yml", "run", "--rm", "minio-init"],
    env,
  );
  await pnpmCommand(["--filter", "@wakil/db", "build"], env);
  await pnpmCommand(["db:migrate"], env);

  const pnpmPath = process.env.npm_execpath;
  if (!pnpmPath) throw new Error("Run this command through pnpm.");
  const turbo = spawn(process.execPath, [pnpmPath, "exec", "turbo", "run", "dev"], {
    cwd: rootDirectory,
    env: { ...env, TURBO_TELEMETRY_DISABLED: "1" },
    stdio: "inherit",
  });

  const stop = () => turbo.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const code = await new Promise((resolve, reject) => {
    turbo.once("error", reject);
    turbo.once("exit", (exitCode) => resolve(exitCode));
  });
  process.exitCode = code ?? 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown startup error.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
