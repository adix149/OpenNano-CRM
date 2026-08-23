<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { api, type FieldType } from "@/lib/api";
import { slugify } from "@/lib/format";
import { devProjectId } from "@/lib/devState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import HierarchyCrumb from "@/components/HierarchyCrumb.vue";

interface TemplateField {
  name: string;
  label: string;
  type: FieldType;
  is_required?: boolean;
  options?: string[];
}
interface TableTemplate {
  id: string;
  name: string;
  description: string;
  entityLabel: string;
  fields: TemplateField[];
}

const TEMPLATES: TableTemplate[] = [
  { id: "blank", name: "Blank", description: "Start from scratch — add fields yourself.", entityLabel: "", fields: [] },
  {
    id: "companies",
    name: "Companies",
    description: "Accounts with industry and city.",
    entityLabel: "Companies",
    fields: [
      { name: "name", label: "Name", type: "text", is_required: true },
      { name: "website", label: "Website", type: "url" },
      { name: "industry", label: "Industry", type: "select", options: ["Software", "Manufacturing", "Retail", "Services", "Other"] },
      { name: "city", label: "City", type: "text" },
    ],
  },
  {
    id: "contacts",
    name: "Contacts",
    description: "People with email, phone and status.",
    entityLabel: "Contacts",
    fields: [
      { name: "full_name", label: "Full Name", type: "text", is_required: true },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Phone", type: "phone" },
      { name: "job_title", label: "Job Title", type: "text" },
      { name: "status", label: "Status", type: "select", options: ["Lead", "Active", "Dormant"] },
    ],
  },
  {
    id: "deals",
    name: "Deals (+ Companies & Contacts)",
    description: "Pipeline deals connected to companies and contacts via connection keys.",
    entityLabel: "Deals",
    fields: [
      { name: "title", label: "Title", type: "text", is_required: true },
      { name: "amount", label: "Amount", type: "decimal" },
      { name: "stage", label: "Stage", type: "select", options: ["Qualifying", "Proposal", "Negotiation", "Won", "Lost"] },
      { name: "close_date", label: "Close Date", type: "date" },
      { name: "company_id", label: "Company", type: "relation" },
      { name: "contact_id", label: "Contact", type: "relation" },
    ],
  },
];

const router = useRouter();
const queryClient = useQueryClient();
const error = ref("");
const dialogOpen = ref(false);
const creating = ref(false);
const progress = ref("");

const orgsQuery = useQuery({ queryKey: ["orgs"], queryFn: api.listOrgs });
const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities });
/** Tables for the active project + organization-wide tables of its owning org. */
const currentOrg = computed(() => {
  const p = (projectsQuery.data.value ?? []).find((x) => x.id === devProjectId.value);
  return p?.orgId ?? null;
});
const tables = computed(() =>
  (entitiesQuery.data.value ?? []).filter(
    (e) => e.projectId === devProjectId.value || (currentOrg.value !== null && e.orgId === currentOrg.value && !e.projectId),
  ),
);

// ── Scope selection: organization-wide vs project ──
const scopeKind = ref<"org" | "project">("project");
const scopeOrgId = ref<string>("");
const scopeProjectId = ref<string>("");

watch([orgsQuery.data, projectsQuery.data, dialogOpen], () => {
  if (scopeOrgId.value === "" && (orgsQuery.data.value ?? []).length > 0) {
    scopeOrgId.value = String(orgsQuery.data.value![0].id);
  }
  const current = devProjectId.value ? String(devProjectId.value) : "";
  const known = (projectsQuery.data.value ?? []).some((p) => String(p.id) === current);
  scopeProjectId.value = known && current ? current : String(projectsQuery.data.value?.[0]?.id ?? "");
}, { immediate: true });

function projectPath(id: number): string {
  const p = (projectsQuery.data.value ?? []).find((x) => x.id === id);
  if (!p) return "";
  const o = (orgsQuery.data.value ?? []).find((x) => x.id === p.orgId);
  return `${o?.name ?? "?"} › ${p.name}`;
}

function activeScope(): { orgId?: number; projectId?: number } {
  if (scopeKind.value === "org") {
    return { orgId: Number(scopeOrgId.value) };
  }
  return { projectId: Number(scopeProjectId.value) };
}

function activeOrg(): string {
  const id = Number(scopeKind.value === "org" ? scopeOrgId.value : scopeProjectId.value);
  const proj = (projectsQuery.data.value ?? []).find((x) => x.id === id);
  const orgId = scopeKind.value === "org" ? id : proj?.orgId;
  return (orgsQuery.data.value ?? []).find((o) => o.id === orgId)?.slug ?? "";
}


const newLabel = ref("");
const newSlug = ref("");
const slugTouched = ref(false);
const templateId = ref("blank");
const selected = computed(() => TEMPLATES.find((t) => t.id === templateId.value)!);

function onNameInput() {
  if (!slugTouched.value) newSlug.value = slugify(newLabel.value);
}

function targetSlug(): string {
  return selected.value.id === "blank" ? newSlug.value.trim() : slugify(selected.value.entityLabel);
}

async function ensureFields(orgSlug: string, slug: string, fields: TemplateField[], relationMap: Record<string, string> = {}) {
  const all = await api.listEntities();
  const ent = all.find((e) => e.orgSlug === orgSlug && e.slug === slug);
  if (!ent) throw new Error(`Entity ${slug} missing after creation`);
  for (const f of fields) {
    if (ent.fields.some((x) => x.name === f.name)) continue;
    progress.value = `Adding field ${f.label}…`;
    await api.addField(orgSlug, slug, {
      name: f.name,
      label: f.label,
      type: f.type,
      is_required: !!f.is_required,
      ...(f.options ? { options: f.options } : {}),
      ...(f.type === "relation" && relationMap[f.name] ? { relationEntitySlug: relationMap[f.name] } : {}),
    });
  }
}

async function submit() {
  error.value = "";
  const label = selected.value.entityLabel || newLabel.value.trim();
  const slug = targetSlug();
  if (!label || !slug) {
    error.value = "Table name and slug are required";
    return;
  }
  creating.value = true;
  try {
    const orgS = activeOrg();
    progress.value = "Creating table…";
    // Existence is scoped per org — same slug may exist in another org.
    const existsInOrg = entitiesQuery.data.value?.some((e) => e.orgSlug === orgS && e.slug === slug);
    if (!existsInOrg) await api.createEntity(slug, label, activeScope());

    if (templateId.value === "deals") {
      progress.value = "Ensuring Companies…";
      if (!entitiesQuery.data.value?.some((e) => e.orgSlug === orgS && e.slug === "companies")) {
        await api.createEntity("companies", "Companies", activeScope());
      }
      await ensureFields(orgS, "companies", TEMPLATES[1].fields);
      progress.value = "Ensuring Contacts…";
      if (!entitiesQuery.data.value?.some((e) => e.orgSlug === orgS && e.slug === "contacts")) {
        await api.createEntity("contacts", "Contacts", activeScope());
      }
      await ensureFields(orgS, "contacts", TEMPLATES[2].fields);
      await queryClient.invalidateQueries({ queryKey: ["entities"] });
      await ensureFields(orgS, slug, selected.value.fields, { company_id: "companies", contact_id: "contacts" });
    } else if (templateId.value !== "blank") {
      await ensureFields(orgS, slug, selected.value.fields);
    }

    await queryClient.invalidateQueries({ queryKey: ["entities"] });
    dialogOpen.value = false;
    newLabel.value = "";
    newSlug.value = "";
    slugTouched.value = false;
    templateId.value = "blank";
    router.push(`/dev/t/${slug}`);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    creating.value = false;
    progress.value = "";
  }
}

const deleteEntity = useMutation({
  mutationFn: (payload: { org: string; slug: string }) => api.deleteEntity(payload.org, payload.slug),
  onSuccess: async () => {
    error.value = "";
    await queryClient.invalidateQueries({ queryKey: ["entities"] });
  },
  onError: (err) => (error.value = err.message),
});
</script>

<template>
  <div class="space-y-4">
    <p v-if="error" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {{ error }}
    </p>

    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium uppercase text-muted-foreground">Tables</h2>
      <Button size="sm" @click="dialogOpen = true">+ New table</Button>
    </div>

    <div v-if="tables.length > 0" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <RouterLink v-for="t in tables" :key="t.id" :to="`/dev/t/${t.slug}`" class="group">
        <Card class="h-full transition-colors group-hover:border-primary/50">
          <CardHeader class="pb-2">
            <CardTitle class="text-base">{{ t.label }}</CardTitle>
            <CardDescription>
              <code>{{ t.slug }}</code>
              <HierarchyCrumb :org-id="t.orgId" :project-id="t.projectId" />
            </CardDescription>
          </CardHeader>
          <CardContent class="flex items-center justify-between text-xs text-muted-foreground">
            <span>{{ t.fields.length }} field(s)</span>
            <AlertDialog>
              <AlertDialogTrigger as-child>
                <Button variant="ghost" size="sm" class="h-6 px-2 text-destructive" @click.prevent>Delete</Button>
              </AlertDialogTrigger>
              <AlertDialogContent @click.stop>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{{ t.label }}”?</AlertDialogTitle>
                  <AlertDialogDescription>Drops its Postgres table and all records.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction @click="deleteEntity.mutate({ org: t.orgSlug || '', slug: t.slug })">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </RouterLink>
    </div>
    <p v-else-if="!entitiesQuery.isLoading.value" class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      No tables in this project yet — create one with a starter template.
    </p>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>New table</DialogTitle>
          <DialogDescription>Pick a starter template or begin blank. Forms build automatically from your fields.</DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="t in TEMPLATES"
              :key="t.id"
              type="button"
              :class="[
                'rounded-md border p-3 text-left transition-colors',
                templateId === t.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted',
              ]"
              @click="templateId = t.id"
            >
              <div class="text-sm font-medium">{{ t.name }}</div>
              <div class="text-xs text-muted-foreground">{{ t.description }}</div>
            </button>
          </div>

          <div class="space-y-1.5">
            <Label>Scope</Label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                :class="['rounded-md border px-3 py-2 text-left transition-colors', scopeKind === 'project' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted']"
                @click="scopeKind = 'project'"
              >
                <div class="text-sm font-medium">Project</div>
                <div class="text-xs text-muted-foreground">Nested under a project</div>
              </button>
              <button
                type="button"
                :class="['rounded-md border px-3 py-2 text-left transition-colors', scopeKind === 'org' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted']"
                @click="scopeKind = 'org'"
              >
                <div class="text-sm font-medium">Organization-wide</div>
                <div class="text-xs text-muted-foreground">Shared across all projects</div>
              </button>
            </div>
            <select
              v-if="scopeKind === 'project'"
              v-model="scopeProjectId"
              class="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option v-for="p in projectsQuery.data.value ?? []" :key="p.id" :value="String(p.id)">
                {{ projectPath(p.id) }}
              </option>
            </select>
            <select
              v-else
              v-model="scopeOrgId"
              class="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option v-for="o in orgsQuery.data.value ?? []" :key="o.id" :value="String(o.id)">
                {{ o.name }} ({{ o.slug }})
              </option>
            </select>
          </div>

          <div v-if="templateId === 'blank'" class="space-y-3">
            <div class="space-y-1.5">
              <Label>Table name</Label>
              <Input v-model="newLabel" placeholder="e.g. Contacts" @input="onNameInput" />
            </div>
            <div class="space-y-1.5">
              <Label>Slug</Label>
              <Input v-model="newSlug" placeholder="contacts" @input="slugTouched = true" />
              <p class="text-xs text-muted-foreground">Postgres table name. Must match ^[a-z][a-z0-9_]*$ · unique within the org.</p>
            </div>
          </div>
          <p v-else class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Creates <code>{{ targetSlug() }}</code> with {{ selected.fields.length }} ready-made field(s).
          </p>

          <p v-if="progress" class="text-sm text-muted-foreground">{{ progress }}</p>
          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">Cancel</Button>
          <Button :disabled="creating" @click="submit">{{ creating ? "Working…" : "Create table" }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
