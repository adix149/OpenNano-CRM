/**
 * Builds a zod object schema dynamically from entity field metadata.
 *
 * The backend uses this to validate data-API payloads; the frontend rebuilds
 * the same schema client-side from the registry (see web/src/lib/entityMeta.ts)
 * so both sides share one validation contract.
 */
import { z } from "zod";

export interface FieldMeta {
  name: string;
  type:
    | "text"
    | "number"
    | "decimal"
    | "boolean"
    | "date"
    | "datetime"
    | "email"
    | "phone"
    | "url"
    | "location"
    | "select"
    | "relation";
  isRequired: boolean;
  /** Predetermined values for select columns. */
  options?: string[];
  /** For relation columns: target entity id */
  relationEntityId?: number | null;
}

/** lat,lng with signed decimals (e.g. "12.9716,77.5946"). */
const LOCATION_RE = /^-?(?:[0-8]?\d|90)(?:\.\d+)?,\s*-?(?:\d{1,2}|1[0-7]\d|180)(?:\.\d+)?$/;

function baseSchemaFor(field: FieldMeta): z.ZodType {
  switch (field.type) {
    case "text":
      return z.string();
    case "email":
      return z.email();
    case "url":
      return z.url();
    case "phone":
      // Loose international format: digits, spaces, +, -, (), 7–20 chars.
      return z.string().regex(/^\+?[0-9 ()-]{7,20}$/, "invalid phone number");
    case "number":
      return z.number();
    case "decimal":
      return z.number();
    case "boolean":
      return z.boolean();
    case "date":
    case "datetime":
      // Dates/times cross the wire as strings (from the calendar picker or
      // JSON clients); validated parseable, normalized to UTC ISO strings.
      // (We deliberately do NOT emit Date objects: Bun SQL serializes them in
      // a JS-only format that Postgres rejects for DATE columns.)
      return z
        .string()
        .refine((v) => !Number.isNaN(Date.parse(v)), "invalid date")
        .transform((v) => new Date(v).toISOString());
    case "location":
      return z.string().regex(LOCATION_RE, 'expected "lat,lng" (e.g. "12.9716,77.5946")');
    case "select":
      return field.options && field.options.length > 0 ? z.enum(field.options) : z.string();
    case "relation":
      // Relation stores integer FK; validated for existence in the data route
      return z.number().int().positive();
  }
}

/** Strict schema for row creation: required columns enforced, unknown keys rejected. */
export function buildCreateSchema(columns: FieldMeta[]): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const f of columns) {
    const base = baseSchemaFor(f);
    shape[f.name] = f.isRequired ? base : base.nullish();
  }
  return z.object(shape).strict();
}

/** Partial schema for row updates. */
export function buildUpdateSchema(columns: FieldMeta[]): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const f of columns) {
    shape[f.name] = baseSchemaFor(f).nullish();
  }
  return z.object(shape).strict();
}
