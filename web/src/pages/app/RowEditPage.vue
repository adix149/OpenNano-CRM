<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { api, type Entity } from "@/lib/api";
import { toPayload } from "@/lib/entityMeta";
import DynamicForm from "@/components/DynamicForm.vue";
import LinkedRecords from "@/components/LinkedRecords.vue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const route = useRoute();
const router = useRouter();
const slug = route.params.slug as string;
const rowId = route.params.id ? Number(route.params.id) : null;
const isEdit = rowId !== null;

const error = ref("");
const queryClient = useQueryClient();

const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities });
const entity = computed<Entity | undefined>(() => entitiesQuery.data.value?.find((e) => e.slug === slug));

const orgSlug = computed(() => entity.value?.orgSlug ?? "");
const rowQuery = useQuery({
  queryKey: ["rows", orgSlug.value, slug, rowId],
  queryFn: () => api.getRow(orgSlug.value, slug, rowId!),
  enabled: isEdit && Boolean(orgSlug.value),
});

/** Tables connecting to this one — shown as "Linked records" on the record page. */
const incoming = computed(() =>
  !entity.value
    ? []
    : (entitiesQuery.data.value ?? [])
        .filter((e) => e.id !== entity.value!.id)
        .flatMap((e) => e.fields.filter((f) => f.relationEntityId === entity.value!.id).map((f) => ({ source: e, field: f }))),
);

const saveRow = useMutation({
  mutationFn: (payload: Record<string, unknown>) =>
    isEdit ? api.updateRow(orgSlug.value, slug, rowId!, payload) : api.createRow(orgSlug.value, slug, payload),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ["rows", orgSlug.value, slug] });
    router.push(`/data/${slug}`);
  },
  onError: (err) => (error.value = err.message),
});

function onSubmit(values: Record<string, unknown>) {
  if (!entity.value) return;
  saveRow.mutate(toPayload(entity.value.fields, values));
}
</script>

<template>
  <div class="mx-auto max-w-xl" v-if="entity && (!isEdit || rowQuery.data.value || rowQuery.isError.value)">
    <RouterLink :to="`/data/${slug}`" class="text-sm text-muted-foreground hover:underline">
      &larr; Back to {{ entity.label }}
    </RouterLink>
    <Card class="mt-3">
      <CardHeader>
        <CardTitle>{{ isEdit ? `Edit ${entity.label}` : `New ${entity.label}` }}</CardTitle>
      </CardHeader>
      <CardContent>
        <p v-if="error" class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {{ error }}
        </p>
        <DynamicForm
          :fields="entity.fields"
          :initial-row="rowQuery.data.value"
          :submit-label="isEdit ? 'Save changes' : 'Create'"
          @submit="onSubmit"
        >
          <template #actions>
            <Button type="button" variant="ghost" as-child>
              <RouterLink :to="`/data/${slug}`">Cancel</RouterLink>
            </Button>
          </template>
        </DynamicForm>
      </CardContent>
    </Card>

    <div v-if="isEdit && incoming.length > 0" class="space-y-4">
      <h2 class="text-sm font-medium uppercase text-muted-foreground">Linked records</h2>
      <Card v-for="item in incoming" :key="item.source.id + item.field.name" class="p-4">
        <LinkedRecords :source="item.source" :field="item.field" :record-id="rowId!" />
      </Card>
    </div>
  </div>
</template>
