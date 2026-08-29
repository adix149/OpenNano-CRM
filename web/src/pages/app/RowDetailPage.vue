<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { api, type Entity } from "@/lib/api";
import { rowDisplayLabel } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { hasPersona } from "@/lib/personas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import RelationCell from "@/components/RelationCell.vue";
import LinkedRecords from "@/components/LinkedRecords.vue";

const route = useRoute();
const router = useRouter();
const slug = route.params.slug as string;
const rowId = Number(route.params.id);
const queryClient = useQueryClient();
const { user } = useAuth();

const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities });
const entity = computed<Entity | undefined>(() => entitiesQuery.data.value?.find((e) => e.slug === slug));
const mayEdit = computed(() => (entity.value ? hasPersona(user.value?.role, entity.value.editRole ?? "editor") : false));

const rowQuery = useQuery({
  queryKey: ["rows", entity.value?.orgSlug ?? "", slug, rowId],
  queryFn: () => api.getRow(entity.value!.orgSlug!, slug, rowId),
  enabled: computed(() => Boolean(entity.value?.orgSlug)),
});

const viewsQuery = useQuery({
  queryKey: ["views", entity.value?.orgSlug ?? "", slug],
  queryFn: () => api.listViews(entity.value!.orgSlug!, slug),
  enabled: computed(() => Boolean(entity.value?.orgSlug)),
});

const row = computed<Record<string, unknown> | undefined>(() => {
  const r = rowQuery.data.value as Record<string, unknown> | undefined;
  return Array.isArray(r) ? r[0] : r;
});

/** Fields the developer marked visible for the record page. */
const detailFields = computed(() =>
  (entity.value?.fields ?? []).filter((f) => f.inDetail !== false),
);

const incoming = computed(() =>
  !entity.value
    ? []
    : (entitiesQuery.data.value ?? [])
        .filter((e) => e.id !== entity.value!.id)
        .flatMap((e) => e.fields.filter((f) => f.relationEntityId === entity.value!.id).map((f) => ({ source: e, field: f }))),
);

function fmt(fType: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (fType === "boolean") return v ? "Yes" : "No";
  if (fType === "date") return String(v).slice(0, 10);
  if (fType === "datetime") return String(v).slice(0, 16).replace("T", " ");
  return String(v);
}

const title = computed(() => {
  const r = row.value;
  return r ? rowDisplayLabel(entity.value, r) : `#${rowId}`;
});

const deleteRow = useMutation({
  mutationFn: () => api.deleteRow(entity.value!.orgSlug!, slug, rowId),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ["rows"] });
    router.push(`/data/${slug}`);
  },
});

const pdfView = computed(() => viewsQuery.data.value?.find((view: any) => view.kind === "pdf"));

function printRecord() {
  window.print();
}

async function downloadPdf() {
  if (!pdfView.value || !entity.value?.orgSlug) return;
  const blob = await api.viewPdf(entity.value.orgSlug, slug, pdfView.value.slug, rowId);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug}-${rowId}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="record-print-page space-y-5" v-if="entity && row">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <RouterLink :to="`/data/${slug}`" class="text-sm text-muted-foreground hover:underline">&larr; {{ entity.label }}</RouterLink>
        <h1 class="truncate text-2xl font-semibold tracking-tight">{{ title }}</h1>
      </div>
      <div class="flex shrink-0 flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" @click="printRecord">Print</Button>
        <Button v-if="pdfView" variant="outline" size="sm" :disabled="viewsQuery.isFetching.value" @click="downloadPdf">Download PDF</Button>
        <RouterLink v-else-if="mayEdit" to="/dev" class="self-center text-xs text-muted-foreground hover:underline">Create a PDF template in Dev Studio</RouterLink>
      </div>
      <div v-if="mayEdit" class="flex shrink-0 gap-2 print:hidden">
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="`/data/${slug}/${rowId}/edit`">Edit</RouterLink>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger as-child>
            <Button variant="destructive" size="sm">Delete</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this record?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction @click="deleteRow.mutate()">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>

    <div class="grid items-start gap-5 lg:grid-cols-3">
      <Card class="lg:col-span-2">
        <CardHeader class="pb-2"><CardTitle class="text-base">Fields</CardTitle></CardHeader>
        <CardContent>
          <dl class="divide-y">
            <div v-for="f in detailFields" :key="f.id" class="grid grid-cols-3 gap-3 py-2.5 text-sm">
              <dt class="text-muted-foreground">{{ f.label }}</dt>
              <dd class="col-span-2 min-w-0 break-words">
                <RelationCell v-if="f.type === 'relation'" :target-id="f.relationEntityId" :value="row[f.name]" />
                <template v-else>{{ fmt(f.type, row[f.name]) }}</template>
                <Badge v-if="f.isRequired" variant="outline" class="ml-2 h-4 px-1 text-[10px] uppercase">required</Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2"><CardTitle class="text-base">Record info</CardTitle></CardHeader>
        <CardContent class="space-y-2 text-sm">
          <div class="flex justify-between gap-3">
            <span class="text-muted-foreground">Record ID</span>
            <code>#{{ row.id }}</code>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-muted-foreground">Created at</span>
            <span>{{ String(row.created_at ?? "").slice(0, 19).replace("T", " ") }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-muted-foreground">Table</span>
            <code>{{ entity.slug }}</code>
          </div>
        </CardContent>
      </Card>
    </div>

    <div v-if="incoming.length > 0" class="space-y-3 print:hidden">
      <h2 class="text-sm font-medium uppercase text-muted-foreground">Linked records</h2>
      <div class="grid gap-4 md:grid-cols-2">
        <Card v-for="item in incoming" :key="item.source.id + item.field.name" class="p-4">
          <LinkedRecords :source="item.source" :field="item.field" :record-id="rowId" />
        </Card>
      </div>
    </div>
  </div>

  <p v-else-if="!entitiesQuery.isLoading.value && !rowQuery.isLoading.value" class="text-sm text-muted-foreground">
    Record not found.
  </p>
</template>
