<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { api, type Entity, type EntityField } from "@/lib/api";
import { rowDisplayLabel } from "@/lib/format";

/** Shows rows of `source` whose connection key points at a given record. */
const props = defineProps<{
  source: Entity;
  field: EntityField;
  recordId: number;
}>();

const rowsQuery = useQuery({
  queryKey: computed(() => ["rows", props.source.orgSlug ?? "", props.source.slug]),
  queryFn: () => api.listRows(props.source.orgSlug!, props.source.slug),
  enabled: computed(() => Boolean(props.source.orgSlug)),
});

const linked = computed(() => {
  const key = props.field.relationFieldName ?? "id";
  return (rowsQuery.data.value ?? []).filter((r) => Number(r[key]) === props.recordId);
});

function label(row: Record<string, unknown>): string {
  return rowDisplayLabel(props.source, row);
}
</script>

<template>
  <div class="space-y-1.5">
    <div class="text-sm font-medium">
      {{ source.label }}
      <span class="font-normal text-muted-foreground">via {{ field.label }}</span>
    </div>
    <ul v-if="linked.length > 0" class="space-y-0.5">
      <li v-for="row in linked" :key="row.id">
        <RouterLink :to="`/data/${source.slug}/${row.id}/edit`" class="text-sm underline-offset-2 hover:underline">
          {{ label(row) }}
        </RouterLink>
        <span class="ml-1 text-xs text-muted-foreground">#{{ row.id }}</span>
      </li>
    </ul>
    <p v-else class="text-sm text-muted-foreground">No linked records.</p>
  </div>
</template>
