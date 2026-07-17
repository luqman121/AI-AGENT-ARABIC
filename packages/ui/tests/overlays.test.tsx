import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "../src/components/confirm-dialog";
import { Dialog } from "../src/components/dialog";
import { StatusBanner } from "../src/components/status-banner";
import { Toast } from "../src/components/toast";

describe("Dialog", () => {
  it("is labelled by its title and closes from the labelled close button", async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange} title="إعادة تسمية المشروع">
        <p>محتوى</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "إعادة تسمية المشروع" });
    expect(dialog).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "إغلاق" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange} title="حوار">
        <p>محتوى</p>
      </Dialog>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("ConfirmDialog", () => {
  it("confirms only through the confirm button; cancel dismisses", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="أرشفة المشروع"
        description="سينتقل المشروع إلى قائمة المؤرشفة."
        confirmLabel="أرشفة المشروع"
        destructive
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByRole("alertdialog", { name: "أرشفة المشروع" });
    expect(dialog).toHaveAccessibleDescription("سينتقل المشروع إلى قائمة المؤرشفة.");

    await userEvent.click(screen.getByRole("button", { name: "إلغاء" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "أرشفة المشروع" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("StatusBanner", () => {
  it("announces politely and pairs color with icon and text", () => {
    render(<StatusBanner tone="warning">لا يوجد اتصال بالإنترنت.</StatusBanner>);
    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner).toHaveTextContent("لا يوجد اتصال بالإنترنت.");
    expect(banner.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Toast", () => {
  it("renders in a polite live region and auto-dismisses", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <Toast
        toast={{ id: 7, message: "تمت إعادة التسمية", tone: "success" }}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText("تمت إعادة التسمية")).toBeInTheDocument();
    vi.advanceTimersByTime(4000);
    expect(onDismiss).toHaveBeenCalledWith(7);
    vi.useRealTimers();
  });
});
