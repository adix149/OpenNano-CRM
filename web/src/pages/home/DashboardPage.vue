<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import HierarchyCrumb from "@/components/HierarchyCrumb.vue";

const { user } = useAuth();
const hierarchy = useQuery({ queryKey: ["hierarchy"], queryFn: api.getHierarchy });
const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities });
const isAdmin = computed(() => user.value?.role === "admin");

const stats = computed(() => {
  const h = hierarchy.data.value;
  return {
    orgs: h?.orgs.length ?? 0,
    projects: h?.projects.length ?? 0,
    tables: (entitiesQuery.data.value ?? []).length,
  };
});

const tables = computed(() => entitiesQuery.data.value ?? []);
const projectCards = computed(() => {
  const h = hierarchy.data.value;
  if (!h) return [];
  return h.projects.map((project) => ({
    project,
    org: h.orgs.find((org) => org.id === project.orgId),
    tables: h.entities.filter((table) => table.projectId === project.id),
  }));
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-end justify-between gap-4">
      <div>
        <p class="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">CRM workspace</p>
        <h1 class="text-3xl font-semibold tracking-tight">Good to see you{{ user ? `, ${user.displayName.split(" ")[0]}` : "" }}.</h1>
        <p class="mt-1 text-sm text-muted-foreground">Choose a project, then open a table to work with records.</p>
      </div>
      <Button v-if="isAdmin" as-child>
        <RouterLink to="/dev">Open Dev Studio</RouterLink>
      </Button>
    </div>

    <section v-if="stats.orgs > 0" class="rounded-2xl border bg-gradient-to-br from-white via-white to-violet-50/70 p-5 shadow-sm">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Workspace map</p>
          <h2 class="mt-1 text-lg font-semibold">Organization <span class="text-muted-foreground">/</span> projects <span class="text-muted-foreground">/</span> tables</h2>
        </div>
        <RouterLink v-if="isAdmin" to="/admin/hierarchy" class="text-xs font-medium text-violet-700 hover:underline">Manage hierarchy →</RouterLink>
      </div>
      <div v-if="projectCards.length" class="grid gap-3 md:grid-cols-2">
        <div v-for="card in projectCards" :key="card.project.id" class="rounded-xl border bg-white/80 p-4">
          <div class="flex items-start gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 font-semibold text-violet-700">{{ card.project.name.slice(0, 1) }}</div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold">{{ card.project.name }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ card.org?.name }} · {{ card.tables.length }} table{{ card.tables.length === 1 ? '' : 's' }}</p>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <RouterLink v-for="table in card.tables" :key="table.id" :to="`/data/${table.slug}`" class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-emerald-100 hover:text-emerald-800">{{ table.label }}</RouterLink>
            <span v-if="card.tables.length === 0" class="text-xs text-muted-foreground">No tables in this project yet.</span>
          </div>
        </div>
      </div>
      <div v-else class="rounded-xl border border-dashed bg-white/60 p-5 text-sm text-muted-foreground">Create a project to start organizing your CRM tables.</div>
    </section>

    <div v-if="isAdmin" class="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader class="pb-2"><CardDescription>Organizations</CardDescription></CardHeader>
        <CardContent><span class="text-3xl font-semibold">{{ stats.orgs }}</span></CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2"><CardDescription>Projects</CardDescription></CardHeader>
        <CardContent><span class="text-3xl font-semibold">{{ stats.projects }}</span></CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2"><CardDescription>Tables</CardDescription></CardHeader>
        <CardContent><span class="text-3xl font-semibold">{{ stats.tables }}</span></CardContent>
      </Card>
    </div>

    <template v-if="stats.orgs === 0 && !hierarchy.isLoading.value">
      <Card class="border border-dashed p-6 text-center">
        <CardTitle class="text-lg font-medium mb-2">No organizations yet</CardTitle>
        <CardDescription>Create your first organization to get started</CardDescription>
        <div class="mt-4">
          <Button size="lg" as-child>
            <RouterLink to="/admin/hierarchy" class="underline">Create Organization</RouterLink>
          </Button>
        </div>
      </Card>
    </template>

    <Card v-if="stats.tables === 0 && stats.orgs > 0 && !hierarchy.isLoading.value">
      <CardHeader>
        <CardTitle>Get started</CardTitle>
        <CardDescription>Your workspace is empty — three steps to your first CRM record.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-2 text-sm">
        <template v-if="isAdmin">
          <div class="flex items-center gap-3 rounded-md border p-3">
            <span class="font-medium">1.</span>
            <span>Create an Organization and a Project in</span>
            <RouterLink to="/admin/hierarchy" class="underline">Hierarchy</RouterLink>
          </div>
          <div class="flex items-center gap-3 rounded-md border p-3">
            <span class="font-medium">2.</span>
            <span>Declare a table with fields in</span>
            <RouterLink to="/dev" class="underline">Dev Studio</RouterLink>
            <span class="text-muted-foreground">— the form builds itself</span>
          </div>
          <div class="flex items-center gap-3 rounded-md border p-3">
            <span class="font-medium">3.</span>
            <span>Pick the table in the sidebar and add records</span>
          </div>
        </template>
        <p v-else class="text-muted-foreground">
          Nothing has been shared with you yet. Your administrator sets up tables — they will appear here.
        </p>
      </CardContent>
    </Card>

    <div v-else-if="tables.length > 0">
      <h2 class="mb-3 text-sm font-medium uppercase text-muted-foreground">Tables</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink v-for="t in tables" :key="t.id" :to="`/data/${t.slug}`" class="group">
          <Card class="transition-colors group-hover:border-primary/50 h-full">
            <CardHeader class="pb-2">
              <CardTitle class="text-base">{{ t.label }}</CardTitle>
              <CardDescription><code>{{ t.slug }}</code></CardDescription>
            </CardHeader>
            <CardContent class="text-xs text-muted-foreground">
              <div class="mb-1"><HierarchyCrumb :org-id="t.orgId" :project-id="t.projectId" /></div>
              {{ t.fields.length }} field(s)
            </CardContent>
          </Card>
        </RouterLink>
      </div>
    </div>

    <Card v-if="isAdmin">
      <CardHeader class="pb-2">
        <CardTitle class="text-base">Admin shortcuts</CardTitle>
      </CardHeader>
      <CardContent class="flex gap-2">
        <Button variant="outline" size="sm" as-child><RouterLink to="/admin/hierarchy">Manage hierarchy</RouterLink></Button>
        <Button variant="outline" size="sm" as-child><RouterLink to="/admin/users">Manage users</RouterLink></Button>
      </CardContent>
    </Card>
  </div>
</template>
