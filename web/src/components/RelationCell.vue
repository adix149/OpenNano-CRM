<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { api } from "@/lib/api";
import { rowDisplayLabel } from "@/lib/format";

/** Renders a connection-key cell as a link labelled by the target record. */
const props = defineProps<{ targetId?: number | null; value: unknown }>();

const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities });

const target = computed(() =>
  props.targetId ? entitiesQuery.data.value?.find((e) => e.id === props.targetId) : undefined,
);

// Query keys are shared across all cells pointing at the same table, so the
// rows are fetched once per target regardless of how many cells render.
const rowsQuery = useQuery({
  queryKey: computed(() => ["rows", target.value?.orgSlug ?? "", target.value?.slug ?? ""]),
  queryFn: () => api.listRows(target.value!.orgSlug!, target.value!.slug),
  enabled: computed(() => Boolean(target.value) && props.value !== null && props.value !== undefined && props.value !== ""),
});

const label = computed(() => {
  const id = Number(props.value);
  if (!target.value || Number.isNaN(id)) return "—";
  const row = (rowsQuery.data.value ?? []).find((r) => r.id === id);
  return rowDisplayLabel(target.value, row) || `#${id}`;
});
</script>

<template>
  <RouterLink
    v-if="target && value !== null && value !== undefined && value !== ''"
    :to="`/data/${target.slug}/${Number(value)}/edit`"
    class="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
    :title="`Open ${target.label} record ${label}`"
  >
    <span class="truncate">{{ label }}</span>
    <span class="text-[10px] opacity-60">↗</span>
  </RouterLink>
  <span v-else class="text-muted-foreground">—</span>
</template>
