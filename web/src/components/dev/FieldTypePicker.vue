<script setup lang="ts">
import type { FieldType } from "@/lib/api";
import { cn } from "@/lib/utils";

const props = defineProps<{ modelValue: FieldType; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: FieldType] }>();

const TYPES: { value: FieldType; label: string; hint: string }[] = [
  { value: "text", label: "Text", hint: "Short free-form text" },
  { value: "email", label: "Email", hint: "Validated email address" },
  { value: "phone", label: "Phone", hint: "With country code picker" },
  { value: "url", label: "URL", hint: "Validated web link" },
  { value: "number", label: "Number", hint: "Whole numbers" },
  { value: "decimal", label: "Decimal", hint: "Money, rates (2 dp)" },
  { value: "boolean", label: "Checkbox", hint: "True / false toggle" },
  { value: "date", label: "Date", hint: "Calendar date picker" },
  { value: "datetime", label: "Date & Time", hint: "Date with time" },
  { value: "location", label: "Location", hint: '"lat,lng" coordinates' },
  { value: "select", label: "Select", hint: "Pick from fixed options" },
  { value: "relation", label: "Connection Key", hint: "Link to another table" },
];
</script>

<template>
  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
    <button
      v-for="t in TYPES"
      :key="t.value"
      type="button"
      :disabled="disabled"
      :class="cn(
        'rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50',
        modelValue === t.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted',
      )"
      @click="emit('update:modelValue', t.value)"
    >
      <div class="text-sm font-medium">{{ t.label }}</div>
      <div class="text-xs text-muted-foreground">{{ t.hint }}</div>
    </button>
  </div>
</template>
