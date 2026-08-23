<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { api, type Org } from "@/lib/api";
import { slugify } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const queryClient = useQueryClient();
const hierarchy = useQuery({ queryKey: ["hierarchy"], queryFn: api.getHierarchy });
const orgsList = useQuery({ queryKey: ["orgs"], queryFn: api.listOrgs });

// ── Create org dialog ──
const orgDlg = ref(false);
const orgName = ref("");
const orgSlug = ref("");
const orgSlugTouched = ref(false);
const orgDesc = ref("");
const orgError = ref("");

function onOrgName() {
  if (!orgSlugTouched.value) orgSlug.value = slugify(orgName.value);
}

function openOrgDialog() {
  orgName.value = "";
  orgSlug.value = "";
  orgSlugTouched.value = false;
  orgDesc.value = "";
  orgError.value = "";
  orgDlg.value = true;
}

const createOrg = useMutation({
  mutationFn: () =>
    api.createOrg({ slug: orgSlug.value.trim(), name: orgName.value.trim(), description: orgDesc.value.trim() || undefined }),
  onSuccess: async () => {
    orgDlg.value = false;
    await queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
    await queryClient.invalidateQueries({ queryKey: ["orgs"] });
  },
  onError: (e: any) => (orgError.value = e.message),
});

function submitOrg() {
  orgError.value = "";
  if (!orgName.value.trim() || !orgSlug.value.trim()) {
    orgError.value = "Name and slug are required";
    return;
  }
  createOrg.mutate();
}

// ── Create project dialog ──
const projDlg = ref(false);
const projOrgId = ref("");
const projName = ref("");
const projSlug = ref("");
const projSlugTouched = ref(false);
const projDesc = ref("");
const projError = ref("");

function openProjectDialog(org?: Org) {
  projName.value = "";
  projSlug.value = "";
  projSlugTouched.value = false;
  projDesc.value = "";
  projError.value = "";
  const first = orgsList.data.value?.[0];
  projOrgId.value = org ? String(org.id) : first ? String(first.id) : "";
  projDlg.value = true;
}

function onProjName() {
  if (!projSlugTouched.value) projSlug.value = slugify(projName.value);
}

const createProject = useMutation({
  mutationFn: () =>
    api.createProject(Number(projOrgId.value), {
      slug: projSlug.value.trim(),
      name: projName.value.trim(),
      description: projDesc.value.trim() || undefined,
    }),
  onSuccess: async () => {
    projDlg.value = false;
    await queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
  },
  onError: (e: any) => (projError.value = e.message),
});

function submitProject() {
  projError.value = "";
  if (!projOrgId.value) {
    projError.value = "Pick an organization";
    return;
  }
  if (!projName.value.trim() || !projSlug.value.trim()) {
    projError.value = "Name and slug are required";
    return;
  }
  createProject.mutate();
}

const tree = computed(() => {
  const h = hierarchy.data.value;
  if (!h) return [];
  return h.orgs.map((org) => ({
    org,
    projects: h.projects
      .filter((p) => p.orgId === org.id)
      .map((p) => ({ project: p, tables: h.entities.filter((e) => e.projectId === p.id) })),
  }));
});
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Hierarchy</h1>
        <p class="text-sm text-muted-foreground">Organization → Project → Table</p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" @click="openProjectDialog()">+ Project</Button>
        <Button size="sm" @click="openOrgDialog">+ Organization</Button>
      </div>
    </div>

    <p v-if="tree.length === 0 && !hierarchy.isLoading.value" class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      No organizations yet — create your first one to unlock projects and tables.
    </p>

    <Card v-for="node in tree" :key="node.org.id">
      <CardHeader class="pb-3">
        <div class="flex items-start justify-between">
          <div>
            <CardTitle class="flex items-center gap-2 text-base">
              {{ node.org.name }}
              <code class="text-xs text-muted-foreground">{{ node.org.slug }}</code>
            </CardTitle>
            <CardDescription>{{ node.org.description || "No description" }}</CardDescription>
          </div>
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="`/admin/orgs/${node.org.id}`">Open</RouterLink>
          </Button>
        </div>
      </CardHeader>
      <CardContent class="space-y-2">
        <div v-for="p in node.projects" :key="p.project.id" class="flex items-center gap-3 rounded-md border px-3 py-2">
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium">{{ p.project.name }}</div>
            <div class="truncate text-xs text-muted-foreground">
              <code>{{ p.project.slug }}</code> · {{ p.tables.length }} table(s)
              <template v-if="p.tables.length > 0">· {{ p.tables.map((t) => t.label).join(", ") }}</template>
            </div>
          </div>
          <Button variant="ghost" size="sm" as-child>
            <RouterLink :to="`/admin/projects/${p.project.id}`">Open</RouterLink>
          </Button>
        </div>
        <div v-if="node.projects.length === 0" class="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
          No projects yet.
          <button class="underline" @click="openProjectDialog(node.org)">Create one</button>
        </div>
      </CardContent>
    </Card>

    <!-- Org dialog -->
    <Dialog v-model:open="orgDlg">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>New organization</DialogTitle>
          <DialogDescription>Top-level tenant.</DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <p v-if="orgError" class="text-sm text-destructive">{{ orgError }}</p>
          <div class="space-y-1.5">
            <Label>Name</Label>
            <Input v-model="orgName" placeholder="Acme Corp" @input="onOrgName" />
          </div>
          <div class="space-y-1.5">
            <Label>Slug</Label>
            <Input v-model="orgSlug" placeholder="acme" @input="orgSlugTouched = true" />
          </div>
          <div class="space-y-1.5">
            <Label>Description</Label>
            <Textarea v-model="orgDesc" placeholder="What this organization is for" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="orgDlg = false">Cancel</Button>
          <Button :disabled="createOrg.isPending.value" @click="submitOrg">Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Project dialog -->
    <Dialog v-model:open="projDlg">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>A container for tables inside one organization.</DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <p v-if="projError" class="text-sm text-destructive">{{ projError }}</p>
          <div class="space-y-1.5">
            <Label>Organization</Label>
            <Select v-model="projOrgId">
              <SelectTrigger class="w-full"><SelectValue placeholder="Pick organization" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="o in orgsList.data.value ?? []" :key="o.id" :value="String(o.id)">
                  {{ o.name }} ({{ o.slug }})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1.5">
            <Label>Name</Label>
            <Input v-model="projName" placeholder="Sales CRM" @input="onProjName" />
          </div>
          <div class="space-y-1.5">
            <Label>Slug</Label>
            <Input v-model="projSlug" placeholder="sales" @input="projSlugTouched = true" />
          </div>
          <div class="space-y-1.5">
            <Label>Description</Label>
            <Textarea v-model="projDesc" placeholder="What this project tracks" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="projDlg = false">Cancel</Button>
          <Button :disabled="createProject.isPending.value" @click="submitProject">Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
