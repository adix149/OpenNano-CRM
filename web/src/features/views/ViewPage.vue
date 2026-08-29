<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { api } from "@/lib/api";
import ViewCanvas from "./components/ViewCanvas.vue";
import CalendarView from "./components/CalendarView.vue";
import KanbanView from "./components/KanbanView.vue";

const route = useRoute();
const orgSlug = route.params.orgSlug as string;
const tableSlug = route.params.tableSlug as string;
const viewSlug = route.params.viewSlug as string;

const viewQuery = useQuery({ queryKey: ["view", orgSlug, tableSlug, viewSlug], queryFn: () => api.getView(orgSlug, tableSlug, viewSlug) });
const rowsQuery = useQuery({ queryKey: ["rows", orgSlug, tableSlug], queryFn: () => api.listRows(orgSlug, tableSlug) });

const view = computed(() => viewQuery.data.value as any);
const kind = computed(() => view.value?.kind ?? "form");
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-semibold">{{ view?.label ?? viewSlug }}</h1>
    <p class="text-sm text-muted-foreground">Kind: {{ kind }}</p>
    <ViewCanvas v-if="kind==='form' || kind==='page'" :layout="view?.layout" :fields="[]" />
    <CalendarView v-else-if="kind==='calendar'" :rows="rowsQuery.data.value ?? []" :date-field="view?.config?.dateField ?? 'created_at'" />
    <KanbanView v-else-if="kind==='kanban'" :rows="rowsQuery.data.value ?? []" :group-field="view?.config?.groupField ?? 'status'" />
    <div v-else class="border rounded p-4">View type {{ kind }} — coming soon</div>
  </div>
</template>
