<script setup lang="ts">
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntityField } from "@/lib/api";

interface Props {
  modelValue: string | number | null | undefined;
  field: EntityField;
  disabled?: boolean;
  id: string;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });
const emit = defineEmits<{ "update:modelValue": [value: string | number | null] }>();

const isDecimal = props.field.type === "decimal";

function onInput(val: string | number) {
  const strVal = String(val);
  if (isDecimal && strVal.includes(".")) {
    const [, dec] = strVal.split(".");
    if (dec.length > 2) return;
  }
  const num = strVal === "" ? null : Number(strVal);
  emit("update:modelValue", Number.isNaN(num) ? strVal : num);
}
</script>

<template>
  <div class="space-y-1.5">
    <Label :for="id">{{ field.label }}</Label>
    <Input
      :id="id"
      :modelValue="modelValue ?? ''"
      @update:modelValue="onInput"
      type="number"
      :step="isDecimal ? '0.01' : 'any'"
      :placeholder="isDecimal ? '0.00' : ''"
      :disabled="disabled"
      inputmode="decimal"
    />
  </div>
</template>