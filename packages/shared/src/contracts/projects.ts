import { z } from "zod";

export const OUTPUT_KINDS = [
  "static_site",
  "web_app",
  "pdf",
  "spreadsheet",
  "image",
  "audio",
  "document",
  "presentation",
  "other",
] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

import {
  idempotencyKeySchema,
  projectIdSchema,
  projectTitleSchema,
  requestTextSchema,
} from "./fields.js";

export const createProjectInputSchema = z.object({
  /** Omitted when the user only describes their idea; the server derives one. */
  title: projectTitleSchema.optional(),
  request: requestTextSchema,
  outputKind: z.enum(OUTPUT_KINDS).default("static_site"),
  idempotencyKey: idempotencyKeySchema,
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const renameProjectInputSchema = z.object({
  projectId: projectIdSchema,
  title: projectTitleSchema,
  idempotencyKey: idempotencyKeySchema,
});

export type RenameProjectInput = z.infer<typeof renameProjectInputSchema>;

export const archiveProjectInputSchema = z.object({
  projectId: projectIdSchema,
  idempotencyKey: idempotencyKeySchema,
});

export type ArchiveProjectInput = z.infer<typeof archiveProjectInputSchema>;

export const PROJECT_FILTERS = ["active", "archived"] as const;

export const searchProjectsInputSchema = z.object({
  /** Empty or whitespace-only queries list all projects in the filter. */
  query: z
    .string()
    .trim()
    .max(120, "نص البحث طويل جدًا.")
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  filter: z.enum(PROJECT_FILTERS).default("active"),
});

/** Input shape (pre-parse): query and filter are optional at call sites. */
export type SearchProjectsInput = z.input<typeof searchProjectsInputSchema>;
export type ProjectFilter = (typeof PROJECT_FILTERS)[number];
