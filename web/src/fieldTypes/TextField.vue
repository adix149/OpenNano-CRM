<script setup lang="ts">
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntityField } from "@/lib/api";

interface Props {
  modelValue: string;
  field: EntityField;
  disabled?: boolean;
  id: string;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const typeMap: Record<string, string> = {
  email: "email",
  url: "url",
  location: "text",
  text: "text",
};

const placeholders: Record<string, string> = {
  email: "name@example.com",
  url: "https://example.com",
  location: "lat,lng — e.g. 12.9716,77.5946",
  text: "",
};

const inputType = typeMap[props.field.type] || "text";
const placeholder = placeholders[props.field.type] || "";

function onInput(val: string | number) {
  emit("update:modelValue", String(val));
}
</script>

<template>
  <div class="space-y-1.5">
    <Label :for="id">{{ field.label }}</Label>
    <Input
      :id="id"
      :modelValue="modelValue"
      @update:modelValue="onInput"
      :type="inputType"
      :placeholder="placeholder"
      :disabled="disabled"
    />
  </div>
</template>