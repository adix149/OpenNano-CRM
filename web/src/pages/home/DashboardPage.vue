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
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Welcome{{ user ? `, ${user.displayName}` : "" }}</h1>
        <p class="text-sm text-muted-foreground">Org → Project → Table → Record</p>
      </div>
      <Button v-if="isAdmin" as-child>
        <RouterLink to="/dev">Open Dev Studio</RouterLink>
      </Button>
    </div>

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

    <Card v-if="stats.tables === 0 && !hierarchy.isLoading.value">
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

    <div v-else>
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
