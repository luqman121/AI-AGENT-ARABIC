import process from "node:process";

const timeoutMs = 10_000;

function requiredUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const localContainerHttp = process.env.SMOKE_ALLOW_HTTP === "true";
  if (url.protocol !== "https:" && !loopback && !localContainerHttp) {
    throw new Error(`${name} must use HTTPS.`);
  }
  return url;
}

async function check(name, url, expectedStatus = 200) {
  let lastStatus;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      lastStatus = response.status;
      if (response.status === expectedStatus) {
        process.stdout.write(`PASS ${name}\n`);
        return;
      }
    } catch {
      lastStatus = undefined;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} failed${lastStatus ? ` with HTTP ${lastStatus}` : ""}.`);
}

async function main() {
  const web = requiredUrl("SMOKE_BASE_URL");
  const worker = requiredUrl("SMOKE_WORKER_URL");

  await check("web liveness", new URL("/api/health", web));
  await check("web readiness", new URL("/api/ready", web));
  await check("authentication page", new URL("/sign-in", web));
  await check("worker liveness", new URL("/health", worker));
  await check("worker readiness", new URL("/ready", worker));

  const unsignedObjectUrl = process.env.SMOKE_UNSIGNED_OBJECT_URL;
  if (unsignedObjectUrl) {
    const response = await fetch(new URL(unsignedObjectUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (![401, 403, 404].includes(response.status)) {
      throw new Error("private storage check returned an unexpected status.");
    }
    process.stdout.write("PASS private storage denial\n");
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown smoke-test error.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
