<script setup lang="ts">
import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Renders the strict ownership path of a table: Org › Project | Organization-wide */
const props = defineProps<{ orgId?: number | null; projectId?: number | null }>();

const { user } = useAuth();
const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: api.listOrgs });
const projectsQ = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

const label = computed(() => {
  const org = (orgsQ.data.value ?? []).find((o) => o.id === props.orgId);
  if (!org) return "";
  const project = (projectsQ.data.value ?? []).find((p) => p.id === props.projectId);
  return `${org.name} › ${project?.name ?? "Organization-wide"}`;
});
</script>

<template>
  <span v-if="user?.role === 'admin'" class="text-xs text-muted-foreground">{{ label }}</span>
</template>
