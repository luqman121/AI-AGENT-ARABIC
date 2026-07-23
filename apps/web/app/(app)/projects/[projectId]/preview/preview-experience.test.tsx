// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewExperience } from "./preview-experience";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

afterEach(cleanup);

describe("PreviewExperience", () => {
  beforeEach(() => {
    replace.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("keeps technical controls accessible and the private iframe sandboxed", () => {
    render(
      <PreviewExperience
        artifactId="artifact-1"
        initialViewport="desktop"
        previewUrl="https://private-preview.example/signed"
        projectId="project-1"
        projectTitle="مشروع تجريبي"
      />,
    );

    expect(screen.getByRole("button", { name: "سطح المكتب" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "تحديث المعاينة" })).toBeVisible();
    expect(screen.getByRole("button", { name: "نسخ رابط المعاينة" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ملء الشاشة" })).toBeVisible();
    expect(screen.getByTitle("معاينة موقع مشروع تجريبي")).toHaveAttribute(
      "sandbox",
      "allow-scripts",
    );
    expect(screen.getByTitle("/projects/project-1/preview?artifact=artifact-1")).toHaveAttribute(
      "dir",
      "ltr",
    );
  });

  it("switches to a mobile viewport and preserves it in the route", () => {
    const { container } = render(
      <PreviewExperience
        artifactId="artifact-1"
        initialViewport="desktop"
        previewUrl="https://private-preview.example/signed"
        projectId="project-1"
        projectTitle="مشروع تجريبي"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "هاتف" }));
    expect(replace).toHaveBeenCalledWith(
      "/projects/project-1/preview?artifact=artifact-1&viewport=mobile",
      { scroll: false },
    );
    expect(screen.getByRole("button", { name: "هاتف" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".w-\\[390px\\]")).toBeInTheDocument();
  });

  it("copies a stable authorized application route instead of the signed object URL", async () => {
    render(
      <PreviewExperience
        artifactId="artifact-1"
        initialViewport="desktop"
        previewUrl="https://private-preview.example/signed-secret"
        projectId="project-1"
        projectTitle="مشروع تجريبي"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "نسخ رابط المعاينة" }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "http://localhost:3000/projects/project-1/preview?artifact=artifact-1",
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("تم نسخ رابط المعاينة");
  });

  it("explains when the browser cannot enter full-screen", async () => {
    render(
      <PreviewExperience
        artifactId="artifact-1"
        initialViewport="desktop"
        previewUrl="https://private-preview.example/signed"
        projectId="project-1"
        projectTitle="مشروع تجريبي"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ملء الشاشة" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("ملء الشاشة غير متاح في هذا المتصفح."),
    );
  });
});
