/**
 * OpenNano-CRM — Field dialog logic
 *
 * Extracted from TableDetailPage.vue (was 577 lines) for maintainability.
 * Handles both "Add field" and "Edit field" with the same state.
 */

import { computed, ref } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { api, type Entity, type EntityField, type FieldType } from "@/lib/api";

export function useFieldDialog(entity: ReturnType<typeof computed<Entity | undefined>>) {
  const queryClient = useQueryClient();

  const open = ref(false);
  const mode = ref<"add" | "edit">("add");
  const name = ref("");
  const label = ref("");
  const type = ref<FieldType>("text");
  const required = ref(false);
  const options = ref("");
  const target = ref("");
  const relationKey = ref("");
  const inDetail = ref(true);
  const originalName = ref("");
  const error = ref("");

  function parseOptions(text: string) {
    const values = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (values.length === 0) return { error: "At least one option is required" };
    if (new Set(values).size !== values.length) return { error: "Options must be unique" };
    return { values };
  }

  function openAdd() {
    mode.value = "add";
    name.value = "";
    label.value = "";
    type.value = "text";
    required.value = false;
    options.value = "";
    target.value = "";
    relationKey.value = "";
    inDetail.value = true;
    originalName.value = "";
    error.value = "";
    open.value = true;
  }

  function openEdit(field: EntityField, slugOf: (f: EntityField) => string) {
    mode.value = "edit";
    originalName.value = field.name;
    name.value = field.name;
    label.value = field.label;
    type.value = field.type;
    required.value = field.isRequired;
    options.value = (field.options ?? []).join("\n");
    target.value = slugOf(field);
    relationKey.value = field.relationFieldName ?? "";
    inDetail.value = field.inDetail ?? true;
    error.value = "";
    open.value = true;
  }

  const editingField = computed(() =>
    mode.value === "edit" ? entity.value?.fields.find((f) => f.name === originalName.value) : undefined,
  );

  const save = useMutation({
    mutationFn: () => {
      if (!entity.value) throw new Error("No entity");
      const base = {
        name: name.value.trim(),
        label: label.value.trim(),
        type: type.value,
        is_required: required.value,
        in_detail: inDetail.value,
      };
      if (mode.value === "add") {
        return api.addField(entity.value.orgSlug!, entity.value.slug, {
          ...base,
          ...(type.value === "select" ? { options: parseOptions(options.value).values! } : {}),
          ...(type.value === "relation" && target.value
            ? { relationEntitySlug: target.value, relationFieldName: relationKey.value }
            : {}),
        });
      }
      const changedType = type.value !== editingField.value?.type;
      return api.updateField(entity.value.orgSlug!, entity.value.slug, originalName.value, {
        ...base,
        ...(type.value === "select" || (changedType && editingField.value?.type === "select")
          ? { options: parseOptions(options.value).values! }
          : {}),
        ...(type.value === "relation" && target.value
          ? { relationEntitySlug: target.value, relationFieldName: relationKey.value }
          : {}),
      });
    },
    onSuccess: async () => {
      open.value = false;
      await queryClient.invalidateQueries({ queryKey: ["entities"] });
    },
    onError: (e: any) => (error.value = e.message),
  });

  function submit() {
    error.value = "";
    if (!name.value.trim() || !label.value.trim()) {
      error.value = "Column name and label are required";
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(name.value.trim())) {
      error.value = "Column name must match ^[a-z][a-z0-9_]*$";
      return;
    }
    if (type.value === "select") {
      const p = parseOptions(options.value);
      if ((p as any).error) {
        error.value = (p as any).error;
        return;
      }
    }
    if (type.value === "relation") {
      if (!target.value) {
        error.value = "Pick a table to connect to";
        return;
      }
      if (!relationKey.value) {
        error.value = "Pick the key column from that table";
        return;
      }
    }
    save.mutate();
  }

  return {
    open,
    mode,
    name,
    label,
    type,
    required,
    options,
    target,
    relationKey,
    inDetail,
    originalName,
    error,
    editingField,
    parseOptions,
    openAdd,
    openEdit,
    save,
    submit,
  };
}
