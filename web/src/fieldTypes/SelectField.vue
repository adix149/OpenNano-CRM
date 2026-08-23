<script setup lang="ts">
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EntityField } from "@/lib/api";

interface Props {
  modelValue: string | null | undefined;
  field: EntityField;
  disabled?: boolean;
  id: string;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });
const emit = defineEmits<{ "update:modelValue": [value: string | null] }>();

function onChange(val: unknown) {
  emit("update:modelValue", val as string | null);
}
</script>

<template>
  <div class="space-y-1.5">
    <Label :for="id">{{ field.label }}</Label>
    <Select
      :id="id"
      :model-value="modelValue"
      @update:modelValue="onChange"
      :disabled="disabled"
    >
      <SelectTrigger class="w-full">
        <SelectValue :placeholder="`Choose ${field.label}`" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          v-for="opt in field.options"
          :key="opt"
          :value="opt"
        >
          {{ opt }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>