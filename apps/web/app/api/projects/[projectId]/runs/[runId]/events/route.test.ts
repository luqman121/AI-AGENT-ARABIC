import type { RunEventPayload } from "@wakil/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRedisSubscriber: vi.fn(),
  getDatabase: vi.fn(() => ({ kind: "database" })),
  getRunEventsAfter: vi.fn(),
  getRunForStream: vi.fn(),
  requireAuthorizedContext: vi.fn(async () => ({
    userId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000001",
  })),
}));

vi.mock("../../../../../../../src/server/auth/session", () => ({
  requireAuthorizedContext: mocks.requireAuthorizedContext,
}));
vi.mock("../../../../../../../src/server/db", () => ({
  getDatabase: mocks.getDatabase,
}));
vi.mock("../../../../../../../src/server/features/runs/queries", () => ({
  getRunEventsAfter: mocks.getRunEventsAfter,
  getRunForStream: mocks.getRunForStream,
}));
vi.mock("../../../../../../../src/server/redis", () => ({
  createRedisSubscriber: mocks.createRedisSubscriber,
}));

import { GET } from "./route";

const projectId = "30000000-0000-4000-8000-000000000001";
const runId = "50000000-0000-4000-8000-000000000001";

type MessageListener = (channel: string, message: string) => void;

function subscriberThatPublishesOnSubscribe(event?: RunEventPayload) {
  const listeners = new Set<MessageListener>();
  return {
    disconnect: vi.fn(),
    off: vi.fn((_event: string, listener: MessageListener) => listeners.delete(listener)),
    on: vi.fn((_event: string, listener: MessageListener) => listeners.add(listener)),
    subscribe: vi.fn(async (channel: string) => {
      if (event) {
        for (const listener of listeners) listener(channel, JSON.stringify(event));
      }
      return 1;
    }),
  };
}

function request(lastEventId?: string): Request {
  const init: RequestInit = lastEventId ? { headers: { "last-event-id": lastEventId } } : {};
  return new Request(`http://localhost/api/projects/${projectId}/runs/${runId}/events`, init);
}

function params(values = { projectId, runId }) {
  return { params: Promise.resolve(values) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRunForStream.mockResolvedValue({ status: "running" });
  mocks.getRunEventsAfter.mockResolvedValue([]);
  mocks.createRedisSubscriber.mockReturnValue(subscriberThatPublishesOnSubscribe());
});

describe("GET run events SSE", () => {
  it("rejects invalid identifiers before querying run data", async () => {
    const response = await GET(request(), params({ projectId: "invalid", runId }));

    expect(response.status).toBe(404);
    expect(mocks.getRunForStream).not.toHaveBeenCalled();
    expect(mocks.createRedisSubscriber).not.toHaveBeenCalled();
  });

  it("returns the same 404 for a run outside the authorized tenant", async () => {
    mocks.getRunForStream.mockResolvedValue(null);

    const response = await GET(request(), params());

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(mocks.createRedisSubscriber).not.toHaveBeenCalled();
  });

  it("replays persisted events after Last-Event-ID and closes on terminal state", async () => {
    mocks.getRunEventsAfter.mockResolvedValue([
      { createdAtIso: "2026-07-18T10:00:00.000Z", seq: 2, type: "run.started" },
      { createdAtIso: "2026-07-18T10:00:01.000Z", seq: 3, type: "run.succeeded" },
    ]);

    const response = await GET(request("1"), params());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
    expect(mocks.getRunEventsAfter).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workspaceId: "20000000-0000-4000-8000-000000000001" }),
      projectId,
      runId,
      1,
    );
    expect(body).toContain("id: 2\n");
    expect(body).toContain("id: 3\n");
  });

  it("buffers live overlap and emits replayed events first without duplicates", async () => {
    const liveTerminal: RunEventPayload = {
      createdAtIso: "2026-07-18T10:00:02.000Z",
      seq: 3,
      type: "run.succeeded",
    };
    mocks.createRedisSubscriber.mockReturnValue(subscriberThatPublishesOnSubscribe(liveTerminal));
    mocks.getRunEventsAfter.mockResolvedValue([
      {
        createdAtIso: "2026-07-18T10:00:01.000Z",
        seq: 2,
        stepIndex: 0,
        stepKey: "validate-request",
        type: "run.step",
      },
      liveTerminal,
    ]);

    const response = await GET(request("1"), params());
    const body = await response.text();

    expect(body.indexOf("id: 2\n")).toBeGreaterThanOrEqual(0);
    expect(body.indexOf("id: 3\n")).toBeGreaterThan(body.indexOf("id: 2\n"));
    expect(body.match(/id: 3\n/g)).toHaveLength(1);
  });
});
