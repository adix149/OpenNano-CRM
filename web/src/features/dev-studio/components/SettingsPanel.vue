<script setup lang="ts">
import { ref, watch } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { useRouter } from "vue-router";
import type { Entity } from "@/lib/api";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const props = defineProps<{ entity: Entity }>();
const router = useRouter();
const queryClient = useQueryClient();

const label = ref(props.entity.label);
const slug = ref(props.entity.slug);
const viewRole = ref(props.entity.viewRole ?? "viewer");
const editRole = ref(props.entity.editRole ?? "editor");
const error = ref("");

watch(
  () => props.entity,
  (e) => {
    label.value = e.label;
    slug.value = e.slug;
    viewRole.value = e.viewRole ?? "viewer";
    editRole.value = e.editRole ?? "editor";
  },
);

const save = useMutation({
  mutationFn: () => {
    const patch: Record<string, unknown> = {};
    if (label.value !== props.entity.label) patch.label = label.value.trim();
    if (slug.value !== props.entity.slug) patch.slug = slug.value.trim();
    if (viewRole.value !== (props.entity.viewRole ?? "viewer")) patch.viewRole = viewRole.value;
    if (editRole.value !== (props.entity.editRole ?? "editor")) patch.editRole = editRole.value;
    return api.updateEntity(props.entity.orgSlug!, props.entity.slug, patch);
  },
  onSuccess: async (updated) => {
    error.value = "";
    await queryClient.invalidateQueries({ queryKey: ["entities"] });
    if (updated.slug !== props.entity.slug) router.replace(`/dev/t/${updated.slug}`);
  },
  onError: (e: any) => (error.value = e.message),
});

const del = useMutation({
  mutationFn: () => api.deleteEntity(props.entity.orgSlug!, props.entity.slug),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ["entities"] });
    router.push("/dev");
  },
  onError: (e: any) => (error.value = e.message),
});
</script>

<template>
  <div class="max-w-xl space-y-4">
    <Card>
      <CardHeader><CardTitle class="text-base">Table settings</CardTitle></CardHeader>
      <CardContent class="space-y-4">
        <p v-if="error" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {{ error }}
        </p>
        <div class="space-y-1.5"><Label>Label</Label><Input v-model="label" /></div>
        <div class="space-y-1.5">
          <Label>Slug</Label><Input v-model="slug" />
          <p class="text-xs text-muted-foreground">Renaming the slug renames the Postgres table.</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <Label>Who can view</Label>
            <select v-model="viewRole" class="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="viewer">Viewer and up</option>
              <option value="editor">Editor and up</option>
              <option value="developer">Developer and up</option>
              <option value="admin">Admin only</option>
            </select>
          </div>
          <div class="space-y-1.5">
            <Label>Who can edit</Label>
            <select v-model="editRole" class="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="viewer">Viewer and up</option>
              <option value="editor">Editor and up</option>
              <option value="developer">Developer and up</option>
              <option value="admin">Admin only</option>
            </select>
          </div>
        </div>
        <Button size="sm" :disabled="save.isPending.value" @click="save.mutate()">Save changes</Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-base">API endpoints</CardTitle>
        <CardDescription>Everything here is instantly available over REST.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-1 font-mono text-xs text-muted-foreground">
        <div>GET /api/data/{{ entity.slug }}</div>
        <div>POST /api/data/{{ entity.slug }}</div>
        <div>GET /api/data/{{ entity.slug }}/:id</div>
        <div>PUT /api/data/{{ entity.slug }}/:id</div>
        <div>DELETE /api/data/{{ entity.slug }}/:id</div>
      </CardContent>
    </Card>

    <Card class="border-destructive/50">
      <CardHeader class="pb-2"><CardTitle class="text-base text-destructive">Danger zone</CardTitle></CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger as-child><Button variant="destructive" size="sm">Delete this table</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{{ entity.label }}”?</AlertDialogTitle>
              <AlertDialogDescription>Drops the Postgres table permanently.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction @click="del.mutate()">Delete forever</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  </div>
</template>
