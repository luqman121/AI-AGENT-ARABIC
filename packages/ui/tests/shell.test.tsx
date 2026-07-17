import { render, screen } from "@testing-library/react";
import { FolderOpen } from "lucide-react";
import { describe, expect, it } from "vitest";

import { AppHeader } from "../src/components/app-header";
import { BottomNav, BottomNavItem, BottomNavItemContent } from "../src/components/bottom-nav";
import { Ltr } from "../src/components/ltr";
import { MessageItem } from "../src/components/message-item";
import { PageShell } from "../src/components/page-shell";
import { ProjectListItem, ProjectListItemContent } from "../src/components/project-list-item";
import { Tabs } from "../src/components/tabs";
import { VisuallyHidden } from "../src/components/visually-hidden";

describe("AppHeader", () => {
  it("renders the page title as the top heading", () => {
    render(<AppHeader title="المشاريع" />);
    expect(screen.getByRole("heading", { level: 1, name: "المشاريع" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});

describe("BottomNav", () => {
  it("is a labelled navigation landmark and marks the current page", () => {
    render(
      <BottomNav label="التنقل الرئيسي">
        <BottomNavItem active>
          <a href="/projects">
            <BottomNavItemContent active icon={FolderOpen} label="المشاريع" />
          </a>
        </BottomNavItem>
        <BottomNavItem>
          <a href="/usage">
            <BottomNavItemContent icon={FolderOpen} label="الاستخدام" />
          </a>
        </BottomNavItem>
      </BottomNav>,
    );
    expect(screen.getByRole("navigation", { name: "التنقل الرئيسي" })).toBeInTheDocument();
    const active = screen.getByRole("link", { name: "المشاريع" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "الاستخدام" })).not.toHaveAttribute("aria-current");
  });
});

describe("PageShell", () => {
  it("is the main landmark and reserves bottom-navigation space", () => {
    render(<PageShell>محتوى</PageShell>);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main.className).toContain("pb-[calc(72px+env(safe-area-inset-bottom))]");
  });
});

describe("ProjectListItem", () => {
  it("styles the whole child link as one large target", () => {
    render(
      <ProjectListItem>
        <a href="/projects/1">
          <ProjectListItemContent
            title="موقع مطعم البيت"
            excerpt="أريد موقعًا بسيطًا لمطعمي"
            dateLabel="14 يوليو 2026"
            archived
          />
        </a>
      </ProjectListItem>,
    );
    const link = screen.getByRole("link");
    expect(link.className).toContain("min-h-11");
    expect(link).toHaveTextContent("موقع مطعم البيت");
    expect(link).toHaveTextContent("أريد موقعًا بسيطًا لمطعمي");
  });
});

describe("MessageItem", () => {
  it("renders the saved requirement and its timestamp", () => {
    render(<MessageItem content="أضف صفحة تواصل" dateLabel="14 يوليو 2026" />);
    expect(screen.getByRole("article")).toHaveTextContent("أضف صفحة تواصل");
    expect(screen.getByText("14 يوليو 2026")).toBeInTheDocument();
  });
});

describe("Tabs (segmented filter)", () => {
  it("exposes a labelled group with the active filter pressed", () => {
    render(
      <Tabs
        items={[
          { label: "النشطة", value: "active" },
          { label: "المؤرشفة", value: "archived" },
        ]}
        label="تصفية المشاريع"
        value="active"
        onValueChange={() => {}}
      />,
    );
    expect(screen.getByRole("group", { name: "تصفية المشاريع" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "النشطة" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "المؤرشفة" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("Ltr", () => {
  it("isolates LTR tokens inside RTL text", () => {
    render(<Ltr>user@example.com</Ltr>);
    const span = screen.getByText("user@example.com");
    expect(span).toHaveAttribute("dir", "ltr");
    expect(span).toHaveClass("wk-ltr");
  });
});

describe("VisuallyHidden", () => {
  it("keeps text available to assistive technology", () => {
    render(<VisuallyHidden>جارٍ التحميل</VisuallyHidden>);
    expect(screen.getByText("جارٍ التحميل")).toBeInTheDocument();
  });
});
