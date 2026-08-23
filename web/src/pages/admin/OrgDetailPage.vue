<script setup lang="ts">
import { ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isBuilder } from "@/lib/personas";
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
const orgId = Number(route.params.id);
const queryClient = useQueryClient();

const orgQuery = useQuery({ queryKey: ["org", orgId], queryFn: () => api.getOrg(orgId) });
const { user: me } = useAuth();
const canManageAccess = () => isBuilder(me.value?.role);
const hierarchy = useQuery({ queryKey: ["hierarchy"], queryFn: api.getHierarchy });

const tablesFor = (projectId: number) =>
  (hierarchy.data.value?.entities ?? []).filter((e) => e.projectId === projectId);

// ── Edit ──
const editName = ref("");
const editSlug = ref("");
const editDesc = ref("");
const editError = ref("");

watch(
  () => orgQuery.data.value,
  (org) => {
    if (org && !editName.value) {
      editName.value = org.name;
      editSlug.value = org.slug;
      editDesc.value = org.description ?? "";
    }
  },
  { immediate: true },
);

const updateOrg = useMutation({
  mutationFn: () => {
    const patch: Record<string, unknown> = {};
    if (editName.value !== orgQuery.data.value!.name) patch.name = editName.value.trim();
    if (editSlug.value !== orgQuery.data.value!.slug) patch.slug = editSlug.value.trim();
    if (editDesc.value !== (orgQuery.data.value!.description ?? "")) patch.description = editDesc.value;
    return api.updateOrg(orgId, patch);
  },
  onSuccess: async () => {
    editError.value = "";
    await queryClient.invalidateQueries({ queryKey: ["org"] });
    await queryClient.invalidateQueries({ queryKey: ["orgs"] });
    await queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
  },
  onError: (e: any) => (editError.value = e.message),
});

// ── Access & permissions settings ──
const defView = ref("viewer");
const defEdit = ref("editor");
const accessError = ref("");
const accessSaved = ref(false);

watch(
  () => orgQuery.data.value,
  (o) => {
    if (o) {
      defView.value = o.defaultViewRole ?? "viewer";
      defEdit.value = o.defaultEditRole ?? "editor";
    }
  },
  { immediate: true },
);

const updateAccess = useMutation({
  mutationFn: () =>
    api.updateOrg(orgId, {
      name: orgQuery.data.value!.name,
      description: orgQuery.data.value!.description ?? undefined,
      defaultViewRole: defView.value,
      defaultEditRole: defEdit.value,
    } as any),
  onSuccess: async () => {
    accessError.value = "";
    accessSaved.value = true;
    setTimeout(() => (accessSaved.value = false), 2000);
    await queryClient.invalidateQueries({ queryKey: ["org"] });
  },
  onError: (e: any) => (accessError.value = e.message),
});

const deleteOrg = useMutation({
  mutationFn: () => api.deleteOrg(orgId),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
    router.push("/admin/hierarchy");
  },
  onError: (e: any) => (editError.value = e.message),
});
</script>

<template>
  <div class="space-y-5" v-if="orgQuery.data.value">
    <div>
      <RouterLink to="/admin/hierarchy" class="text-sm text-muted-foreground hover:underline">&larr; Hierarchy</RouterLink>
      <h1 class="mt-1 text-2xl font-semibold tracking-tight">{{ orgQuery.data.value.name }}</h1>
      <p class="text-sm text-muted-foreground"><code>{{ orgQuery.data.value.slug }}</code></p>
    </div>

    <div class="grid items-start gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle class="text-base">Organization details</CardTitle></CardHeader>
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
          <Button size="sm" :disabled="updateOrg.isPending.value" @click="updateOrg.mutate()">Save changes</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-base">Projects</CardTitle>
          <CardDescription>Containers for tables inside this organization.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-2">
          <RouterLink
            v-for="p in orgQuery.data.value.projects ?? []"
            :key="p.id"
            :to="`/admin/projects/${p.id}`"
            class="block rounded-md border px-3 py-2 transition-colors hover:border-primary/50"
          >
            <div class="text-sm font-medium">{{ p.name }}</div>
            <div class="text-xs text-muted-foreground">
              <code>{{ p.slug }}</code> · {{ tablesFor(p.id).length }} table(s)
            </div>
          </RouterLink>
          <p v-if="(orgQuery.data.value.projects ?? []).length === 0" class="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            No projects yet.
          </p>
          <Button variant="outline" size="sm" as-child class="w-full">
            <RouterLink to="/admin/hierarchy">Create project from Hierarchy page</RouterLink>
          </Button>
        </CardContent>
      </Card>
    </div>

    <Card v-if="canManageAccess()" class="max-w-xl">
      <CardHeader class="pb-2">
        <CardTitle class="text-base">Access &amp; permissions</CardTitle>
        <CardDescription>Default personas applied to new tables in this org. Developers and admins can change these.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-3">
        <p v-if="accessError" class="text-sm text-destructive">{{ accessError }}</p>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <Label>Default view access</Label>
            <select v-model="defView" class="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="viewer">Viewer — anyone can read</option>
              <option value="editor">Editor</option>
              <option value="developer">Developer</option>
              <option value="admin">Admin only</option>
            </select>
          </div>
          <div class="space-y-1.5">
            <Label>Default record editing</Label>
            <select v-model="defEdit" class="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="viewer">Viewer — anyone can edit</option>
              <option value="editor">Editor and up</option>
              <option value="developer">Developer and up</option>
              <option value="admin">Admin only</option>
            </select>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <Button size="sm" :disabled="updateAccess.isPending.value" @click="updateAccess.mutate()">Save defaults</Button>
          <span v-if="accessSaved" class="text-sm text-muted-foreground">Saved.</span>
        </div>
      </CardContent>
    </Card>

    <Card class="border-destructive/50 max-w-xl">
      <CardHeader class="pb-2">
        <CardTitle class="text-base text-destructive">Danger zone</CardTitle>
        <CardDescription>Deleting removes the org and every project under it.</CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger as-child>
            <Button variant="destructive" size="sm">Delete organization</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{{ orgQuery.data.value.name }}”?</AlertDialogTitle>
              <AlertDialogDescription>All its projects cascade-delete. Tables are unassigned.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction @click="deleteOrg.mutate()">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  </div>
</template>
