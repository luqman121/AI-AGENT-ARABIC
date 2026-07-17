import { z } from "zod";

/**
 * Field schemas mirror the database CHECK constraints
 * (title 1..120, message content 1..20000, idempotency key 16..128)
 * so invalid input is rejected before reaching PostgreSQL.
 * Messages are user-facing Arabic; codes stay in errors.ts.
 */
export const projectTitleSchema = z
  .string({ error: "أدخل اسمًا للمشروع." })
  .trim()
  .min(1, "أدخل اسمًا للمشروع.")
  .max(120, "اسم المشروع طويل جدًا؛ الحد الأقصى 120 حرفًا.");

export const requestTextSchema = z
  .string({ error: "اكتب طلبك أولًا." })
  .trim()
  .min(1, "اكتب طلبك أولًا.")
  .max(20000, "الطلب طويل جدًا؛ اختصره ثم أعد المحاولة.");

export const projectIdSchema = z.uuid({ error: "معرّف المشروع غير صالح." });

export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,128}$/, "مفتاح الطلب غير صالح.");
