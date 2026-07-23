import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildGeneratedFileBundle, extractAttachmentText } from "./file-artifacts.js";

const documentDraft = {
  title: "تقرير المبيعات العُماني",
  summary: "ملخص عملي للمبيعات والفرص القادمة.",
  sections: [
    {
      heading: "النتائج الرئيسية",
      paragraphs: ["ارتفعت المبيعات مع تحسن معدل التحويل."],
      bullets: ["تحسين صفحة المنتج", "متابعة العملاء المحتملين"],
    },
  ],
};

const spreadsheetDraft = {
  title: "متابعة المبيعات",
  summary: "جدول منظم لمتابعة الطلبات.",
  sheets: [
    {
      name: "الطلبات",
      headers: ["المنتج", "الإيراد"],
      rows: [
        ["عطر", 120],
        ["ساعة", 85],
      ],
    },
  ],
};

const presentationDraft = {
  title: "خطة النمو",
  summary: "عرض مختصر لخطة النمو.",
  slides: [
    { title: "خطة النمو", subtitle: "سلطنة عُمان", bullets: [] },
    { title: "الخطوات القادمة", bullets: ["إطلاق الحملة", "قياس النتائج"] },
  ],
};

describe("native file artifacts", () => {
  it("generates a valid Arabic PDF and a private HTML preview", async () => {
    const bundle = await buildGeneratedFileBundle("pdf", documentDraft);
    expect(Buffer.from(bundle.download.bytes.subarray(0, 5)).toString("ascii")).toBe("%PDF-");
    expect(bundle.download.mediaType).toBe("application/pdf");
    expect(bundle.fileName).toMatch(/\.pdf$/);
    expect(Buffer.from(bundle.preview.bytes).toString("utf8")).toContain('dir="rtl"');
    expect(
      await extractAttachmentText({
        bytes: bundle.download.bytes,
        mediaType: bundle.download.mediaType,
        name: bundle.fileName,
      }),
    ).not.toBe("");
  });

  it("generates and round-trips a DOCX document", async () => {
    const bundle = await buildGeneratedFileBundle("document", documentDraft);
    const files = unzipSync(bundle.download.bytes);
    expect(files["word/document.xml"]).toBeDefined();
    const text = await extractAttachmentText({
      bytes: bundle.download.bytes,
      mediaType: bundle.download.mediaType,
      name: bundle.fileName,
    });
    expect(text).toContain("النتائج الرئيسية");
  });

  it("generates and round-trips a right-to-left XLSX workbook", async () => {
    const bundle = await buildGeneratedFileBundle("spreadsheet", spreadsheetDraft);
    const files = unzipSync(bundle.download.bytes);
    expect(files["xl/workbook.xml"]).toBeDefined();
    const text = await extractAttachmentText({
      bytes: bundle.download.bytes,
      mediaType: bundle.download.mediaType,
      name: bundle.fileName,
    });
    expect(text).toContain("الطلبات");
    expect(text).toContain("عطر");
  });

  it("generates and structurally validates a PPTX presentation", async () => {
    const bundle = await buildGeneratedFileBundle("presentation", presentationDraft);
    const files = unzipSync(bundle.download.bytes);
    expect(files["ppt/presentation.xml"]).toBeDefined();
    expect(files["ppt/slides/slide1.xml"]).toBeDefined();
    const text = await extractAttachmentText({
      bytes: bundle.download.bytes,
      mediaType: bundle.download.mediaType,
      name: bundle.fileName,
    });
    expect(text).toContain("خطة النمو");
  });

  it("rejects malformed OOXML archives before extraction", async () => {
    await expect(
      extractAttachmentText({
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        name: "خبيث.docx",
      }),
    ).rejects.toThrow(/ZIP/);
  });
});
