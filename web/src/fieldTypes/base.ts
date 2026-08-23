import type { EntityField, FieldType } from "@/lib/api";
import { FIELD_TYPE_LABELS } from "@/lib/entityMeta";

export interface FieldRendererProps {
  modelValue: unknown;
  field: EntityField;
  disabled?: boolean;
  id: string;
  onUpdate: (value: unknown) => void;
}

export interface FieldTypeDefinition {
  type: FieldType;
  label: string;
  component: any;
  validate?: (value: unknown) => string | null;
  defaultValue?: () => unknown;
}

export function getFieldLabel(type: FieldType): string {
  return FIELD_TYPE_LABELS[type] || type;
}

export function isTextualType(type: FieldType): boolean {
  return ["text", "email", "url", "phone", "location"].includes(type);
}

export function isNumberType(type: FieldType): boolean {
  return ["number", "decimal"].includes(type);
}

export function isDateType(type: FieldType): boolean {
  return ["date", "datetime"].includes(type);
}