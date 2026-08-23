<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { api, type Entity } from "@/lib/api";
import { Button } from "@/components/ui/button";
import DataRowsTable from "@/components/DataRowsTable.vue";
import HierarchyCrumb from "@/components/HierarchyCrumb.vue";
import { useAuth } from "@/lib/auth";
import { hasPersona } from "@/lib/personas";

const route = useRoute();
const slug = route.params.slug as string;

const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities });
const { user } = useAuth();
const entity = computed<Entity | undefined>(() => entitiesQuery.data.value?.find((e) => e.slug === slug));
</script>

<template>
  <div class="space-y-4" v-if="entity">
    <div class="flex items-center justify-between">
      <div>
        <HierarchyCrumb :org-id="entity.orgId" :project-id="entity.projectId" />
        <h1 class="text-2xl font-semibold tracking-tight">{{ entity.label }}</h1>
        <p class="text-sm text-muted-foreground"><code>{{ entity.slug }}</code></p>
      </div>
      <Button v-if="hasPersona(user?.role, entity.editRole ?? 'editor')" as-child>
        <RouterLink :to="`/data/${slug}/new`">New {{ entity.label }}</RouterLink>
      </Button>
    </div>
    <DataRowsTable :entity="entity" :key="entity.id" />
  </div>
  <p v-else-if="!entitiesQuery.isLoading.value" class="text-sm text-muted-foreground">Table not found.</p>
</template>
