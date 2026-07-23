import { createRequire } from "node:module";

import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import ExcelJS from "exceljs";
import { unzipSync } from "fflate";
import PDFDocument from "pdfkit";

import {
  documentDraftSchema,
  presentationDraftSchema,
  spreadsheetDraftSchema,
  type FileArtifactKind,
} from "@wakil/skills";

import type { ArtifactBytes } from "./index.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  bytes: Buffer,
  options?: { max?: number },
) => Promise<{ numpages: number; text: string }>;
type PptxRuntime = {
  addSlide(): {
    addText(text: unknown, options: unknown): void;
    background: { color: string };
  };
  author: string;
  lang: string;
  layout: string;
  subject: string;
  theme: unknown;
  title: string;
  write(options: { outputType: "arraybuffer" }): Promise<ArrayBuffer>;
};
const PptxGenJS = require("pptxgenjs") as unknown as new () => PptxRuntime;
const ARABIC_FONT_PATH = decodeURIComponent(
  new URL("../assets/NotoSansArabic.ttf", import.meta.url).pathname,
);

export type GeneratedFileBundle = {
  download: ArtifactBytes;
  fileName: string;
  kind: FileArtifactKind;
  preview: ArtifactBytes;
  summary: string;
  title: string;
};

export type AttachmentInput = {
  bytes: Uint8Array;
  mediaType: string;
  name: string;
};

function sha256(bytes: Uint8Array): string {
  return require("node:crypto").createHash("sha256").update(bytes).digest("hex") as string;
}

function artifactBytes(bytes: Uint8Array, mediaType: string): ArtifactBytes {
  return { bytes, checksumSha256: sha256(bytes), mediaType, sizeBytes: bytes.byteLength };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function previewShell(title: string, summary: string, body: string): Uint8Array {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><title>${escapeHtml(title)}</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0d0d14;color:#f7f5ff;font-family:Arial,sans-serif;line-height:1.8}.page{max-width:980px;margin:auto;padding:32px 20px 64px}h1{font-size:clamp(28px,5vw,48px);margin:0 0 8px}h2{color:#b9a5ff;margin:32px 0 10px}.summary{color:#c7c4d1;margin-bottom:28px}.card{background:#181824;border:1px solid #323041;border-radius:18px;padding:20px;margin:14px 0}ul{padding-right:24px}table{width:100%;border-collapse:collapse;background:#181824;border-radius:14px;overflow:hidden}th,td{padding:12px;border:1px solid #39364a;text-align:right;vertical-align:top}th{background:#2a2148;color:#fff}.table-wrap{overflow:auto;margin:18px 0}.slide{border-right:4px solid #8d6cff}</style></head><body><main class="page"><h1>${escapeHtml(title)}</h1><p class="summary">${escapeHtml(summary)}</p>${body}</main></body></html>`;
  return Buffer.from(html, "utf8");
}

function safeBaseName(title: string): string {
  const withoutControls = [...title.normalize("NFKC")]
    .map((character) => (character.charCodeAt(0) <= 31 ? "-" : character))
    .join("");
  const base = withoutControls
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return base || "نتيجة-وكيل";
}

async function buildDocx(draft: unknown): Promise<Uint8Array> {
  const data = documentDraftSchema.parse(draft);
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ bold: true, text: data.title })],
    }),
    new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, text: data.summary }),
  ];
  for (const section of data.sections) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ bold: true, text: section.heading })],
      }),
    );
    for (const paragraph of section.paragraphs) {
      children.push(
        new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, text: paragraph }),
      );
    }
    for (const bullet of section.bullets) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          bullet: { level: 0 },
          text: bullet,
        }),
      );
    }
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

async function buildXlsx(draft: unknown): Promise<Uint8Array> {
  const data = spreadsheetDraftSchema.parse(draft);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "وكيل";
  workbook.title = data.title;
  for (const sheetData of data.sheets) {
    const sheet = workbook.addWorksheet(sheetData.name, { views: [{ rightToLeft: true }] });
    sheet.addRow(sheetData.headers);
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { pattern: "solid", type: "pattern", fgColor: { argb: "FF5036A8" } };
    header.alignment = { horizontal: "right", vertical: "middle" };
    for (const values of sheetData.rows) {
      const normalized = sheetData.headers.map((_, index) => values[index] ?? null);
      sheet.addRow(normalized);
    }
    sheet.eachRow((row) => {
      row.alignment = { horizontal: "right", vertical: "top", wrapText: true };
    });
    sheet.columns.forEach((column, index) => {
      const widest = Math.max(
        sheetData.headers[index]?.length ?? 10,
        ...sheetData.rows.slice(0, 100).map((row) => String(row[index] ?? "").length),
      );
      column.width = Math.min(Math.max(widest + 3, 12), 42);
    });
    sheet.autoFilter = {
      from: { column: 1, row: 1 },
      to: { column: sheetData.headers.length, row: 1 },
    };
    sheet.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function buildPptx(draft: unknown): Promise<Uint8Array> {
  const data = presentationDraftSchema.parse(draft);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "وكيل";
  pptx.subject = data.summary;
  pptx.title = data.title;
  pptx.lang = "ar-OM";
  pptx.theme = {
    headFontFace: "Arial",
    bodyFontFace: "Arial",
    lang: "ar-OM",
  };
  for (const [index, item] of data.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: index === 0 ? "211944" : "F7F5FF" };
    const dark = index === 0;
    slide.addText(item.title, {
      x: 0.7,
      y: index === 0 ? 1.7 : 0.5,
      w: 11.9,
      h: 0.8,
      fontFace: "Arial",
      fontSize: index === 0 ? 30 : 25,
      bold: true,
      color: dark ? "FFFFFF" : "241C3E",
      align: "right",
      rtlMode: true,
      margin: 0,
    });
    if (item.subtitle) {
      slide.addText(item.subtitle, {
        x: 0.9,
        y: index === 0 ? 2.7 : 1.35,
        w: 11.5,
        h: 0.55,
        fontSize: 16,
        color: dark ? "CFC7FF" : "5E5870",
        align: "right",
        rtlMode: true,
        margin: 0,
      });
    }
    if (item.bullets.length > 0) {
      slide.addText(
        item.bullets.map((text) => ({
          options: { bullet: { indent: 18 }, breakLine: true },
          text,
        })),
        {
          x: 1,
          y: index === 0 ? 3.4 : 2,
          w: 11.2,
          h: 4.6,
          fontSize: 18,
          color: dark ? "FFFFFF" : "29243A",
          align: "right",
          breakLine: false,
          rtlMode: true,
          valign: "top",
          margin: 0.08,
        },
      );
    }
    slide.addText(`${index + 1}`, {
      x: 0.35,
      y: 7.05,
      w: 0.45,
      h: 0.2,
      fontSize: 9,
      color: dark ? "B8A9FF" : "7867C7",
      margin: 0,
    });
  }
  return new Uint8Array(await pptx.write({ outputType: "arraybuffer" }));
}

function pdfRtlText(value: string): string {
  // PDFKit shapes Arabic correctly but reverses contiguous Latin/number runs in RTL lines.
  // Reverse those runs before layout so mixed text such as Facebook Ads, OMR and 2026
  // remains visually correct in the rendered PDF.
  return value.replace(/[A-Za-z0-9][A-Za-z0-9 .,/%+:-]*[A-Za-z0-9%]|[A-Za-z0-9]/g, (token) =>
    [...token].reverse().join(""),
  );
}

async function buildPdf(draft: unknown): Promise<Uint8Array> {
  const data = documentDraftSchema.parse(draft);
  return new Promise<Uint8Array>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: { Author: "وكيل", Title: data.title },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.font(ARABIC_FONT_PATH);
    doc
      .fontSize(24)
      .fillColor("#241c3e")
      .text(pdfRtlText(data.title), { align: "right", features: ["rtla"] });
    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .fillColor("#5e5870")
      .text(pdfRtlText(data.summary), { align: "right", features: ["rtla"] });
    for (const section of data.sections) {
      doc.moveDown(1);
      doc
        .fontSize(16)
        .fillColor("#5036a8")
        .text(pdfRtlText(section.heading), { align: "right", features: ["rtla"] });
      for (const paragraph of section.paragraphs) {
        doc.moveDown(0.35);
        doc
          .fontSize(11)
          .fillColor("#222222")
          .text(pdfRtlText(paragraph), { align: "right", features: ["rtla"] });
      }
      for (const bullet of section.bullets) {
        doc.moveDown(0.2);
        doc
          .fontSize(11)
          .fillColor("#222222")
          .text(`• ${pdfRtlText(bullet)}`, { align: "right", features: ["rtla"] });
      }
    }
    doc.end();
  });
}

function documentPreview(draft: unknown): Uint8Array {
  const data = documentDraftSchema.parse(draft);
  const body = data.sections
    .map(
      (section) =>
        `<section class="card"><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}${section.bullets.length > 0 ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>` : ""}</section>`,
    )
    .join("");
  return previewShell(data.title, data.summary, body);
}

function spreadsheetPreview(draft: unknown): Uint8Array {
  const data = spreadsheetDraftSchema.parse(draft);
  const body = data.sheets
    .map(
      (sheet) =>
        `<section><h2>${escapeHtml(sheet.name)}</h2><div class="table-wrap"><table><thead><tr>${sheet.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${sheet.rows
          .slice(0, 100)
          .map(
            (row) =>
              `<tr>${sheet.headers.map((_, index) => `<td>${escapeHtml(String(row[index] ?? ""))}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table></div></section>`,
    )
    .join("");
  return previewShell(data.title, data.summary, body);
}

function presentationPreview(draft: unknown): Uint8Array {
  const data = presentationDraftSchema.parse(draft);
  const body = data.slides
    .map(
      (slide, index) =>
        `<section class="card slide"><h2>${index + 1}. ${escapeHtml(slide.title)}</h2>${slide.subtitle ? `<p>${escapeHtml(slide.subtitle)}</p>` : ""}${slide.bullets.length > 0 ? `<ul>${slide.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>` : ""}</section>`,
    )
    .join("");
  return previewShell(data.title, data.summary, body);
}

export async function buildGeneratedFileBundle(
  kind: FileArtifactKind,
  draft: unknown,
): Promise<GeneratedFileBundle> {
  if (kind === "spreadsheet") {
    const data = spreadsheetDraftSchema.parse(draft);
    const bytes = await buildXlsx(data);
    await validateGeneratedFile(kind, bytes);
    return {
      download: artifactBytes(
        bytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
      fileName: `${safeBaseName(data.title)}.xlsx`,
      kind,
      preview: artifactBytes(spreadsheetPreview(data), "text/html; charset=utf-8"),
      summary: data.summary,
      title: data.title,
    };
  }
  if (kind === "presentation") {
    const data = presentationDraftSchema.parse(draft);
    const bytes = await buildPptx(data);
    await validateGeneratedFile(kind, bytes);
    return {
      download: artifactBytes(
        bytes,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
      fileName: `${safeBaseName(data.title)}.pptx`,
      kind,
      preview: artifactBytes(presentationPreview(data), "text/html; charset=utf-8"),
      summary: data.summary,
      title: data.title,
    };
  }
  const data = documentDraftSchema.parse(draft);
  if (kind === "pdf") {
    const bytes = await buildPdf(data);
    await validateGeneratedFile(kind, bytes);
    return {
      download: artifactBytes(bytes, "application/pdf"),
      fileName: `${safeBaseName(data.title)}.pdf`,
      kind,
      preview: artifactBytes(documentPreview(data), "text/html; charset=utf-8"),
      summary: data.summary,
      title: data.title,
    };
  }
  const bytes = await buildDocx(data);
  await validateGeneratedFile(kind, bytes);
  return {
    download: artifactBytes(
      bytes,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    fileName: `${safeBaseName(data.title)}.docx`,
    kind,
    preview: artifactBytes(documentPreview(data), "text/html; charset=utf-8"),
    summary: data.summary,
    title: data.title,
  };
}

function decodeXmlText(xml: string): string {
  return xml
    .replace(/<w:tab\s*\/>|<a:br\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>|<\/w:p>|<\/a:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function inspectSafeZipArchive(bytes: Uint8Array, requiredEntries: string[]): Set<string> {
  const buffer = Buffer.from(bytes);
  const minimumEocdOffset = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Invalid ZIP archive");
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount < 1 || entryCount > 500 || centralOffset + centralSize > eocdOffset) {
    throw new Error("Unsafe ZIP archive structure");
  }

  const names = new Set<string>();
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > buffer.length || (flags & 1) !== 0 || ![0, 8].includes(method)) {
      throw new Error("Encrypted or unsupported ZIP entry");
    }
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (
      !name ||
      name.includes("\u0000") ||
      name.includes("\\") ||
      name.startsWith("/") ||
      name.split("/").includes("..")
    ) {
      throw new Error("Unsafe ZIP entry path");
    }
    if (/vbaProject\.bin$/i.test(name)) throw new Error("Macro-enabled documents are unsupported");
    if (
      uncompressedSize > 10_000_000 ||
      (compressedSize > 0 && uncompressedSize / compressedSize > 200)
    ) {
      throw new Error("Suspicious ZIP compression ratio");
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > 25_000_000) throw new Error("ZIP archive exceeds extraction limit");
    names.add(name);
    offset = nextOffset;
  }
  if (offset !== centralOffset + centralSize) throw new Error("Invalid ZIP directory size");
  for (const required of requiredEntries) {
    if (!names.has(required)) throw new Error(`Missing OOXML entry: ${required}`);
  }
  return names;
}

async function validateGeneratedFile(kind: FileArtifactKind, bytes: Uint8Array): Promise<void> {
  if (bytes.byteLength < 100 || bytes.byteLength > 25_000_000) {
    throw new Error("Generated artifact size is invalid");
  }
  if (kind === "pdf") {
    if (!Buffer.from(bytes.subarray(0, 5)).equals(Buffer.from("%PDF-"))) {
      throw new Error("Generated PDF header is invalid");
    }
    const parsed = await pdfParse(Buffer.from(bytes), { max: 2 });
    if (parsed.numpages < 1) throw new Error("Generated PDF has no pages");
    return;
  }
  if (kind === "document") {
    inspectSafeZipArchive(bytes, ["[Content_Types].xml", "word/document.xml"]);
    return;
  }
  if (kind === "presentation") {
    const names = inspectSafeZipArchive(bytes, [
      "[Content_Types].xml",
      "ppt/presentation.xml",
      "ppt/slides/slide1.xml",
    ]);
    if (![...names].some((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))) {
      throw new Error("Generated presentation has no slides");
    }
    return;
  }
  const workbook = new ExcelJS.Workbook();
  inspectSafeZipArchive(bytes, ["[Content_Types].xml", "xl/workbook.xml"]);
  await workbook.xlsx.load(bytes as never);
  if (workbook.worksheets.length < 1) throw new Error("Generated spreadsheet has no sheets");
}

function extractZipXml(
  bytes: Uint8Array,
  requiredEntries: string[],
  predicate: (name: string) => boolean,
): string {
  inspectSafeZipArchive(bytes, requiredEntries);
  const files = unzipSync(bytes);
  return Object.entries(files)
    .filter(([name]) => predicate(name))
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([, value]) => decodeXmlText(Buffer.from(value).toString("utf8")))
    .filter(Boolean)
    .join("\n\n");
}

async function extractXlsx(bytes: Uint8Array): Promise<string> {
  inspectSafeZipArchive(bytes, ["[Content_Types].xml", "xl/workbook.xml"]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    lines.push(`[ورقة: ${sheet.name}]`);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : Object.values(row.values);
      lines.push(values.map((value) => String(value ?? "")).join(" | "));
    });
  });
  return lines.join("\n");
}

export async function extractAttachmentText(input: AttachmentInput): Promise<string> {
  let text: string;
  if (input.mediaType === "text/plain" || input.mediaType === "text/csv") {
    text = Buffer.from(input.bytes).toString("utf8");
  } else if (input.mediaType === "application/pdf") {
    const parsed = await pdfParse(Buffer.from(input.bytes), { max: 80 });
    text = parsed.text;
  } else if (
    input.mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    text = extractZipXml(
      input.bytes,
      ["[Content_Types].xml", "word/document.xml"],
      (name) => name === "word/document.xml",
    );
  } else if (
    input.mediaType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    text = extractZipXml(input.bytes, ["[Content_Types].xml", "ppt/presentation.xml"], (name) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name),
    );
  } else if (
    input.mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    text = await extractXlsx(input.bytes);
  } else {
    throw new Error(`Unsupported analysis media type: ${input.mediaType}`);
  }
  const normalized = text.split("\u0000").join("").replace(/\r\n/g, "\n").trim();
  return normalized.slice(0, 24_000);
}
