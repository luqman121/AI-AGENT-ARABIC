// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunPanel } from "./run-panel";

const { replace, startRunAction } = vi.hoisted(() => ({
  replace: vi.fn(),
  startRunAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace }),
}));

vi.mock("../../../../src/lib/idempotency-key", () => ({
  newIdempotencyKey: () => "test-idempotency-key",
}));

vi.mock("../../../../src/server/actions/runs", () => ({
  cancelRunAction: vi.fn(),
  startRunAction,
}));

afterEach(cleanup);

class FakeEventSource {
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;

  close() {}
}

describe("RunPanel plan approval gate", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", FakeEventSource);
    replace.mockReset();
    startRunAction.mockReset();
    startRunAction.mockResolvedValue({
      data: { runId: "22222222-2222-4222-8222-222222222222" },
      ok: true,
    });
  });

  it("does not start execution until the user approves the persisted plan", async () => {
    render(
      <RunPanel
        archived={false}
        artifacts={[]}
        autoStart={false}
        initialEvents={[]}
        initialRun={{
          cancelRequestedAtIso: null,
          errorCode: null,
          id: "11111111-1111-4111-8111-111111111111",
          kind: "planning",
          status: "succeeded",
        }}
        outputKind="static_site"
        projectId="33333333-3333-4333-8333-333333333333"
        projectTitle="موقع مقهى"
      />,
    );

    expect(startRunAction).not.toHaveBeenCalled();
    expect(screen.getByText("الخطة جاهزة للمراجعة.", { exact: false })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "ابدأ إنشاء الموقع" }));

    await waitFor(() =>
      expect(startRunAction).toHaveBeenCalledWith({
        idempotencyKey: "test-idempotency-key",
        kind: "execution",
        projectId: "33333333-3333-4333-8333-333333333333",
      }),
    );
  });
});
