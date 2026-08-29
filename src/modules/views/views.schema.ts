import { z } from "zod";

const layoutField = z.object({
  name: z.string().min(1),
  span: z.number().int().min(1).max(12).default(6),
  hidden: z.boolean().default(false),
});

const layoutSection = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  cols: z.number().int().min(1).max(12).default(12),
  fields: z.array(layoutField),
});

export const layoutSchema = z.object({
  sections: z.array(layoutSection).default([]),
});

export const viewKind = z.enum(["form", "page", "pdf", "calendar", "kanban", "table"]);

export const createViewSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  kind: viewKind.default("form"),
  layout: layoutSchema,
  config: z.record(z.string(), z.unknown()).optional(),
  isDefault: z.boolean().optional(),
});

export const updateViewSchema = z
  .object({
    label: z.string().min(1).optional(),
    kind: viewKind.optional(),
    layout: layoutSchema.optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export type CreateViewInput = z.infer<typeof createViewSchema>;
export type UpdateViewInput = z.infer<typeof updateViewSchema>;
export type Layout = z.infer<typeof layoutSchema>;
