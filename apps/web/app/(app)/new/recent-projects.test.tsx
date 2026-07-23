// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecentProjects } from "./recent-projects";

describe("RecentProjects", () => {
  it("renders tenant-scoped project summaries as real project links", () => {
    render(
      <RecentProjects
        projects={[
          {
            excerpt: "موقع عقاري عربي مع نموذج حجز",
            id: "project-1",
            title: "شركة مسقط العقارية",
            updatedAtIso: "2026-07-23T08:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "مشاريعك الأخيرة" })).toBeVisible();
    expect(screen.getByRole("link", { name: /شركة مسقط العقارية/ })).toHaveAttribute(
      "href",
      "/projects/project-1",
    );
    expect(screen.getByText("موقع عقاري عربي مع نموذج حجز")).toBeVisible();
  });

  it("does not add an artificial empty card when there are no recent projects", () => {
    const { container } = render(<RecentProjects projects={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
