<script setup lang="ts">
import { watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { api } from "@/lib/api";
import { devProjectId, setDevProject } from "@/lib/devState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const route = useRoute();
const router = useRouter();
const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
const orgsQuery = useQuery({ queryKey: ["orgs"], queryFn: api.listOrgs });

watch(
  () => projectsQuery.data.value,
  (projects) => {
    if (projects && projects.length > 0 && !devProjectId.value) setDevProject(projects[0].id);
  },
  { immediate: true },
);

function projectLabel(id: number | null) {
  const p = (projectsQuery.data.value ?? []).find((x) => x.id === id);
  if (!p) return "";
  const org = (orgsQuery.data.value ?? []).find((o) => o.id === p.orgId);
  return org ? `${org.name} / ${p.name}` : p.name;
}

function onProjectChange(v: any) {
  const id = v === "none" ? null : Number(v);
  setDevProject(id);
  if (route.path !== "/dev") router.push("/dev");
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Dev Studio</h1>
        <p class="text-sm text-muted-foreground">Declare tables &amp; fields — Postgres columns and forms are generated for you.</p>
      </div>
      <div class="w-72">
        <Select
          :model-value="devProjectId ? String(devProjectId) : 'none'"
          @update:model-value="onProjectChange"
        >
          <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="p in projectsQuery.data.value ?? []" :key="p.id" :value="String(p.id)">
              {{ projectLabel(p.id) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <div v-if="(projectsQuery.data.value?.length ?? 0) === 0 && !projectsQuery.isLoading.value" class="rounded-md border border-dashed p-8 text-center">
      <p class="text-sm text-muted-foreground">
        No projects yet. Create an Organization and Project first in
        <RouterLink to="/admin/hierarchy" class="underline">Hierarchy</RouterLink>.
      </p>
    </div>

    <Button v-if="route.path !== '/dev'" variant="ghost" size="sm" as-child class="-ml-2">
      <RouterLink to="/dev">&larr; All tables</RouterLink>
    </Button>

    <RouterView />
  </div>
</template>
