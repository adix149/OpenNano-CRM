<script setup lang="ts">
import { Checkbox } from "@/components/ui/checkbox";
import type { EntityField } from "@/lib/api";

interface Props {
  modelValue: boolean;
  field: EntityField;
  disabled?: boolean;
  id: string;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

function onChange(val: boolean | "indeterminate") {
  emit("update:modelValue", Boolean(val));
}
</script>

<template>
  <div class="flex items-center gap-2">
    <Checkbox
      :id="id"
      :model-value="modelValue"
      @update:modelValue="onChange"
      :disabled="disabled"
    />
    <label :for="id" class="text-sm font-medium cursor-pointer">
      {{ field.label }}
    </label>
  </div>
</template>