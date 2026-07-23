import { describe, expect, it } from "vitest";

import { validateAttachment } from "./validation";

function binaryFile(bytes: number[], name: string, type: string) {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("attachment validation", () => {
  it("accepts a PNG whose signature matches its declared type", async () => {
    const result = await validateAttachment(
      binaryFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00], "صورة.png", "image/png"),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a spoofed file type", async () => {
    const result = await validateAttachment(
      binaryFile([0x25, 0x50, 0x44, 0x46, 0x2d], "not-really.png", "image/png"),
    );
    expect(result).toEqual({ message: "محتوى الملف لا يطابق نوعه", ok: false });
  });

  it("rejects executable media types before reading content", async () => {
    const result = await validateAttachment(
      binaryFile([0x4d, 0x5a], "tool.exe", "application/x-msdownload"),
    );
    expect(result).toEqual({ message: "نوع الملف غير مدعوم", ok: false });
  });

  it("accepts presentation and CSV inputs used by document analysis", async () => {
    const presentation = await validateAttachment(
      binaryFile(
        [0x50, 0x4b, 0x03, 0x04, 0x00],
        "عرض.pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    );
    const csv = await validateAttachment(
      new File(["المنتج,الإيراد\nعطر,120"], "مبيعات.csv", { type: "text/csv" }),
    );
    expect(presentation.ok).toBe(true);
    expect(csv.ok).toBe(true);
  });

  it("sanitizes control characters and path separators in names", async () => {
    const result = await validateAttachment(
      binaryFile(
        [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31],
        "../folder\\report\u0000.pdf",
        "application/pdf",
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.safeName).toBe(".._folder_report_.pdf");
  });
});
