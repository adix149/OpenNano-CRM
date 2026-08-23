import { z } from "zod";

const identifier = z.string().regex(/^[a-z][a-z0-9_]*$/, "must match ^[a-z][a-z0-9_]*$");
const persona = z.enum(["viewer", "editor", "developer", "admin"]);

export const createEntitySchema = z
  .object({
    slug: identifier,
    label: z.string().min(1),
    projectId: z.number().int().positive().optional(),
    projectSlug: z.string().optional(),
    orgId: z.number().int().positive().optional(),
    viewRole: persona.optional(),
    editRole: persona.optional(),
  })
  .refine((d) => d.projectId !== undefined || d.projectSlug !== undefined || d.orgId !== undefined, {
    message: "Provide orgId (organization-wide) or projectId/projectSlug",
  });

export const updateEntitySchema = z
  .object({
    slug: identifier.optional(),
    label: z.string().min(1).optional(),
    viewRole: persona.optional(),
    editRole: persona.optional(),
  })
  .strict();

export type CreateEntityInput = z.infer<typeof createEntitySchema>;
export type UpdateEntityInput = z.infer<typeof updateEntitySchema>;
