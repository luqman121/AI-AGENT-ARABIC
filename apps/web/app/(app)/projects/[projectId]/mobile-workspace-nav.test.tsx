// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MobileWorkspaceNav } from "./mobile-workspace-nav";

describe("MobileWorkspaceNav", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
    document.body.innerHTML =
      '<section id="conversation"></section><section id="activity"></section>';
  });

  it("provides touch-sized conversation, preview, and activity navigation", () => {
    render(<MobileWorkspaceNav projectId="project-1" />);

    expect(screen.getByRole("navigation", { name: "أقسام مساحة العمل" })).toBeVisible();
    expect(screen.getByRole("link", { name: "المعاينة" })).toHaveAttribute(
      "href",
      "/projects/project-1/preview",
    );

    fireEvent.click(screen.getByRole("button", { name: "المحادثة" }));
    fireEvent.click(screen.getByRole("button", { name: "النشاط" }));
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "المحادثة" }).className).toContain("min-h-11");
  });
});
