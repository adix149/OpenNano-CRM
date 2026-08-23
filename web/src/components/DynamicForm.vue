<script setup lang="ts">
import { computed, useSlots } from "vue";
import { useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { buildFormSchema, initialValuesFor } from "@/lib/entityMeta";
import type { EntityField } from "@/lib/api";
import { Button } from "@/components/ui/button";
import DateTimeField from "@/components/DateTimeField.vue";
import TextField from "@/fieldTypes/TextField.vue";
import NumberField from "@/fieldTypes/NumberField.vue";
import SelectField from "@/fieldTypes/SelectField.vue";
import BooleanField from "@/fieldTypes/BooleanField.vue";
import PhoneField from "@/fieldTypes/PhoneField.vue";
import RelationField from "@/fieldTypes/RelationField.vue";

/**
 * One generic form component driven entirely by field metadata. Used by the
 * user view (row create/edit) and the dev view (entity declaration).
 */
const props = withDefaults(
  defineProps<{
    fields: EntityField[];
    initialRow?: Record<string, unknown>;
    submitLabel?: string;
    disabled?: boolean;
  }>(),
  {
    submitLabel: "Save",
    initialRow: undefined,
    disabled: false,
  },
);

const emit = defineEmits<{ submit: [values: Record<string, unknown>] }>();

const slots = useSlots();
const hasExtra = computed(() => Boolean(slots.extra));

const validationSchema = toTypedSchema(buildFormSchema(props.fields));
const form = useForm({
  validationSchema,
  initialValues: initialValuesFor(props.fields, props.initialRow),
});

// defineField must be called once per field at setup time.
const controls = props.fields.map((field) => ({
  field,
  model: form.defineField(field.name)[0],
  error: form.errors,
}));

const onSubmit = form.handleSubmit((values) => {
  emit("submit", values as Record<string, unknown>);
});
</script>

<template>
  <form class="space-y-4" @submit.prevent="onSubmit">
    <div v-for="c in controls" :key="c.field.name" class="space-y-1.5">
      <PhoneField
        v-if="c.field.type === 'phone'"
        :id="`field-${c.field.name}`"
        v-model="c.model.value"
        :field="c.field"
        :disabled="disabled"
      />
      <DateTimeField
        v-else-if="c.field.type === 'date' || c.field.type === 'datetime'"
        :id="`field-${c.field.name}`"
        v-model="c.model.value"
        :with-time="c.field.type === 'datetime'"
        :disabled="disabled"
      />
      <SelectField
        v-else-if="c.field.type === 'select'"
        :id="`field-${c.field.name}`"
        v-model="c.model.value"
        :field="c.field"
        :disabled="disabled"
      />
      <BooleanField
        v-else-if="c.field.type === 'boolean'"
        :id="`field-${c.field.name}`"
        v-model="c.model.value"
        :field="c.field"
        :disabled="disabled"
      />
      <NumberField
        v-else-if="c.field.type === 'number' || c.field.type === 'decimal'"
        :id="`field-${c.field.name}`"
        v-model="c.model.value"
        :field="c.field"
        :disabled="disabled"
      />
      <RelationField
        v-else-if="c.field.type === 'relation'"
        :id="`field-${c.field.name}`"
        v-model="c.model.value"
        :field="c.field"
        :disabled="disabled"
      />
      <TextField
        v-else
        :id="`field-${c.field.name}`"
        v-model="c.model.value"
        :field="c.field"
        :disabled="disabled"
      />

      <p
        v-if="form.errors.value[c.field.name]"
        class="text-sm text-destructive"
      >
        {{ form.errors.value[c.field.name] }}
      </p>
    </div>

    <slot name="extra" v-if="hasExtra" />

    <div class="flex items-center gap-2 pt-2">
      <Button type="submit" :disabled="disabled">{{ submitLabel }}</Button>
      <slot name="actions" />
    </div>
  </form>
</template>