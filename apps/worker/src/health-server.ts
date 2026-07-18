import { createServer, type Server } from "node:http";

export interface WorkerHealthState {
  ready: boolean;
}

function body(status: "ok" | "ready" | "unavailable"): string {
  return JSON.stringify({ service: "worker", status });
}

export interface WorkerHealthResponse {
  allow?: "GET";
  body?: string;
  status: number;
}

export function workerHealthResponse(
  method: string | undefined,
  url: string | undefined,
  state: WorkerHealthState,
): WorkerHealthResponse {
  if (method !== "GET") return { allow: "GET", status: 405 };
  if (url === "/health") return { body: body("ok"), status: 200 };
  if (url === "/ready") {
    return {
      body: body(state.ready ? "ready" : "unavailable"),
      status: state.ready ? 200 : 503,
    };
  }
  return { status: 404 };
}

export function createWorkerHealthServer(state: WorkerHealthState): Server {
  return createServer((request, response) => {
    const result = workerHealthResponse(request.method, request.url, state);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    if (result.allow) response.setHeader("Allow", result.allow);
    response.writeHead(result.status).end(result.body);
  });
}

export async function listenForWorkerHealth(
  state: WorkerHealthState,
  port: number,
): Promise<Server> {
  const server = createWorkerHealthServer(state);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

export async function closeWorkerHealth(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
