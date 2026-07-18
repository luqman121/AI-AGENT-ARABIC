import { describe, expect, it } from "vitest";

import { workerHealthResponse } from "./health-server.js";

describe("workerHealthResponse", () => {
  it("keeps liveness separate from dependency readiness", () => {
    expect(workerHealthResponse("GET", "/health", { ready: false })).toEqual({
      body: JSON.stringify({ service: "worker", status: "ok" }),
      status: 200,
    });
    expect(workerHealthResponse("GET", "/ready", { ready: false })).toEqual({
      body: JSON.stringify({ service: "worker", status: "unavailable" }),
      status: 503,
    });
    expect(workerHealthResponse("GET", "/ready", { ready: true })).toEqual({
      body: JSON.stringify({ service: "worker", status: "ready" }),
      status: 200,
    });
  });

  it("rejects unsupported methods and paths", () => {
    expect(workerHealthResponse("POST", "/health", { ready: true })).toEqual({
      allow: "GET",
      status: 405,
    });
    expect(workerHealthResponse("GET", "/missing", { ready: true })).toEqual({ status: 404 });
  });
});
