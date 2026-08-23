<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const route = useRoute();
const router = useRouter();
const projectId = Number(route.params.id);
const queryClient = useQueryClient();

const projectQuery = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId) });
const orgsQuery = useQuery({ queryKey: ["orgs"], queryFn: api.listOrgs });
const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities });

const project = computed(() => projectQuery.data.value);
const tables = computed(() => (entitiesQuery.data.value ?? []).filter((e) => e.projectId === projectId));
const orgName = computed(() => orgsQuery.data.value?.find((o) => o.id === project.value?.orgId)?.name ?? "");

// ── Edit ──
const editName = ref("");
const editSlug = ref("");
const editDesc = ref("");
const editError = ref("");

watch(
  () => project.value,
  (p) => {
    if (p && !editName.value) {
      editName.value = p.name;
      editSlug.value = p.slug;
      editDesc.value = p.description ?? "";
    }
  },
  { immediate: true },
);

const updateProject = useMutation({
  mutationFn: () => {
    const patch: Record<string, unknown> = {};
    if (editName.value !== project.value!.name) patch.name = editName.value.trim();
    if (editSlug.value !== project.value!.slug) patch.slug = editSlug.value.trim();
    if (editDesc.value !== (project.value!.description ?? "")) patch.description = editDesc.value;
    return api.updateProject(projectId, patch);
  },
  onSuccess: async () => {
    editError.value = "";
    await queryClient.invalidateQueries({ queryKey: ["project"] });
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
    await queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
  },
  onError: (e: any) => (editError.value = e.message),
});

const deleteProject = useMutation({
  mutationFn: () => api.deleteProject(projectId),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
    await queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
    if (project.value) router.push(`/admin/orgs/${project.value.orgId}`);
    else router.push("/admin/hierarchy");
  },
  onError: (e: any) => (editError.value = e.message),
});
</script>

<template>
  <div class="space-y-5" v-if="project">
    <div>
      <RouterLink :to="`/admin/orgs/${project.orgId}`" class="text-sm text-muted-foreground hover:underline">
        &larr; {{ orgName }}
      </RouterLink>
      <div class="mt-1 flex items-center gap-3">
        <h1 class="text-2xl font-semibold tracking-tight">{{ project.name }}</h1>
        <Button variant="outline" size="sm" as-child>
          <RouterLink to="/dev">Open in Dev Studio</RouterLink>
        </Button>
      </div>
      <p class="text-sm text-muted-foreground"><code>{{ project.slug }}</code></p>
    </div>

    <div class="grid items-start gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle class="text-base">Project details</CardTitle></CardHeader>
        <CardContent class="space-y-3">
          <p v-if="editError" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ editError }}
          </p>
          <div class="space-y-1.5">
            <Label>Name</Label>
            <Input v-model="editName" />
          </div>
          <div class="space-y-1.5">
            <Label>Slug</Label>
            <Input v-model="editSlug" />
          </div>
          <div class="space-y-1.5">
            <Label>Description</Label>
            <Textarea v-model="editDesc" :rows="3" />
          </div>
          <Button size="sm" :disabled="updateProject.isPending.value" @click="updateProject.mutate()">Save changes</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-base">Tables</CardTitle>
          <CardDescription>Declared inside this project. Forms build automatically.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-2">
          <RouterLink
            v-for="t in tables"
            :key="t.id"
            :to="`/dev/t/${t.slug}`"
            class="block rounded-md border px-3 py-2 transition-colors hover:border-primary/50"
          >
            <div class="text-sm font-medium">{{ t.label }}</div>
            <div class="text-xs text-muted-foreground"><code>{{ t.slug }}</code> · {{ t.fields.length }} field(s)</div>
          </RouterLink>
          <p v-if="tables.length === 0 && !entitiesQuery.isLoading.value" class="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            No tables yet — create them in Dev Studio.
          </p>
          <Button variant="outline" size="sm" as-child class="w-full">
            <RouterLink to="/dev">Go to Dev Studio</RouterLink>
          </Button>
        </CardContent>
      </Card>
    </div>

    <Card class="border-destructive/50 max-w-xl">
      <CardHeader class="pb-2">
        <CardTitle class="text-base text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger as-child>
            <Button variant="destructive" size="sm">Delete project</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{{ project.name }}”?</AlertDialogTitle>
              <AlertDialogDescription>Its entity definitions are removed; the org stays.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction @click="deleteProject.mutate()">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  </div>

  <p v-else-if="!projectQuery.isLoading.value" class="text-sm text-muted-foreground">Project not found.</p>
</template>
