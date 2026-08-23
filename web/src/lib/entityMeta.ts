/**
 * Client-side mirror of the backend's src/lib/meta-schema.ts contract:
 * builds a zod schema from entity field metadata so forms validate the same
 * way the data API will. Kept separate from the backend module because the
 * browser form layer needs coercion (inputs emit strings), while the backend
 * receives real JSON types.
 */
import { z } from "zod";
import type { EntityField, FieldType } from "./api";

/** lat,lng with signed decimals (e.g. "12.9716,77.5946") — mirrors backend. */
const LOCATION_RE = /^-?(?:[0-8]?\d|90)(?:\.\d+)?,\s*-?(?:\d{1,2}|1[0-7]\d|180)(?:\.\d+)?$/;

function fieldSchema(field: EntityField): z.ZodType {
  let base: z.ZodType;
  switch (field.type) {
    case "text":
      base = z.string();
      break;
    case "email":
      base = z.string().email();
      break;
    case "url":
      base = z.string().url();
      break;
    case "phone":
      base = z.string().regex(/^\+?[0-9 ()-]{7,20}$/, "Invalid phone number");
      break;
    case "number":
      // Inputs emit strings; map blank to undefined so optional numbers stay
      // unset (z.coerce.number would turn "" into 0) and required ones error.
      base = z.preprocess(
        (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
        z.number({ message: "Must be a number" }),
      );
      break;
    case "decimal":
      base = z.preprocess(
        (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
        z
          .number({ message: "Must be a number" })
          .refine((n) => Number.isFinite(n) && Math.abs(Math.round(n * 100) - n * 100) < 1e-9, {
            message: "Max 2 decimal places",
          }),
      );
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "date":
    case "datetime":
      base = z
        .string()
        .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "Invalid date");
      break;
    case "location":
      base = z
        .string()
        .refine(
          (v) => v === "" || LOCATION_RE.test(v),
          'Expected "lat,lng" (e.g. "12.9716,77.5946")',
        );
      break;
    case "select":
      base =
        field.options && field.options.length > 0
          ? z.enum(field.options as [string, ...string[]])
          : z.string();
      break;
    case "relation":
      base = z.preprocess(
        (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
        z.number({ message: "Must be a number" }),
      );
      break;
  }
  return field.isRequired ? base : base.optional();
}

/** Strict object schema for form submission (required fields enforced). */
export function buildFormSchema(fields: EntityField[]): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) shape[f.name] = fieldSchema(f);
  return z.object(shape).strict();
}

/** Initial values for DynamicForm: empty strings / false so inputs are controlled. */
export function initialValuesFor(fields: EntityField[], row?: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = row?.[f.name];
    switch (f.type) {
      case "boolean":
        values[f.name] = Boolean(raw);
        break;
      case "number":
      case "decimal":
      case "relation":
        // API returns numbers as strings; convert to actual numbers for the form
        values[f.name] = raw !== null && raw !== undefined && raw !== "" ? Number(raw) : "";
        break;
      case "date":
        values[f.name] = typeof raw === "string" ? raw.slice(0, 10) : "";
        break;
      case "datetime":
        // Keep local "YYYY-MM-DDTHH:mm" for the picker (seconds dropped).
        values[f.name] = typeof raw === "string" ? raw.slice(0, 16) : "";
        break;
      default:
        values[f.name] = raw ?? "";
    }
  }
  return values;
}

/** Converts validated form values into a JSON payload for the data API. */
export function toPayload(fields: EntityField[], values: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name];
    if (v === "" || v === undefined || v === null) continue;
    if (f.type === "date" || f.type === "datetime") {
      payload[f.name] = new Date(v as string).toISOString();
    } else if (f.type === "number" || f.type === "decimal" || f.type === "relation") {
      payload[f.name] = Number(v);
    } else {
      payload[f.name] = v;
    }
  }
  return payload;
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  decimal: "Decimal",
  boolean: "Boolean",
  date: "Date",
  datetime: "Date & Time",
  email: "Email",
  phone: "Phone",
  url: "URL",
  location: "Location",
  select: "Select",
  relation: "Relation",
};

/** Types whose column stores TEXT but need special input rendering. */
export const TEXTUAL_INPUT_TYPES: FieldType[] = ["email", "phone", "url", "location"];
