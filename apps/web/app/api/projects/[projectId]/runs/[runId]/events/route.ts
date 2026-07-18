import {
  projectIdSchema,
  runEventChannel,
  runEventPayloadSchema,
  runIdSchema,
  type RunEventPayload,
} from "@wakil/shared";

import { requireAuthorizedContext } from "../../../../../../../src/server/auth/session";
import { getDatabase } from "../../../../../../../src/server/db";
import {
  getRunEventsAfter,
  getRunForStream,
} from "../../../../../../../src/server/features/runs/queries";
import { createRedisSubscriber } from "../../../../../../../src/server/redis";

export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 15_000;
const TERMINAL_EVENTS = new Set(["run.cancelled", "run.failed", "run.succeeded"]);

function parseLastEventId(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; runId: string }> },
): Promise<Response> {
  const ctx = await requireAuthorizedContext();
  const rawParams = await params;
  const projectId = projectIdSchema.safeParse(rawParams.projectId);
  const runId = runIdSchema.safeParse(rawParams.runId);
  if (!projectId.success || !runId.success) {
    return new Response("Not found", { status: 404 });
  }

  const db = getDatabase();
  const run = await getRunForStream(db, ctx, projectId.data, runId.data);
  if (!run) return new Response("Not found", { status: 404 });

  const afterSeq = parseLastEventId(request.headers.get("last-event-id"));
  const encoder = new TextEncoder();
  const subscriber = createRedisSubscriber();
  let closeStream = () => subscriber.disconnect();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let lastSentSeq = afterSeq;
      let replaying = true;
      const liveBuffer: RunEventPayload[] = [];

      function cleanup(): void {
        if (heartbeat) clearInterval(heartbeat);
        request.signal.removeEventListener("abort", close);
        subscriber.off("message", onMessage);
        subscriber.disconnect();
      }

      function close(): void {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // The request or a terminal event already closed the stream.
        }
      }

      function fail(error: unknown): void {
        if (closed) return;
        closed = true;
        cleanup();
        controller.error(error);
      }

      function send(event: RunEventPayload): void {
        if (closed || event.seq <= lastSentSeq) return;
        lastSentSeq = event.seq;
        controller.enqueue(encoder.encode(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`));
        if (TERMINAL_EVENTS.has(event.type)) close();
      }

      function onMessage(_channel: string, message: string): void {
        let value: unknown;
        try {
          value = JSON.parse(message);
        } catch {
          return;
        }
        const parsed = runEventPayloadSchema.safeParse(value);
        if (!parsed.success) return;
        if (replaying) liveBuffer.push(parsed.data);
        else send(parsed.data);
      }

      request.signal.addEventListener("abort", close, { once: true });
      subscriber.on("message", onMessage);
      closeStream = close;

      try {
        // Subscribe before replay so events published during the database read are buffered.
        await subscriber.subscribe(runEventChannel(runId.data));
        const replay = await getRunEventsAfter(db, ctx, projectId.data, runId.data, afterSeq);
        for (const event of replay) {
          send(event);
          if (closed) return;
        }

        replaying = false;
        liveBuffer.sort((left, right) => left.seq - right.seq);
        for (const event of liveBuffer) {
          send(event);
          if (closed) return;
        }

        heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
        }, HEARTBEAT_INTERVAL_MS);
      } catch (error) {
        fail(error);
      }
    },
    cancel() {
      closeStream();
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}
