// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArtifactActions } from "./artifact-actions";

afterEach(cleanup);

describe("ArtifactActions", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("copies an authenticated private route and explains its access boundary", async () => {
    render(<ArtifactActions artifactId="artifact-1" projectId="project-1" title="موقع المتجر" />);

    expect(screen.getByRole("link", { name: "تنزيل النتيجة" })).toHaveAttribute(
      "href",
      "/api/projects/project-1/artifacts/artifact-1/download",
    );
    expect(
      screen.getByText("الرابط خاص بحسابك ويتطلب تسجيل الدخول إلى مساحة العمل."),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "نسخ رابط خاص إلى موقع المتجر" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "http://localhost:3000/projects/project-1/preview?artifact=artifact-1",
      ),
    );
    expect(screen.getByText("تم نسخ الرابط الخاص")).toBeVisible();
  });

  it("announces clipboard failures", async () => {
    writeText.mockRejectedValueOnce(new Error("blocked"));
    render(<ArtifactActions artifactId="artifact-1" projectId="project-1" title="موقع المتجر" />);

    fireEvent.click(screen.getByRole("button", { name: "نسخ رابط خاص إلى موقع المتجر" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "تعذر نسخ الرابط. انسخه من شريط المتصفح.",
      ),
    );
  });
});
