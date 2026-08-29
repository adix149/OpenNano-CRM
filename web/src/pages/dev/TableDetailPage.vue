<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { api, type Entity, type EntityField, type FieldType } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import DynamicForm from "@/components/DynamicForm.vue";
import DataRowsTable from "@/components/DataRowsTable.vue";
import HierarchyCrumb from "@/components/HierarchyCrumb.vue";
import FieldTypePicker from "@/components/dev/FieldTypePicker.vue";

import { RouterLink } from "vue-router";

const props = defineProps<{ slug: string }>();
const router = useRouter();
const queryClient = useQueryClient();

const tab = ref<"fields" | "data" | "templates" | "settings">("fields");

const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities });
const entity = computed<Entity | undefined>(() => entitiesQuery.data.value?.find((e) => e.slug === props.slug));
const viewsQuery = useQuery({
  queryKey: ["views", entity.value?.orgSlug ?? "", props.slug],
  queryFn: () => api.listViews(entity.value!.orgSlug!, props.slug),
  enabled: computed(() => Boolean(entity.value?.orgSlug)),
});

const templateLabel = ref("Record profile");
const templateSlug = ref("record_profile");
const templateError = ref("");
const templateFields = ref<string[]>([]);
const availableTemplateFields = computed(() => entity.value?.fields ?? []);

function toggleTemplateField(name: string) {
  templateFields.value = templateFields.value.includes(name)
    ? templateFields.value.filter((field) => field !== name)
    : [...templateFields.value, name];
}

const createTemplate = useMutation({
  mutationFn: () => api.createView(entity.value!.orgSlug!, props.slug, {
    slug: templateSlug.value.trim(),
    label: templateLabel.value.trim(),
    kind: "pdf",
    layout: {
      sections: [{
        id: "details",
        title: "Record details",
        cols: 2,
        fields: templateFields.value.map((name) => ({
          name,
          label: entity.value!.fields.find((field) => field.name === name)?.label,
          span: 6,
          hidden: false,
        })),
      }],
    },
  }),
  onSuccess: async () => {
    templateError.value = "";
    await queryClient.invalidateQueries({ queryKey: ["views"] });
    templateLabel.value = "Record profile";
    templateSlug.value = "record_profile";
    templateFields.value = [];
  },
  onError: (error) => (templateError.value = error.message),
});

function submitTemplate() {
  templateError.value = "";
  if (!templateLabel.value.trim() || !templateSlug.value.trim()) {
    templateError.value = "Template name and slug are required";
    return;
  }
  if (!templateFields.value.length) {
    templateError.value = "Select at least one table field";
    return;
  }
  createTemplate.mutate();
}

const previewKey = computed(() => (entity.value?.fields ?? []).map((f) => `${f.name}:${f.type}:${f.isRequired}`).join("|"));

// ── Add / edit field dialog ──

const dlgOpen = ref(false);
const dlgMode = ref<"add" | "edit">("add");
const fName = ref("");
const fLabel = ref("");
const fType = ref<FieldType>("text");
const fRequired = ref(false);
const fOptions = ref("");
const fTarget = ref("");
const fRelationKey = ref("");
const fInDetail = ref(true);
const originalName = ref("");
const dlgError = ref("");

function parseOptions(text: string): { values?: string[]; error?: string } {
  const values = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (values.length === 0) return { error: "At least one option is required" };
  if (new Set(values).size !== values.length) return { error: "Options must be unique" };
  return { values };
}

function openAdd() {
  dlgMode.value = "add";
  fName.value = "";
  fLabel.value = "";
  fType.value = "text";
  fRequired.value = false;
  fOptions.value = "";
  fTarget.value = "";
  fRelationKey.value = "";
  fInDetail.value = true;
  originalName.value = "";
  dlgError.value = "";
  dlgOpen.value = true;
}

/** Connection targets exclude the current table itself. */
const relationTargets = computed(() => (entitiesQuery.data.value ?? []).filter((e) => e.id !== entity.value?.id));

function targetFields(slug: string): EntityField[] {
  return entitiesQuery.data.value?.find((e) => e.slug === slug)?.fields ?? [];
}

function relationSlugOf(f: EntityField): string {
  if (!f.relationEntityId) return "";
  return entitiesQuery.data.value?.find((e) => e.id === f.relationEntityId)?.slug ?? "";
}

function openEdit(f: EntityField) {
  dlgMode.value = "edit";
  originalName.value = f.name;
  fName.value = f.name;
  fLabel.value = f.label;
  fType.value = f.type;
  fRequired.value = f.isRequired;
  fOptions.value = (f.options ?? []).join("\n");
  fTarget.value = relationSlugOf(f);
  fRelationKey.value = f.relationFieldName ?? "";
  fInDetail.value = f.inDetail ?? true;
  dlgError.value = "";
  dlgOpen.value = true;
}

const saveField = useMutation({
  mutationFn: () => {
    const base = {
      name: fName.value.trim(),
      label: fLabel.value.trim(),
      type: fType.value,
      is_required: fRequired.value,
      in_detail: fInDetail.value,
    };
    if (dlgMode.value === "add") {
      return api.addField(entity.value!.orgSlug!, props.slug, {
        ...base,
        ...(fType.value === "select" ? { options: parseOptions(fOptions.value).values! } : {}),
        ...(fType.value === "relation" && fTarget.value
          ? { relationEntitySlug: fTarget.value, relationFieldName: fRelationKey.value }
          : {}),
      });
    }
    return api.updateField(entity.value!.orgSlug!, props.slug, originalName.value, {
      ...base,
      ...(fType.value === "select"
        ? { options: parseOptions(fOptions.value).values! }
        : {}),
      ...(fType.value === "relation" && fTarget.value
        ? { relationEntitySlug: fTarget.value, relationFieldName: fRelationKey.value }
        : {}),
    });
  },
  onSuccess: async () => {
    dlgOpen.value = false;
    await queryClient.invalidateQueries({ queryKey: ["entities"] });
  },
  onError: (err) => (dlgError.value = err.message),
});

function submitField() {
  dlgError.value = "";
  if (!fName.value.trim() || !fLabel.value.trim()) {
    dlgError.value = "Column name and label are required";
    return;
  }
  if (!/^[a-z][a-z0-9_]*$/.test(fName.value.trim())) {
    dlgError.value = "Column name must match ^[a-z][a-z0-9_]*$";
    return;
  }
  if (fType.value === "select") {
    const parsed = parseOptions(fOptions.value);
    if (parsed.error) {
      dlgError.value = parsed.error;
      return;
    }
  }
  if (fType.value === "relation") {
    if (!fTarget.value) {
      dlgError.value = "Pick a table to connect to";
      return;
    }
    if (!fRelationKey.value) {
      dlgError.value = "Pick the key column from that table";
      return;
    }
  }
  saveField.mutate();
}

const deleteField = useMutation({
  mutationFn: (payload: { name: string; reassignTo?: string }) =>
    api.deleteField(entity.value!.orgSlug!, props.slug, payload.name, payload.reassignTo),
  onSuccess: async () => {
    delOpen.value = false;
    await queryClient.invalidateQueries({ queryKey: ["entities"] });
  },
  onError: (err) => (delError.value = err.message),
});

/** Connections in other tables that use one of this table's columns as their key. */
function connectionsUsing(name: string) {
  return (entitiesQuery.data.value ?? []).flatMap((e) =>
    e.fields
      .filter((f) => f.relationEntityId === entity.value?.id && f.relationFieldName === name)
      .map((f) => ({ fromLabel: e.label, fromSlug: e.slug, fieldName: f.name })),
  );
}

/** All incoming connections pointing at this table (reverse visibility). */
const referencedBy = computed(() =>
  (entitiesQuery.data.value ?? []).flatMap((e) =>
    e.fields
      .filter((f) => f.relationEntityId === entity.value?.id)
      .map((f) => ({ fromLabel: e.label, fromSlug: e.slug, fieldName: f.name, key: f.relationFieldName ?? "id" })),
  ),
);

// ── Delete-field dialog with connection warning ──
const delOpen = ref(false);
const delTarget = ref<EntityField | null>(null);
const delReassign = ref("");
const delError = ref("");

const delAffected = computed(() =>
  delTarget.value && entity.value ? connectionsUsing(delTarget.value.name) : [],
);

const replacementOptions = computed(() => {
  if (!entity.value || !delTarget.value) return [];
  return entity.value.fields.filter((f) => f.name !== delTarget.value!.name);
});

function openDelete(f: EntityField) {
  delTarget.value = f;
  delError.value = "";
  const others = replacementOptions.value;
  const firstText = others.find((x) => ["text", "email", "phone", "select"].includes(x.type));
  delReassign.value = firstText?.name ?? "__id__";
  delOpen.value = true;
}

function confirmDelete() {
  if (!delTarget.value) return;
  deleteField.mutate({ name: delTarget.value.name, reassignTo: delAffected.value.length > 0 ? delReassign.value : undefined });
}

// ── Settings tab ──

const setLabel = ref("");
const setSlug = ref("");
const setViewRole = ref("viewer");
const setEditRole = ref("editor");
const settingsError = ref("");

watch([tab, entity], ([t, ent]) => {
  if (t === "settings" && ent) {
    setLabel.value = ent.label;
    setSlug.value = ent.slug;
    setViewRole.value = ent.viewRole ?? "viewer";
    setEditRole.value = ent.editRole ?? "editor";
    settingsError.value = "";
  }
});

const updateEntity = useMutation({
  mutationFn: () => {
    const patch: Record<string, unknown> = {};
    if (setLabel.value !== entity.value!.label) patch.label = setLabel.value.trim();
    if (setSlug.value !== entity.value!.slug) patch.slug = setSlug.value.trim();
    if (setViewRole.value !== (entity.value!.viewRole ?? "viewer")) patch.viewRole = setViewRole.value;
    if (setEditRole.value !== (entity.value!.editRole ?? "editor")) patch.editRole = setEditRole.value;
    return api.updateEntity(entity.value!.orgSlug!, entity.value!.slug, patch);
  },
  onSuccess: async (updated) => {
    settingsError.value = "";
    await queryClient.invalidateQueries({ queryKey: ["entities"] });
    if (updated.slug !== props.slug) router.replace(`/dev/t/${updated.slug}`);
  },
  onError: (err) => (settingsError.value = err.message),
});

const deleteEntity = useMutation({
  mutationFn: () => api.deleteEntity(entity.value!.orgSlug!, entity.value!.slug),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ["entities"] });
    router.push("/dev");
  },
  onError: (err) => (settingsError.value = err.message),
});

const typeBadgeVariant = (t: string) => (t === "relation" ? "default" : t === "select" ? "secondary" : "outline") as
  | "default"
  | "secondary"
  | "outline";
</script>

<template>
  <div v-if="entity">
    <div class="flex items-center justify-between gap-4">
      <div>
        <HierarchyCrumb :org-id="entity.orgId" :project-id="entity.projectId" />
        <h2 class="text-lg font-semibold tracking-tight">{{ entity.label }}</h2>
        <p class="text-sm text-muted-foreground"><code>{{ entity.slug }}</code> · {{ entity.fields.length }} field(s)</p>
      </div>
      <div class="flex gap-1 rounded-md border p-1">
        <Button v-for="t in (['fields', 'data', 'templates', 'settings'] as const)" :key="t"
          :variant="tab === t ? 'secondary' : 'ghost'" size="sm" class="capitalize" @click="tab = t">
          {{ t }}
        </Button>
      </div>
    </div>

    <!-- FIELDS TAB -->
    <div v-if="tab === 'fields'" class="mt-5 grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader class="flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle class="text-base">Fields</CardTitle>
            <CardDescription>Each field becomes a real Postgres column.</CardDescription>
          </div>
          <Button size="sm" @click="openAdd">+ Add field</Button>
        </CardHeader>
        <CardContent class="space-y-2">
          <p v-if="dlgError && !dlgOpen" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ dlgError }}
          </p>
          <p v-if="entity.fields.length === 0" class="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No fields yet. Add your first field — try Text or a Connection Key.
          </p>
          <div v-for="f in entity.fields" :key="f.id" class="flex items-center gap-3 rounded-md border px-3 py-2">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium">{{ f.label }}</span>
                <span v-if="f.isRequired" class="text-xs text-destructive">*</span>
              </div>
              <div class="truncate text-xs text-muted-foreground">
                <code>{{ f.name }}</code>
                <template v-if="f.type === 'relation'">
                  → {{ entitiesQuery.data.value?.find((e) => e.id === f.relationEntityId)?.label ?? "?" }}
                </template>
                <template v-else-if="f.type === 'select'"> · {{ (f.options ?? []).length }} option(s)</template>
              </div>
            </div>
            <Badge :variant="typeBadgeVariant(f.type)">
              {{ f.type === "relation" ? "connection" : f.type }}
            </Badge>
            <div class="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" @click="openEdit(f)">Edit</Button>
              <Button variant="ghost" size="sm" class="text-destructive" @click="openDelete(f)">Delete</Button>
            </div>
          </div>

          <div v-if="referencedBy.length > 0" class="rounded-md border bg-muted/40 p-3">
            <div class="mb-1 text-xs font-medium uppercase text-muted-foreground">Referenced by</div>
            <div v-for="r in referencedBy" :key="r.fromSlug + r.fieldName" class="py-0.5 text-sm">
              <RouterLink :to="`/dev/t/${r.fromSlug}`" class="underline-offset-2 hover:underline">{{ r.fromLabel }}.{{ r.fieldName }}</RouterLink>
              <span class="text-muted-foreground"> · displays {{ r.key }}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card class="lg:sticky lg:top-0">
        <CardHeader class="pb-3">
          <CardTitle class="text-base">Live form preview</CardTitle>
          <CardDescription>This is the form your users get — it updates as you edit fields.</CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="entity.fields.length === 0" class="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            The auto-built form appears here once you add fields.
          </div>
          <DynamicForm v-else :key="previewKey" :fields="entity.fields" disabled submit-label="Preview only" />
        </CardContent>
      </Card>
    </div>

    <!-- DATA TAB -->
    <div v-else-if="tab === 'data'" class="mt-5">
      <DataRowsTable :entity="entity" />
    </div>

    <!-- PDF TEMPLATES TAB -->
    <div v-else-if="tab === 'templates'" class="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Advanced record views</CardTitle>
          <CardDescription>Choose fields from {{ entity.label }} to build a printable PDF profile.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <p v-if="templateError" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ templateError }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-1.5"><Label>Template name</Label><Input v-model="templateLabel" placeholder="Customer profile" /></div>
            <div class="space-y-1.5"><Label>Template slug</Label><Input v-model="templateSlug" placeholder="customer_profile" /></div>
          </div>
          <div>
            <Label>Fields in the PDF</Label>
            <div class="mt-2 grid gap-2 sm:grid-cols-2">
              <label v-for="field in availableTemplateFields" :key="field.id" class="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition hover:bg-muted/50">
                <input type="checkbox" :checked="templateFields.includes(field.name)" @change="toggleTemplateField(field.name)" />
                <span class="min-w-0"><span class="block text-sm font-medium">{{ field.label }}</span><span class="block text-xs text-muted-foreground">{{ field.type }}</span></span>
              </label>
            </div>
          </div>
          <Button :disabled="createTemplate.isPending.value" @click="submitTemplate">{{ createTemplate.isPending.value ? 'Creating…' : 'Create PDF template' }}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2"><CardTitle class="text-base">Saved templates</CardTitle></CardHeader>
        <CardContent class="space-y-2">
          <div v-for="view in viewsQuery.data.value ?? []" :key="view.id" class="rounded-lg border p-3">
            <div class="font-medium">{{ view.label }}</div>
            <div class="text-xs text-muted-foreground"><code>{{ view.slug }}</code> · {{ view.kind }}</div>
          </div>
          <p v-if="!viewsQuery.data.value?.length" class="text-sm text-muted-foreground">No templates yet.</p>
        </CardContent>
      </Card>
    </div>

    <!-- SETTINGS TAB -->
    <div v-else class="mt-5 max-w-xl space-y-4">
      <Card>
        <CardHeader><CardTitle class="text-base">Table settings</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <p v-if="settingsError" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ settingsError }}
          </p>
          <div class="space-y-1.5">
            <Label>Label</Label>
            <Input v-model="setLabel" />
          </div>
          <div class="space-y-1.5">
            <Label>Slug</Label>
            <Input v-model="setSlug" />
            <p class="text-xs text-muted-foreground">Renaming the slug renames the Postgres table and every API route.</p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>Who can view records</Label>
              <select v-model="setViewRole" class="h-9 w-full rounded-md border bg-background px-3 text-sm">
                <option value="viewer">Viewer and up</option>
                <option value="editor">Editor and up</option>
                <option value="developer">Developer and up</option>
                <option value="admin">Admin only</option>
              </select>
            </div>
            <div class="space-y-1.5">
              <Label>Who can edit records</Label>
              <select v-model="setEditRole" class="h-9 w-full rounded-md border bg-background px-3 text-sm">
                <option value="viewer">Viewer and up</option>
                <option value="editor">Editor and up</option>
                <option value="developer">Developer and up</option>
                <option value="admin">Admin only</option>
              </select>
            </div>
          </div>
          <p class="text-xs text-muted-foreground">Personas: viewer reads · editor manages records · developer builds tables · admin does everything.</p>
          <Button size="sm" :disabled="updateEntity.isPending.value" @click="updateEntity.mutate()">Save changes</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-base">API endpoints</CardTitle>
          <CardDescription>Everything here is instantly available over REST.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-1 font-mono text-xs text-muted-foreground">
          <div>GET&nbsp;&nbsp;&nbsp;/api/data/{{ entity.slug }}</div>
          <div>POST&nbsp;&nbsp;/api/data/{{ entity.slug }}</div>
          <div>GET&nbsp;&nbsp;&nbsp;/api/data/{{ entity.slug }}/:id</div>
          <div>PUT&nbsp;&nbsp;&nbsp;/api/data/{{ entity.slug }}/:id</div>
          <div>DELETE&nbsp;/api/data/{{ entity.slug }}/:id</div>
        </CardContent>
      </Card>

      <Card class="border-destructive/50">
        <CardHeader class="pb-2">
          <CardTitle class="text-base text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger as-child>
              <Button variant="destructive" size="sm">Delete this table</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{{ entity.label }}”?</AlertDialogTitle>
                <AlertDialogDescription>Drops the Postgres table and permanently removes every record.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction @click="deleteEntity.mutate()">Delete forever</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>

    <!-- DELETE FIELD DIALOG -->
    <Dialog v-model:open="delOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{{ delTarget?.label }}”?</DialogTitle>
          <DialogDescription>Drops the column and its data on every row.</DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <p v-if="delError" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ delError }}
          </p>
          <div v-if="delAffected.length > 0" class="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            <div class="font-medium text-amber-700 dark:text-amber-400">This column is a connection key</div>
            <ul class="mt-1 list-disc pl-5 text-muted-foreground">
              <li v-for="a in delAffected" :key="a.fromSlug + a.fieldName">
                {{ a.fromLabel }}.{{ a.fieldName }}
              </li>
            </ul>
            <div class="mt-2 space-y-1.5">
              <Label>Repoint these connections to</Label>
              <select v-model="delReassign" class="h-9 w-full rounded-md border bg-background px-3 text-sm">
                <option v-for="o in replacementOptions" :key="o.name" :value="o.name">{{ o.label }} ({{ o.name }})</option>
                <option value="__id__">Record id (#id)</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="delOpen = false">Cancel</Button>
          <Button variant="destructive" :disabled="deleteField.isPending.value" @click="confirmDelete">Delete column</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ADD / EDIT FIELD DIALOG -->
    <Dialog v-model:open="dlgOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ dlgMode === "add" ? "Add field" : `Edit “${originalName}”` }}</DialogTitle>
          <DialogDescription>
            Column name must match ^[a-z][a-z0-9_]*$. Type changes re-cast existing data.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <p v-if="dlgError" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ dlgError }}
          </p>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>Label</Label>
              <Input v-model="fLabel" placeholder="e.g. Full Name" />
            </div>
            <div class="space-y-1.5">
              <Label>Column name</Label>
              <Input v-model="fName" placeholder="full_name" />
            </div>
          </div>

          <div class="space-y-1.5">
            <Label>Type</Label>
            <FieldTypePicker v-model="fType" />
          </div>

          <div v-if="fType === 'select'" class="space-y-1.5">
            <Label>Options (one per line)</Label>
            <Textarea v-model="fOptions" :placeholder="'New\nIn Progress\nWon\nLost'" :rows="4" />
          </div>

          <div v-if="fType === 'relation'" class="space-y-2">
            <div class="space-y-1.5">
              <Label>Connect to table</Label>
              <select
                v-model="fTarget"
                class="h-9 w-full rounded-md border bg-background px-3 text-sm"
                @change="fRelationKey = ''"
              >
                <option value="" disabled>Select target table…</option>
                <option v-for="e in relationTargets" :key="e.id" :value="e.slug">
                  {{ e.label }} ({{ e.slug }})
                </option>
              </select>
            </div>
            <div v-if="fTarget" class="space-y-1.5 rounded-md border bg-muted/40 p-3">
              <Label>Key column</Label>
              <select
                v-model="fRelationKey"
                class="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="" disabled>Pick the column to link on…</option>
                <option v-for="tf in targetFields(fTarget)" :key="tf.name" :value="tf.name">
                  {{ tf.label }} ({{ tf.name }})
                </option>
              </select>
              <p class="text-xs text-muted-foreground">
                Records of {{ fTarget }} will show up as a searchable dropdown using this column as their label.
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Checkbox id="f-required" v-model="fRequired" />
            <Label for="f-required">Required</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox id="f-in-detail" v-model="fInDetail" />
            <Label for="f-in-detail">Show on record page</Label>
          </div>
          <p class="text-xs text-muted-foreground">Hidden fields stay in the table and forms but not on the detail view.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="dlgOpen = false">Cancel</Button>
          <Button :disabled="saveField.isPending.value" @click="submitField">
            {{ dlgMode === "add" ? "Add field" : "Save changes" }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>

  <p v-else-if="!entitiesQuery.isLoading.value" class="text-sm text-muted-foreground">Table not found.</p>
</template>
