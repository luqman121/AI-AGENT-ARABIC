import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileText, Globe } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { ArtifactTypeScroller } from "../src/components/artifact-type-pill";
import { Button } from "../src/components/button";
import { IconButton } from "../src/components/icon-button";
import { RequestComposer } from "../src/components/request-composer";
import { SearchField } from "../src/components/search-field";
import { TextField } from "../src/components/text-field";
import { TextareaField } from "../src/components/textarea-field";

describe("Button", () => {
  it("has an accessible name, focus ring, and touch-size classes", () => {
    render(<Button>إنشاء المشروع</Button>);
    const button = screen.getByRole("button", { name: "إنشاء المشروع" });
    expect(button).toHaveClass("wk-focus-ring");
    expect(button.className).toContain("min-h-12");
    expect(button).toHaveAttribute("type", "button");
  });

  it("shows a real pending state: disabled with the label kept visible", () => {
    render(<Button loading>إنشاء المشروع</Button>);
    const button = screen.getByRole("button", { name: "إنشاء المشروع" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("renders as a link when asChild is used", () => {
    render(
      <Button asChild>
        <a href="/new">إنشاء مشروع</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "إنشاء مشروع" });
    expect(link).toHaveAttribute("href", "/new");
    expect(link).toHaveClass("wk-focus-ring");
  });

  it("disables the pressed scale under reduced motion", () => {
    render(<Button>حفظ</Button>);
    expect(screen.getByRole("button").className).toContain("motion-reduce:active:scale-100");
  });
});

describe("IconButton", () => {
  it("requires an accessible name and meets the 44px minimum", () => {
    render(<IconButton label="خيارات المشروع">•</IconButton>);
    const button = screen.getByRole("button", { name: "خيارات المشروع" });
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("min-w-11");
  });
});

describe("TextField", () => {
  it("associates the label and wires errors through aria-describedby", () => {
    render(<TextField label="اسم المشروع" error="أدخل اسمًا للمشروع." />);
    const input = screen.getByLabelText("اسم المشروع");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const error = document.getElementById(describedBy ?? "");
    expect(error).toHaveTextContent("أدخل اسمًا للمشروع.");
  });

  it("renders a hint without an error state", () => {
    render(<TextField label="البريد" hint="لن نشاركه مع أحد." />);
    const input = screen.getByLabelText("البريد");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText("لن نشاركه مع أحد.")).toBeInTheDocument();
  });
});

describe("TextareaField", () => {
  it("associates label and error", () => {
    render(<TextareaField label="اوصف طلبك" error="اكتب طلبك أولًا." />);
    const textarea = screen.getByLabelText("اوصف طلبك");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("اكتب طلبك أولًا.")).toBeInTheDocument();
  });
});

describe("SearchField", () => {
  it("is labelled for screen readers and exposes a labelled clear action", async () => {
    const onClear = vi.fn();
    render(
      <SearchField label="ابحث في المشاريع" value="مطعم" onChange={() => {}} onClear={onClear} />,
    );
    expect(screen.getByLabelText("ابحث في المشاريع")).toBeInTheDocument();
    const clear = screen.getByRole("button", { name: "مسح البحث" });
    await userEvent.click(clear);
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("hides the clear action when empty", () => {
    render(<SearchField label="بحث" value="" onChange={() => {}} onClear={() => {}} />);
    expect(screen.queryByRole("button", { name: "مسح البحث" })).not.toBeInTheDocument();
  });
});

describe("RequestComposer", () => {
  it("labels the textarea and send button and submits", async () => {
    const onSubmit = vi.fn();
    render(
      <RequestComposer
        label="أضف متطلبات إضافية"
        placeholder="أضف تفاصيل…"
        value="متطلب جديد"
        onValueChange={() => {}}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByLabelText("أضف متطلبات إضافية")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "إرسال الطلب" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("passes selected files to the unified attachment workflow", () => {
    const onFilesSelected = vi.fn();
    render(
      <RequestComposer
        label="الطلب"
        placeholder="اكتب طلبك"
        value="طلب عربي واضح"
        onFilesSelected={onFilesSelected}
        onSubmit={vi.fn()}
        onValueChange={vi.fn()}
      />,
    );
    const file = new File(["notes"], "تفاصيل.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("إضافة ملفات"), { target: { files: [file] } });
    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  it("renders attachment state and exposes a labelled remove action", () => {
    const onAttachmentRemove = vi.fn();
    render(
      <RequestComposer
        attachments={[
          {
            id: "local-file",
            mediaType: "application/pdf",
            name: "عرض.pdf",
            sizeBytes: 1_024,
            status: "ready",
          },
        ]}
        label="الطلب"
        placeholder="اكتب طلبك"
        value="طلب عربي واضح"
        onAttachmentRemove={onAttachmentRemove}
        onSubmit={vi.fn()}
        onValueChange={vi.fn()}
      />,
    );
    expect(screen.getByText("عرض.pdf")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "إزالة عرض.pdf" }));
    expect(onAttachmentRemove).toHaveBeenCalledWith("local-file");
  });

  it("disables sending while pending and announces the error", () => {
    render(
      <RequestComposer
        label="أضف متطلبات إضافية"
        placeholder="أضف تفاصيل…"
        value=""
        onValueChange={() => {}}
        onSubmit={() => {}}
        pending
        error="لم يُحفظ طلبك."
      />,
    );
    expect(screen.getByRole("button", { name: "إرسال الطلب" })).toBeDisabled();
    const textarea = screen.getByLabelText("أضف متطلبات إضافية");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("لم يُحفظ طلبك.")).toBeInTheDocument();
  });
});

describe("ArtifactTypeScroller", () => {
  it("keeps unavailable output types truthful and non-interactive", async () => {
    const onSelect = vi.fn();
    render(
      <ArtifactTypeScroller
        selectedId="website"
        onSelect={onSelect}
        options={[
          { icon: Globe, id: "website", label: "موقع" },
          {
            disabled: true,
            disabledReason: "يحتاج مولّدًا حقيقيًا في الخادم.",
            icon: FileText,
            id: "pdf",
            label: "PDF",
          },
        ]}
      />,
    );

    const unavailable = screen.getByRole("tab", { name: /PDF/ });
    expect(unavailable).toHaveAttribute("aria-disabled", "true");
    expect(unavailable).toHaveAttribute("title", expect.stringContaining("مولّدًا حقيقيًا"));
    await userEvent.click(unavailable);
    expect(onSelect).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("tab", { name: "موقع" }));
    expect(onSelect).toHaveBeenCalledWith("website");
  });
});
