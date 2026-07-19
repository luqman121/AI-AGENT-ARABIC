const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function isZip(bytes: Uint8Array) {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
}

function hasValidSignature(mediaType: string, bytes: Uint8Array) {
  switch (mediaType) {
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return (
        startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
      );
    case "application/pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "audio/webm":
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "audio/wav":
      return (
        startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(bytes, [0x57, 0x41, 0x56, 0x45], 8)
      );
    case "audio/mpeg":
      return (
        startsWith(bytes, [0x49, 0x44, 0x33]) ||
        (bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0)
      );
    case "audio/mp4":
      return startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return isZip(bytes);
    case "application/msword":
    case "application/vnd.ms-excel":
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "text/plain":
      return !bytes.slice(0, 4096).includes(0);
    default:
      return false;
  }
}

export type AttachmentValidationResult =
  { ok: true; bytes: Uint8Array; safeName: string } | { ok: false; message: string };

export async function validateAttachment(file: File): Promise<AttachmentValidationResult> {
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
    return { message: "نوع الملف غير مدعوم", ok: false };
  }
  if (file.size < 1) return { message: "الملف فارغ", ok: false };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { message: "حجم الملف أكبر من الحد المسموح (10 ميجابايت)", ok: false };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidSignature(file.type, bytes)) {
    return { message: "محتوى الملف لا يطابق نوعه", ok: false };
  }

  const safeCharacters = [...file.name.normalize("NFKC")].map((character) => {
    const code = character.charCodeAt(0);
    return character === "/" || character === "\\" || code < 32 || code === 127 ? "_" : character;
  });
  const safeName = safeCharacters.join("").trim().slice(0, 255) || "attachment";
  return { bytes, ok: true, safeName };
}
